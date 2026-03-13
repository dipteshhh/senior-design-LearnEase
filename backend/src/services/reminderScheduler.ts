import { fromZonedTime } from "date-fns-tz";
import {
  buildDeadlineKey,
  claimReminderForSending,
  listPendingReminders,
  markReminderFailed,
  markReminderPendingRetry,
  markReminderSent,
  markReminderSkipped,
} from "../store/memoryStore.js";
import { sendEmail, isEmailConfigured } from "../lib/email.js";
import { logger } from "../lib/logger.js";

const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

const DEFAULT_TIMEZONE = "America/New_York";

export function getAppTimezone(): string {
  return process.env.APP_TIMEZONE?.trim() || DEFAULT_TIMEZONE;
}

/**
 * Build a UTC Date from YYYY-MM-DD and HH:MM interpreted in the application timezone.
 * Uses fromZonedTime: given a "wall-clock" datetime in the app TZ, returns the UTC instant.
 */
export function buildDeadlineDatetime(dueDate: string, dueTime: string): Date | null {
  try {
    const wallClock = new Date(`${dueDate}T${dueTime}:00`);
    if (Number.isNaN(wallClock.getTime())) return null;
    const utc = fromZonedTime(wallClock, getAppTimezone());
    if (Number.isNaN(utc.getTime())) return null;
    return utc;
  } catch {
    return null;
  }
}

export function formatDueDate(iso: string): string {
  try {
    const [year, month, day] = iso.split("-").map(Number);
    const d = new Date(year, month - 1, day);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function formatDueTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${m.toString().padStart(2, "0")} ${period}`;
}

export function getReminderSubject(timeUntilDeadlineMs: number): string {
  if (timeUntilDeadlineMs < TWELVE_HOURS_MS) {
    return "Reminder: Homework due soon";
  }
  return "Reminder: Homework due tomorrow";
}

/**
 * Returns the current UTC timestamp. Exported for testability.
 */
export function getNowMs(): number {
  return Date.now();
}

/**
 * SMTP response codes in the 5xx range indicate permanent failures
 * (bad recipient, auth rejected, policy block, etc.).
 * Codes in the 4xx range and network/timeout errors are transient.
 *
 * Nodemailer errors from transport.sendMail expose:
 *   - `responseCode` (number): the SMTP status code, if the server replied
 *   - `code` (string): e.g. 'ECONNREFUSED', 'ETIMEDOUT', 'ESOCKET'
 *
 * When sendEmail returns false (SMTP not configured), the caller handles
 * that separately — it never reaches this classifier.
 */
const TERMINAL_SMTP_CODES = new Set([
  550, // mailbox unavailable / not found
  551, // user not local
  552, // exceeded storage allocation
  553, // mailbox name not allowed
  554, // transaction failed (permanent)
  555, // syntax error in parameters
]);

const TERMINAL_ERROR_CODES = new Set([
  "EAUTH",       // authentication failed permanently
  "EENVELOPE",   // bad envelope (invalid address format)
]);

export function isTransientEmailError(error: unknown): boolean {
  if (!(error instanceof Error)) return true; // unknown → assume transient

  const smtpCode = (error as { responseCode?: number }).responseCode;
  if (typeof smtpCode === "number") {
    return !TERMINAL_SMTP_CODES.has(smtpCode);
  }

  const errorCode = (error as { code?: string }).code;
  if (typeof errorCode === "string" && TERMINAL_ERROR_CODES.has(errorCode)) {
    return false;
  }

  // Network errors (ECONNREFUSED, ETIMEDOUT, ESOCKET, etc.) are transient
  return true;
}

export function checkAndSendReminders(nowOverride?: Date): void {
  if (!isEmailConfigured()) {
    return;
  }

  const candidates = listPendingReminders();
  if (candidates.length === 0) return;

  const nowMs = nowOverride ? nowOverride.getTime() : getNowMs();

  for (const candidate of candidates) {
    if (!candidate.userEmail) {
      const key = buildDeadlineKey(
        candidate.assignmentDueDate,
        candidate.assignmentDueTime
      );
      markReminderSkipped(candidate.documentId, key, "No email address for user");
      logger.warn("Skipped reminder permanently — no email for user", {
        documentId: candidate.documentId,
        userId: candidate.userId,
      });
      continue;
    }

    const deadline = buildDeadlineDatetime(
      candidate.assignmentDueDate,
      candidate.assignmentDueTime
    );
    if (!deadline) {
      logger.warn("Skipping reminder — invalid deadline datetime", {
        documentId: candidate.documentId,
        dueDate: candidate.assignmentDueDate,
        dueTime: candidate.assignmentDueTime,
      });
      continue;
    }

    const timeUntilDeadline = deadline.getTime() - nowMs;

    // Only send if deadline is within the next 24 hours and hasn't passed
    if (timeUntilDeadline <= 0 || timeUntilDeadline > REMINDER_WINDOW_MS) {
      continue;
    }

    const deadlineKey = buildDeadlineKey(
      candidate.assignmentDueDate,
      candidate.assignmentDueTime
    );

    // Atomically claim — if another tick already claimed this, skip it.
    if (!claimReminderForSending(candidate.documentId, deadlineKey)) {
      continue;
    }

    const formattedDate = formatDueDate(candidate.assignmentDueDate);
    const formattedTime = formatDueTime(candidate.assignmentDueTime);
    const subject = getReminderSubject(timeUntilDeadline);

    void sendEmail({
      to: candidate.userEmail,
      subject,
      text: [
        `Hi,`,
        ``,
        `Quick reminder that your assignment is due soon.`,
        ``,
        `Assignment: ${candidate.filename}`,
        `Due Date: ${formattedDate}`,
        `Due Time: ${formattedTime}`,
        ``,
        `Review your study guide in LearnEase to stay prepared.`,
      ].join("\n"),
    }).then((sent) => {
      if (sent) {
        markReminderSent(candidate.documentId, deadlineKey);
      } else {
        // sendEmail returns false only when SMTP is not configured — terminal
        markReminderFailed(candidate.documentId, deadlineKey, "Email send returned false — SMTP not configured");
      }
    }).catch((error: unknown) => {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (isTransientEmailError(error)) {
        markReminderPendingRetry(candidate.documentId, deadlineKey, errorMsg);
        logger.warn("Reminder send failed (transient, will retry)", {
          documentId: candidate.documentId,
          error: errorMsg,
        });
      } else {
        markReminderFailed(candidate.documentId, deadlineKey, errorMsg);
        logger.error("Reminder send failed (terminal)", {
          documentId: candidate.documentId,
          error: errorMsg,
        });
      }
    });
  }
}
