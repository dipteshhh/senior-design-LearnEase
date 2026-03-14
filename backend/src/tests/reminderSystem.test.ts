import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import type { DocumentRecord } from "../store/memoryStore.js";

// ── Isolated DB setup ────────────────────────────────────────────────

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "learnease-reminder-"));
process.env.DATABASE_PATH = path.join(tmpDir, "test.sqlite");
process.env.ARTIFACTS_DIR = path.join(tmpDir, "artifacts");
process.env.FILE_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
process.env.APP_TIMEZONE = "America/New_York";
// Dummy SMTP config so isEmailConfigured() returns true inside scheduler tests.
// The transport will be created but never successfully sends (no real server).
process.env.SMTP_HOST = "localhost";
process.env.SMTP_PORT = "2525";
process.env.SMTP_USER = "test";
process.env.SMTP_PASS = "test";

const sqlite = await import("../db/sqlite.js");
const store = await import("../store/memoryStore.js");

sqlite.initializeDatabase();

// ── Helpers ──────────────────────────────────────────────────────────

let docCounter = 0;

function makeHomeworkDoc(
  overrides: Partial<DocumentRecord> = {}
): DocumentRecord {
  docCounter++;
  const id = `reminder-test-${docCounter.toString().padStart(4, "0")}`;
  return {
    id,
    userId: "reminder-user",
    userEmail: "student@example.com",
    filename: `homework-${docCounter}.pdf`,
    fileType: "PDF",
    documentType: "HOMEWORK",
    status: "ready",
    uploadedAt: new Date().toISOString(),
    pageCount: 1,
    paragraphCount: 3,
    extractedText: "Homework due February 1, 2026.",
    studyGuide: null,
    studyGuideStatus: "idle",
    studyGuideErrorCode: null,
    studyGuideErrorMessage: null,
    quiz: null,
    quizStatus: "idle",
    quizErrorCode: null,
    quizErrorMessage: null,
    errorCode: null,
    errorMessage: null,
    assignmentDueDate: null,
    assignmentDueTime: null,
    reminderOptIn: false,
    reminderStatus: "pending",
    reminderDeadlineKey: null,
    reminderLastError: null,
    reminderAttemptedAt: null,
    ...overrides,
  };
}

function makeLectureDoc(
  overrides: Partial<DocumentRecord> = {}
): DocumentRecord {
  docCounter++;
  const id = `reminder-test-${docCounter.toString().padStart(4, "0")}`;
  return {
    id,
    userId: "reminder-user",
    userEmail: "student@example.com",
    filename: `lecture-${docCounter}.pdf`,
    fileType: "PDF",
    documentType: "LECTURE",
    status: "ready",
    uploadedAt: new Date().toISOString(),
    pageCount: 5,
    paragraphCount: 10,
    extractedText: "Lecture slides for week 3.",
    studyGuide: null,
    studyGuideStatus: "idle",
    studyGuideErrorCode: null,
    studyGuideErrorMessage: null,
    quiz: null,
    quizStatus: "idle",
    quizErrorCode: null,
    quizErrorMessage: null,
    errorCode: null,
    errorMessage: null,
    assignmentDueDate: null,
    assignmentDueTime: null,
    reminderOptIn: false,
    reminderStatus: "pending",
    reminderDeadlineKey: null,
    reminderLastError: null,
    reminderAttemptedAt: null,
    ...overrides,
  };
}

// ── Scheduler helper imports ─────────────────────────────────────────

const {
  buildDeadlineDatetime,
  checkAndSendReminders,
  formatDueTime,
  getReminderSubject,
  getAppTimezone,
  isTransientEmailError,
} = await import("../services/reminderScheduler.js");

// ══════════════════════════════════════════════════════════════════════
// TESTS: Reminder store functions
// ══════════════════════════════════════════════════════════════════════

test("listPendingReminders returns homework with due date + time and pending status", () => {
  const doc = makeHomeworkDoc({
    assignmentDueDate: "2099-12-31",
    assignmentDueTime: "23:59",
    reminderOptIn: true,
  });
  store.saveDocument(doc);

  const candidates = store.listPendingReminders();
  const match = candidates.find((c) => c.documentId === doc.id);
  assert.ok(match, "Should find the homework document in pending reminders");
  assert.equal(match.assignmentDueDate, "2099-12-31");
  assert.equal(match.assignmentDueTime, "23:59");
});

test("listPendingReminders excludes homework without due date", () => {
  const doc = makeHomeworkDoc({ assignmentDueTime: "12:00" });
  store.saveDocument(doc);

  const candidates = store.listPendingReminders();
  const match = candidates.find((c) => c.documentId === doc.id);
  assert.equal(match, undefined, "Should not appear — no due date");
});

test("listPendingReminders excludes homework without due time", () => {
  const doc = makeHomeworkDoc({ assignmentDueDate: "2099-06-15" });
  store.saveDocument(doc);

  const candidates = store.listPendingReminders();
  const match = candidates.find((c) => c.documentId === doc.id);
  assert.equal(match, undefined, "Should not appear — no due time");
});

test("listPendingReminders excludes LECTURE documents", () => {
  const doc = makeLectureDoc({
    assignmentDueDate: "2099-12-31",
    assignmentDueTime: "23:59",
  });
  store.saveDocument(doc);

  const candidates = store.listPendingReminders();
  const match = candidates.find((c) => c.documentId === doc.id);
  assert.equal(match, undefined, "Lecture documents should never appear");
});

test("listPendingReminders excludes already-sent reminders for same deadline", () => {
  const doc = makeHomeworkDoc({
    assignmentDueDate: "2099-12-31",
    assignmentDueTime: "14:00",
    reminderStatus: "sent",
    reminderDeadlineKey: "2099-12-31T14:00",
  });
  store.saveDocument(doc);

  const candidates = store.listPendingReminders();
  const match = candidates.find((c) => c.documentId === doc.id);
  assert.equal(match, undefined, "Sent reminder for same deadline should be excluded");
});

test("listPendingReminders excludes reminders currently being sent", () => {
  const doc = makeHomeworkDoc({
    assignmentDueDate: "2099-12-31",
    assignmentDueTime: "14:00",
    reminderStatus: "sending",
    reminderDeadlineKey: "2099-12-31T14:00",
  });
  store.saveDocument(doc);

  const candidates = store.listPendingReminders();
  const match = candidates.find((c) => c.documentId === doc.id);
  assert.equal(match, undefined, "Sending-state reminder should be excluded");
});

test("listPendingReminders excludes failed (terminal) reminders", () => {
  const doc = makeHomeworkDoc({
    assignmentDueDate: "2099-12-31",
    assignmentDueTime: "14:00",
    reminderStatus: "failed",
    reminderDeadlineKey: "2099-12-31T14:00",
    reminderLastError: "550 mailbox not found",
  });
  store.saveDocument(doc);

  const candidates = store.listPendingReminders();
  const match = candidates.find((c) => c.documentId === doc.id);
  assert.equal(match, undefined, "Failed (terminal) reminder should not be retried");
});

test("listPendingReminders excludes skipped (terminal) reminders", () => {
  const doc = makeHomeworkDoc({
    assignmentDueDate: "2099-12-31",
    assignmentDueTime: "14:00",
    reminderStatus: "skipped",
    reminderDeadlineKey: "2099-12-31T14:00",
    reminderLastError: "No email address for user",
  });
  store.saveDocument(doc);

  const candidates = store.listPendingReminders();
  const match = candidates.find((c) => c.documentId === doc.id);
  assert.equal(match, undefined, "Skipped (terminal) reminder should not be retried");
});

test("listPendingReminders includes pending reminders with deadline key from prior transient failure", () => {
  const doc = makeHomeworkDoc({
    assignmentDueDate: "2099-12-31",
    assignmentDueTime: "14:00",
    reminderOptIn: true,
    reminderStatus: "pending",
    reminderDeadlineKey: "2099-12-31T14:00",
    reminderLastError: "ETIMEDOUT",
  });
  store.saveDocument(doc);

  const candidates = store.listPendingReminders();
  const match = candidates.find((c) => c.documentId === doc.id);
  assert.ok(match, "Pending reminder (reset after transient failure) should be retryable");
});

// ══════════════════════════════════════════════════════════════════════
// TESTS: Atomic claiming
// ══════════════════════════════════════════════════════════════════════

test("claimReminderForSending transitions pending → sending and prevents double claim", () => {
  const doc = makeHomeworkDoc({
    assignmentDueDate: "2099-06-01",
    assignmentDueTime: "09:00",
    reminderOptIn: true,
  });
  store.saveDocument(doc);

  const deadlineKey = store.buildDeadlineKey("2099-06-01", "09:00");

  const claimed = store.claimReminderForSending(doc.id, deadlineKey);
  assert.equal(claimed, true, "First claim should succeed");

  const claimedAgain = store.claimReminderForSending(doc.id, deadlineKey);
  assert.equal(claimedAgain, false, "Second claim should fail — already in 'sending'");
});

test("claimReminderForSending rejects failed (terminal) reminders", () => {
  const doc = makeHomeworkDoc({
    assignmentDueDate: "2099-07-01",
    assignmentDueTime: "10:00",
    reminderStatus: "failed",
    reminderDeadlineKey: "2099-07-01T10:00",
    reminderLastError: "550 mailbox not found",
  });
  store.saveDocument(doc);

  const deadlineKey = store.buildDeadlineKey("2099-07-01", "10:00");
  const claimed = store.claimReminderForSending(doc.id, deadlineKey);
  assert.equal(claimed, false, "Failed (terminal) reminder should not be claimable");
});

test("claimReminderForSending fails when deadline changed since snapshot (race guard)", () => {
  const doc = makeHomeworkDoc({
    assignmentDueDate: "2099-07-01",
    assignmentDueTime: "10:00",
  });
  store.saveDocument(doc);

  // Simulate: scheduler snapshot says deadline is 10:00, but user changes it to 16:00
  store.updateAssignmentDueTime(doc.id, "16:00");

  const staleKey = store.buildDeadlineKey("2099-07-01", "10:00");
  const claimed = store.claimReminderForSending(doc.id, staleKey);
  assert.equal(claimed, false, "Claim should fail — stored deadline no longer matches snapshot");
});

// ══════════════════════════════════════════════════════════════════════
// TESTS: markReminderSent / markReminderFailed
// ══════════════════════════════════════════════════════════════════════

test("markReminderSent transitions to sent state", () => {
  const doc = makeHomeworkDoc({
    assignmentDueDate: "2099-08-01",
    assignmentDueTime: "11:00",
    reminderOptIn: true,
  });
  store.saveDocument(doc);

  const deadlineKey = store.buildDeadlineKey("2099-08-01", "11:00");
  store.claimReminderForSending(doc.id, deadlineKey);

  const marked = store.markReminderSent(doc.id, deadlineKey);
  assert.equal(marked, true);

  const updated = store.getDocument(doc.id);
  assert.ok(updated);
  assert.equal(updated.reminderStatus, "sent");
  assert.equal(updated.reminderDeadlineKey, deadlineKey);
});

test("markReminderFailed transitions to failed state and stores error", () => {
  const doc = makeHomeworkDoc({
    assignmentDueDate: "2099-09-01",
    assignmentDueTime: "12:00",
    reminderOptIn: true,
  });
  store.saveDocument(doc);

  const deadlineKey = store.buildDeadlineKey("2099-09-01", "12:00");
  store.claimReminderForSending(doc.id, deadlineKey);

  const marked = store.markReminderFailed(doc.id, deadlineKey, "SMTP error");
  assert.equal(marked, true);

  const updated = store.getDocument(doc.id);
  assert.ok(updated);
  assert.equal(updated.reminderStatus, "failed");
  assert.equal(updated.reminderLastError, "SMTP error");
});

// ══════════════════════════════════════════════════════════════════════
// TESTS: Deadline change resets reminder state
// ══════════════════════════════════════════════════════════════════════

test("updateAssignmentDueDate resets reminder state", () => {
  const doc = makeHomeworkDoc({
    assignmentDueDate: "2099-10-01",
    assignmentDueTime: "14:00",
    reminderStatus: "sent",
    reminderDeadlineKey: "2099-10-01T14:00",
  });
  store.saveDocument(doc);

  store.updateAssignmentDueDate(doc.id, "2099-10-15");

  const updated = store.getDocument(doc.id);
  assert.ok(updated);
  assert.equal(updated.assignmentDueDate, "2099-10-15");
  assert.equal(updated.reminderStatus, "pending");
  assert.equal(updated.reminderDeadlineKey, null);
  assert.equal(updated.reminderLastError, null);
});

test("updateAssignmentDueTime resets reminder state", () => {
  const doc = makeHomeworkDoc({
    assignmentDueDate: "2099-11-01",
    assignmentDueTime: "14:00",
    reminderStatus: "sent",
    reminderDeadlineKey: "2099-11-01T14:00",
  });
  store.saveDocument(doc);

  store.updateAssignmentDueTime(doc.id, "16:00");

  const updated = store.getDocument(doc.id);
  assert.ok(updated);
  assert.equal(updated.assignmentDueTime, "16:00");
  assert.equal(updated.reminderStatus, "pending");
  assert.equal(updated.reminderDeadlineKey, null);
});

test("changing deadline after sent allows new reminder to be picked up", () => {
  const doc = makeHomeworkDoc({
    assignmentDueDate: "2099-03-01",
    assignmentDueTime: "08:00",
    reminderOptIn: true,
    reminderStatus: "sent",
    reminderDeadlineKey: "2099-03-01T08:00",
  });
  store.saveDocument(doc);

  // Change the due time → resets to pending
  store.updateAssignmentDueTime(doc.id, "20:00");

  const candidates = store.listPendingReminders();
  const match = candidates.find((c) => c.documentId === doc.id);
  assert.ok(match, "After deadline change, document should reappear in pending reminders");
});

// ══════════════════════════════════════════════════════════════════════
// TESTS: recoverStuckReminders
// ══════════════════════════════════════════════════════════════════════

test("recoverStuckReminders transitions sending → pending for retry", () => {
  const doc = makeHomeworkDoc({
    assignmentDueDate: "2099-04-01",
    assignmentDueTime: "09:00",
    reminderStatus: "sending",
    reminderDeadlineKey: "2099-04-01T09:00",
  });
  store.saveDocument(doc);

  const recovered = store.recoverStuckReminders();
  assert.ok(recovered >= 1, "Should recover at least one stuck reminder");

  const updated = store.getDocument(doc.id);
  assert.ok(updated);
  assert.equal(updated.reminderStatus, "pending");
  assert.equal(updated.reminderLastError, "Interrupted by server restart");
});

// ══════════════════════════════════════════════════════════════════════
// TESTS: Scheduler utility functions
// ══════════════════════════════════════════════════════════════════════

test("buildDeadlineDatetime returns a valid Date for valid inputs", () => {
  const d = buildDeadlineDatetime("2099-06-15", "14:30");
  assert.ok(d, "Should return a Date");
  assert.ok(d.getTime() > 0, "Should be a valid timestamp");
});

test("buildDeadlineDatetime returns null for invalid inputs", () => {
  assert.equal(buildDeadlineDatetime("invalid", "14:30"), null);
  assert.equal(buildDeadlineDatetime("2099-06-15", "invalid"), null);
});

test("getAppTimezone returns configured timezone", () => {
  assert.equal(getAppTimezone(), "America/New_York");
});

test("formatDueTime formats correctly", () => {
  assert.equal(formatDueTime("14:30"), "2:30 PM");
  assert.equal(formatDueTime("00:00"), "12:00 AM");
  assert.equal(formatDueTime("12:00"), "12:00 PM");
  assert.equal(formatDueTime("09:05"), "9:05 AM");
});

test("getReminderSubject returns 'due tomorrow' for 12-24h window", () => {
  const fifteenHours = 15 * 60 * 60 * 1000;
  assert.equal(getReminderSubject(fifteenHours), "Reminder: Homework due tomorrow");
});

test("getReminderSubject returns 'due soon' for <12h window", () => {
  const sixHours = 6 * 60 * 60 * 1000;
  assert.equal(getReminderSubject(sixHours), "Reminder: Homework due soon");
});

test("getReminderSubject returns 'due soon' at exactly 0ms remaining", () => {
  assert.equal(getReminderSubject(1), "Reminder: Homework due soon");
});

// ══════════════════════════════════════════════════════════════════════
// TESTS: buildDeadlineKey
// ══════════════════════════════════════════════════════════════════════

test("buildDeadlineKey produces expected format", () => {
  assert.equal(store.buildDeadlineKey("2099-06-15", "14:30"), "2099-06-15T14:30");
});

// ══════════════════════════════════════════════════════════════════════
// TESTS: markReminderPendingRetry (transient failure → retryable)
// ══════════════════════════════════════════════════════════════════════

test("markReminderPendingRetry transitions sending → pending and preserves error", () => {
  const doc = makeHomeworkDoc({
    assignmentDueDate: "2099-05-01",
    assignmentDueTime: "15:00",
    reminderOptIn: true,
  });
  store.saveDocument(doc);

  const deadlineKey = store.buildDeadlineKey("2099-05-01", "15:00");
  store.claimReminderForSending(doc.id, deadlineKey);

  const marked = store.markReminderPendingRetry(doc.id, deadlineKey, "ETIMEDOUT");
  assert.equal(marked, true);

  const updated = store.getDocument(doc.id);
  assert.ok(updated);
  assert.equal(updated.reminderStatus, "pending");
  assert.equal(updated.reminderDeadlineKey, deadlineKey);
  assert.equal(updated.reminderLastError, "ETIMEDOUT");
  assert.ok(updated.reminderAttemptedAt, "Should have recorded attempt timestamp");
});

test("transient failure round-trip: claim → pendingRetry → re-select → re-claim", () => {
  const doc = makeHomeworkDoc({
    assignmentDueDate: "2099-05-15",
    assignmentDueTime: "10:00",
    reminderOptIn: true,
  });
  store.saveDocument(doc);

  const deadlineKey = store.buildDeadlineKey("2099-05-15", "10:00");

  // First attempt: claim
  assert.equal(store.claimReminderForSending(doc.id, deadlineKey), true);

  // Transient failure: back to pending
  store.markReminderPendingRetry(doc.id, deadlineKey, "ECONNREFUSED");

  // Should re-appear in pending list (deadline key matches but status is pending)
  const candidates = store.listPendingReminders();
  const match = candidates.find((c) => c.documentId === doc.id);
  assert.ok(match, "Should reappear in pending after transient failure");

  // Second attempt: re-claim should succeed
  assert.equal(store.claimReminderForSending(doc.id, deadlineKey), true);

  // Mark as sent this time
  store.markReminderSent(doc.id, deadlineKey);
  const final = store.getDocument(doc.id);
  assert.ok(final);
  assert.equal(final.reminderStatus, "sent");
});

// ══════════════════════════════════════════════════════════════════════
// TESTS: isTransientEmailError classification
// ══════════════════════════════════════════════════════════════════════

test("isTransientEmailError: network errors are transient", () => {
  const err = Object.assign(new Error("connect ETIMEDOUT"), { code: "ETIMEDOUT" });
  assert.equal(isTransientEmailError(err), true);

  const err2 = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
  assert.equal(isTransientEmailError(err2), true);
});

test("isTransientEmailError: SMTP 4xx are transient", () => {
  const err = Object.assign(new Error("421 try again later"), { responseCode: 421 });
  assert.equal(isTransientEmailError(err), true);

  const err2 = Object.assign(new Error("451 temporary failure"), { responseCode: 451 });
  assert.equal(isTransientEmailError(err2), true);
});

test("isTransientEmailError: SMTP 5xx are terminal", () => {
  const err = Object.assign(new Error("550 mailbox not found"), { responseCode: 550 });
  assert.equal(isTransientEmailError(err), false);

  const err2 = Object.assign(new Error("553 mailbox name not allowed"), { responseCode: 553 });
  assert.equal(isTransientEmailError(err2), false);
});

test("isTransientEmailError: EAUTH is terminal", () => {
  const err = Object.assign(new Error("Invalid login"), { code: "EAUTH" });
  assert.equal(isTransientEmailError(err), false);
});

test("isTransientEmailError: EENVELOPE is terminal", () => {
  const err = Object.assign(new Error("Bad envelope"), { code: "EENVELOPE" });
  assert.equal(isTransientEmailError(err), false);
});

test("isTransientEmailError: unknown non-Error is transient (conservative)", () => {
  assert.equal(isTransientEmailError("some string error"), true);
  assert.equal(isTransientEmailError(42), true);
});

test("isTransientEmailError: generic Error with no code is transient", () => {
  assert.equal(isTransientEmailError(new Error("something went wrong")), true);
});

// ══════════════════════════════════════════════════════════════════════
// TESTS: markReminderFailed (terminal) is excluded from retry
// ══════════════════════════════════════════════════════════════════════

test("terminal failure stays excluded until deadline changes", () => {
  const doc = makeHomeworkDoc({
    assignmentDueDate: "2099-06-01",
    assignmentDueTime: "08:00",
    reminderOptIn: true,
  });
  store.saveDocument(doc);

  const deadlineKey = store.buildDeadlineKey("2099-06-01", "08:00");
  store.claimReminderForSending(doc.id, deadlineKey);
  store.markReminderFailed(doc.id, deadlineKey, "550 mailbox not found");

  // Should NOT appear in pending
  const candidates = store.listPendingReminders();
  const match = candidates.find((c) => c.documentId === doc.id);
  assert.equal(match, undefined, "Terminal failure should not be retried");

  // Change deadline → resets to pending
  store.updateAssignmentDueTime(doc.id, "20:00");
  const candidates2 = store.listPendingReminders();
  const match2 = candidates2.find((c) => c.documentId === doc.id);
  assert.ok(match2, "After deadline change, should be retryable again");
});

// ══════════════════════════════════════════════════════════════════════
// TESTS: Past-deadline reminder handling
// ══════════════════════════════════════════════════════════════════════

test("scheduler marks past-deadline reminder as past_due", () => {
  // Create a homework doc with a deadline that is already in the past
  const doc = makeHomeworkDoc({
    assignmentDueDate: "2020-01-01",
    assignmentDueTime: "08:00",
    reminderOptIn: true,
  });
  store.saveDocument(doc);

  // Confirm it starts as pending and appears in the list
  const before = store.listPendingReminders();
  const matchBefore = before.find((c) => c.documentId === doc.id);
  assert.ok(matchBefore, "Past-deadline doc should initially be pending");

  // Run the scheduler — it should mark the past-deadline doc as past_due
  checkAndSendReminders();

  // After scheduler tick, the doc should no longer appear in pending
  const after = store.listPendingReminders();
  const matchAfter = after.find((c) => c.documentId === doc.id);
  assert.equal(matchAfter, undefined, "Past-deadline doc should no longer be pending");

  // Verify the DB state is 'past_due'
  const metadata = store.getDocumentMetadata(doc.id);
  assert.equal(metadata?.reminderStatus, "past_due", "Should be marked past_due");
});

test("homework with future deadline retains pending status through scheduler", () => {
  // Create a homework doc with a deadline far in the future (beyond 24h window)
  const doc = makeHomeworkDoc({
    assignmentDueDate: "2099-12-31",
    assignmentDueTime: "23:59",
    reminderOptIn: true,
  });
  store.saveDocument(doc);

  // Run scheduler — future doc outside 24h window should stay pending
  checkAndSendReminders();

  const candidates = store.listPendingReminders();
  const match = candidates.find((c) => c.documentId === doc.id);
  assert.ok(match, "Future-deadline doc should remain pending");

  const metadata = store.getDocumentMetadata(doc.id);
  assert.equal(metadata?.reminderStatus, "pending", "Should still be pending");
});

test("past-deadline past_due doc becomes pending again when deadline changes to future", () => {
  const doc = makeHomeworkDoc({
    assignmentDueDate: "2020-06-15",
    assignmentDueTime: "12:00",
    reminderOptIn: true,
  });
  store.saveDocument(doc);

  // Scheduler marks it past_due
  checkAndSendReminders();
  const meta1 = store.getDocumentMetadata(doc.id);
  assert.equal(meta1?.reminderStatus, "past_due");

  // Update deadline to a future date — should reset to pending
  store.updateAssignmentDueDate(doc.id, "2099-06-15");
  const meta2 = store.getDocumentMetadata(doc.id);
  assert.equal(meta2?.reminderStatus, "pending", "Deadline change should reset to pending");

  // Should reappear in pending list
  const candidates = store.listPendingReminders();
  const match = candidates.find((c) => c.documentId === doc.id);
  assert.ok(match, "Should be eligible again after deadline change");
});

test("due date and time still display correctly for past-deadline documents", () => {
  // This verifies extraction and storage are unaffected by past-deadline status
  const doc = makeHomeworkDoc({
    assignmentDueDate: "2020-03-15",
    assignmentDueTime: "23:59",
  });
  store.saveDocument(doc);

  const metadata = store.getDocumentMetadata(doc.id);
  assert.equal(metadata?.assignmentDueDate, "2020-03-15", "Due date should be preserved");
  assert.equal(metadata?.assignmentDueTime, "23:59", "Due time should be preserved");
});

// ══════════════════════════════════════════════════════════════════════
// TESTS: Reminder opt-in gating
// ══════════════════════════════════════════════════════════════════════

test("listPendingReminders excludes homework with reminder_opt_in = false", () => {
  const doc = makeHomeworkDoc({
    assignmentDueDate: "2099-12-31",
    assignmentDueTime: "23:59",
    reminderOptIn: false,
  });
  store.saveDocument(doc);

  const candidates = store.listPendingReminders();
  const match = candidates.find((c) => c.documentId === doc.id);
  assert.equal(match, undefined, "Should not appear — opt-in is false");
});

test("updateReminderOptIn(true) sets opt-in and resets to pending", () => {
  const doc = makeHomeworkDoc({
    assignmentDueDate: "2099-12-31",
    assignmentDueTime: "23:59",
    reminderOptIn: false,
  });
  store.saveDocument(doc);

  // Should not appear before opt-in
  const before = store.listPendingReminders();
  assert.equal(before.find((c) => c.documentId === doc.id), undefined, "Not in pending before opt-in");

  store.updateReminderOptIn(doc.id, true);

  const updated = store.getDocumentMetadata(doc.id);
  assert.ok(updated);
  assert.equal(updated.reminderOptIn, true);
  assert.equal(updated.reminderStatus, "pending");

  // Should now appear in pending
  const after = store.listPendingReminders();
  assert.ok(after.find((c) => c.documentId === doc.id), "Should appear after opt-in");
});

test("updateReminderOptIn(false) sets opt-out and marks skipped", () => {
  const doc = makeHomeworkDoc({
    assignmentDueDate: "2099-12-31",
    assignmentDueTime: "23:59",
    reminderOptIn: true,
  });
  store.saveDocument(doc);

  store.updateReminderOptIn(doc.id, false);

  const updated = store.getDocumentMetadata(doc.id);
  assert.ok(updated);
  assert.equal(updated.reminderOptIn, false);
  assert.equal(updated.reminderStatus, "skipped");

  // Should not appear in pending
  const candidates = store.listPendingReminders();
  assert.equal(candidates.find((c) => c.documentId === doc.id), undefined, "Opted-out doc should not be pending");
});

test("scheduler ignores opted-out homework even with valid future deadline", () => {
  const doc = makeHomeworkDoc({
    assignmentDueDate: "2099-12-31",
    assignmentDueTime: "23:59",
    reminderOptIn: false,
  });
  store.saveDocument(doc);

  checkAndSendReminders();

  const metadata = store.getDocumentMetadata(doc.id);
  assert.ok(metadata);
  // Should remain pending (not processed at all), since it was never picked up
  assert.equal(metadata.reminderStatus, "pending", "Scheduler should not touch opted-out docs");
});

test("scheduler processes opted-in homework with past deadline", () => {
  const doc = makeHomeworkDoc({
    assignmentDueDate: "2020-01-01",
    assignmentDueTime: "08:00",
    reminderOptIn: true,
  });
  store.saveDocument(doc);

  checkAndSendReminders();

  const metadata = store.getDocumentMetadata(doc.id);
  assert.equal(metadata?.reminderStatus, "past_due", "Opted-in past doc should be marked past_due");
});

test("homework with date but no time is excluded from pending even if opted in", () => {
  const doc = makeHomeworkDoc({
    assignmentDueDate: "2099-12-31",
    reminderOptIn: true,
  });
  store.saveDocument(doc);

  const candidates = store.listPendingReminders();
  assert.equal(candidates.find((c) => c.documentId === doc.id), undefined, "Missing time should exclude from pending");
});

test("homework with no date is excluded from pending even if opted in", () => {
  const doc = makeHomeworkDoc({
    assignmentDueTime: "23:59",
    reminderOptIn: true,
  });
  store.saveDocument(doc);

  const candidates = store.listPendingReminders();
  assert.equal(candidates.find((c) => c.documentId === doc.id), undefined, "Missing date should exclude from pending");
});

// ══════════════════════════════════════════════════════════════════════
// Cleanup
// ══════════════════════════════════════════════════════════════════════

test("cleanup reminder test environment", () => {
  sqlite.closeDatabase();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
