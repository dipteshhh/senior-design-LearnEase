import { logger } from "../lib/logger.js";

/**
 * Extracts a due date and optional due time from homework document text
 * using pattern matching. Returns an ISO date string (YYYY-MM-DD) and
 * optionally an HH:MM time string, or null if no due date is found.
 */

export interface DueDeadline {
  date: string;       // YYYY-MM-DD
  time: string | null; // HH:MM (24-hour) or null
}

const MONTH_NAMES: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const MONTH_PATTERN = Object.keys(MONTH_NAMES).join("|");
const WEEKDAY_PATTERN =
  "(?:monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat|sunday|sun)";

// Patterns ordered by specificity (most explicit first).
// Each pattern is paired with a function that extracts (month, day, year | null).
// timeOverride is set when the time appears *before* the date in the sentence.
const DUE_DATE_PATTERNS: Array<{
  regex: RegExp;
  extract: (match: RegExpMatchArray) => { month: number; day: number; year: number | null; timeOverride?: string } | null;
}> = [
  // "due at 1:30pm on Wednesday, January 21, 2009" / "due at 5:00 PM on Monday, February 3, 2026"
  // Time appears *before* the date, optionally with parenthetical text between them.
  {
    regex: new RegExp(
      `(?:due|submit|turn\\s+in)\\s+(?:at\\s+)(\\d{1,2}):(\\d{2})\\s*(am|pm)?\\s*(?:\\([^)]*\\)\\s*)?on\\s+(?:${WEEKDAY_PATTERN}\\.?,?\\s+)?(${MONTH_PATTERN})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?[,\\s]+(\\d{4})`,
      "i"
    ),
    extract: (m) => {
      const month = MONTH_NAMES[m[4].toLowerCase()];
      if (!month) return null;
      // Parse the pre-date time
      let hour = parseInt(m[1], 10);
      const minute = parseInt(m[2], 10);
      const ampm = m[3]?.toLowerCase();
      if (ampm === "pm" && hour < 12) hour += 12;
      if (ampm === "am" && hour === 12) hour = 0;
      if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
      const timeOverride = `${pad2(hour)}:${pad2(minute)}`;
      return { month, day: parseInt(m[5], 10), year: parseInt(m[6], 10), timeOverride };
    },
  },
  // Same as above but without a year: "due at 1:30pm on Wednesday, January 21"
  {
    regex: new RegExp(
      `(?:due|submit|turn\\s+in)\\s+(?:at\\s+)(\\d{1,2}):(\\d{2})\\s*(am|pm)?\\s*(?:\\([^)]*\\)\\s*)?on\\s+(?:${WEEKDAY_PATTERN}\\.?,?\\s+)?(${MONTH_PATTERN})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?`,
      "i"
    ),
    extract: (m) => {
      const month = MONTH_NAMES[m[4].toLowerCase()];
      if (!month) return null;
      let hour = parseInt(m[1], 10);
      const minute = parseInt(m[2], 10);
      const ampm = m[3]?.toLowerCase();
      if (ampm === "pm" && hour < 12) hour += 12;
      if (ampm === "am" && hour === 12) hour = 0;
      if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
      const timeOverride = `${pad2(hour)}:${pad2(minute)}`;
      return { month, day: parseInt(m[5], 10), year: null, timeOverride };
    },
  },
  // "due February 1, 2026" / "due date: Feb 1 2026" / "deadline: March 15, 2026"
  {
    regex: new RegExp(
      `(?:due\\s*(?:date)?\\s*[:;]?\\s*|deadline\\s*[:;]?\\s*)(?:${WEEKDAY_PATTERN}\\.?,?\\s+)?(${MONTH_PATTERN})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?[,\\s]+(\\d{4})`,
      "i"
    ),
    extract: (m) => {
      const month = MONTH_NAMES[m[1].toLowerCase()];
      return month ? { month, day: parseInt(m[2], 10), year: parseInt(m[3], 10) } : null;
    },
  },
  // "due February 1" (no year — assume current or next occurrence)
  {
    regex: new RegExp(
      `(?:due\\s*(?:date)?\\s*[:;]?\\s*|deadline\\s*[:;]?\\s*)(?:${WEEKDAY_PATTERN}\\.?,?\\s+)?(${MONTH_PATTERN})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?`,
      "i"
    ),
    extract: (m) => {
      const month = MONTH_NAMES[m[1].toLowerCase()];
      return month ? { month, day: parseInt(m[2], 10), year: null } : null;
    },
  },
  // "due 02/01/2026" or "due 2/1/2026" or "due date: 02-01-2026"
  {
    regex: /(?:due\s*(?:date)?\s*[:;]?\s*|deadline\s*[:;]?\s*)(\d{1,2})[/-](\d{1,2})[/-](\d{4})/i,
    extract: (m) => ({
      month: parseInt(m[1], 10),
      day: parseInt(m[2], 10),
      year: parseInt(m[3], 10),
    }),
  },
  // "due 02/01" (no year)
  {
    regex: /(?:due\s*(?:date)?\s*[:;]?\s*|deadline\s*[:;]?\s*)(\d{1,2})[/-](\d{1,2})/i,
    extract: (m) => ({
      month: parseInt(m[1], 10),
      day: parseInt(m[2], 10),
      year: null,
    }),
  },
];

/**
 * Time patterns to look for in the text immediately after (or near) the date match.
 * Matches:
 *   "at 11:59pm"  /  "at 11:59 PM"  /  "11:59pm"  /  "11:59 PM"
 *   "at 2:30 am"  /  "2:30am"
 *   "23:59"  (24-hour)
 */
const TIME_PATTERN = /(?:at\s+)?(\d{1,2}):(\d{2})\s*(am|pm)?/i;

/**
 * Extract an HH:MM (24-hour) time string from the remaining text after the date match.
 * Looks within the first 30 characters after the date match end position.
 */
function extractTimeNearDate(text: string, dateMatchEnd: number): string | null {
  // Look at the text following the date match (plus a small window)
  const trailing = text.slice(dateMatchEnd, dateMatchEnd + 30);
  const timeMatch = trailing.match(TIME_PATTERN);
  if (!timeMatch) return null;

  let hour = parseInt(timeMatch[1], 10);
  const minute = parseInt(timeMatch[2], 10);
  const ampm = timeMatch[3]?.toLowerCase();

  if (ampm === "pm" && hour < 12) hour += 12;
  if (ampm === "am" && hour === 12) hour = 0;

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  return `${pad2(hour)}:${pad2(minute)}`;
}

function inferYear(month: number, day: number): number {
  const now = new Date();
  const currentYear = now.getFullYear();
  // If the date has already passed this year, assume next year
  const candidate = new Date(currentYear, month - 1, day);
  if (candidate.getTime() < now.getTime() - 24 * 60 * 60 * 1000) {
    return currentYear + 1;
  }
  return currentYear;
}

function inferYearFromContext(
  text: string,
  month: number,
  day: number,
  matchIndex: number
): number {
  const contextualYearMatches: Array<{ year: number; distance: number }> = [];

  const seasonYearRegex = /\b(?:spring|summer|fall|autumn|winter)\s+(20\d{2})\b/gi;
  for (const match of text.matchAll(seasonYearRegex)) {
    if (match.index === undefined) continue;
    contextualYearMatches.push({
      year: parseInt(match[1], 10),
      distance: Math.abs(match.index - matchIndex),
    });
  }

  const nearbyYearRegex = /\b(20\d{2})\b/g;
  for (const match of text.matchAll(nearbyYearRegex)) {
    if (match.index === undefined) continue;
    const distance = Math.abs(match.index - matchIndex);
    if (distance > 240) continue;
    contextualYearMatches.push({
      year: parseInt(match[1], 10),
      distance,
    });
  }

  contextualYearMatches.sort((a, b) => a.distance - b.distance);
  for (const candidate of contextualYearMatches) {
    if (isValidDate(candidate.year, month, day)) {
      return candidate.year;
    }
  }

  return inferYear(month, day);
}

function isValidDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  // Use Date with explicit local components — no timezone shift risk
  const d = new Date(year, month - 1, day);
  return (
    d.getFullYear() === year &&
    d.getMonth() === month - 1 &&
    d.getDate() === day
  );
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

/**
 * Extract both due date and optional due time from document text.
 * Returns { date: "YYYY-MM-DD", time: "HH:MM" | null } or null.
 */
export function extractDueDeadline(text: string): DueDeadline | null {
  for (const pattern of DUE_DATE_PATTERNS) {
    const match = text.match(pattern.regex);
    if (!match) continue;

    const parts = pattern.extract(match);
    if (!parts) continue;

    const matchIndex = match.index ?? 0;
    const year =
      parts.year ?? inferYearFromContext(text, parts.month, parts.day, matchIndex);
    if (!isValidDate(year, parts.month, parts.day)) {
      logger.warn("Due date extraction matched but produced invalid date", {
        raw: match[0],
        year,
        month: parts.month,
        day: parts.day,
      });
      continue;
    }

    const iso = `${year}-${pad2(parts.month)}-${pad2(parts.day)}`;
    const matchEnd = match.index! + match[0].length;
    const time = parts.timeOverride ?? extractTimeNearDate(text, matchEnd);

    logger.info("Due deadline extracted from document text", { raw: match[0], iso, time });
    return { date: iso, time };
  }

  return null;
}

/**
 * Backward-compatible wrapper: returns just the date string or null.
 */
export function extractDueDate(text: string): string | null {
  return extractDueDeadline(text)?.date ?? null;
}
