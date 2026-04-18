import { fromZonedTime } from "date-fns-tz";
import {
  buildDeadlineKey,
  claimReminderForSending,
  listPendingReminders,
  markReminderFailed,
  markReminderPastDue,
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
 * Resend API errors expose:
 *   - `code` (string): provider error name such as `invalid_api_key`
 *   - `statusCode` (number): HTTP-ish status code when available
 *
 * Network errors from fetch/undici also commonly expose `code`
 * (ECONNREFUSED, ETIMEDOUT, etc.). Those should be retried.
 */
const TRANSIENT_ERROR_CODES = new Set([
  "application_error",
  "concurrent_idempotent_requests",
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EAI_AGAIN",
  "ENOTFOUND",
  "ESOCKET",
  "ETIMEDOUT",
  "internal_server_error",
  "rate_limit_exceeded",
  "UND_ERR_CONNECT_TIMEOUT",
]);

const TERMINAL_ERROR_CODES = new Set([
  "daily_quota_exceeded",
  "invalid_access",
  "invalid_api_key",
  "invalid_attachment",
  "invalid_from_address",
  "invalid_idempotency_key",
  "invalid_idempotent_request",
  "invalid_parameter",
  "invalid_region",
  "method_not_allowed",
  "missing_api_key",
  "missing_required_field",
  "monthly_quota_exceeded",
  "not_found",
  "restricted_api_key",
  "security_error",
  "validation_error",
]);

export function isTransientEmailError(error: unknown): boolean {
  if (!(error instanceof Error)) return true; // unknown → assume transient

  const errorCode = (error as { code?: string }).code;
  if (typeof errorCode === "string") {
    if (TRANSIENT_ERROR_CODES.has(errorCode)) return true;
    if (TERMINAL_ERROR_CODES.has(errorCode)) return false;
  }

  const statusCode = (error as { statusCode?: number | null }).statusCode;
  if (typeof statusCode === "number") {
    if (statusCode === 408 || statusCode === 429 || statusCode >= 500) {
      return true;
    }
    if (statusCode >= 400) {
      return false;
    }
  }

  // Unknown errors are treated as transient so temporary provider/network
  // issues can be retried on the next scheduler tick.
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

    // Deadline already passed — mark as past_due so it stops being queried.
    if (timeUntilDeadline <= 0) {
      const deadlineKey = buildDeadlineKey(
        candidate.assignmentDueDate,
        candidate.assignmentDueTime
      );
      markReminderPastDue(candidate.documentId, deadlineKey);
      logger.info("Marked reminder past due — deadline already passed", {
        documentId: candidate.documentId,
        dueDate: candidate.assignmentDueDate,
        dueTime: candidate.assignmentDueTime,
      });
      continue;
    }

    // Not yet within the 24-hour reminder window
    if (timeUntilDeadline > REMINDER_WINDOW_MS) {
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
        // sendEmail returns false only when Resend is not configured. Treat it
        // as retryable so a corrected runtime config can self-heal.
        markReminderPendingRetry(candidate.documentId, deadlineKey, "Email send returned false — Resend not configured");
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
