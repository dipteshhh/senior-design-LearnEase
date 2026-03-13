import { logger } from "../lib/logger.js";

/**
 * Extracts a due date from homework document text using pattern matching.
 * Returns an ISO date string (YYYY-MM-DD) or null if no due date is found.
 *
 * Does NOT attempt to extract due time — that is user-provided.
 */

const MONTH_NAMES: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const MONTH_PATTERN = Object.keys(MONTH_NAMES).join("|");

// Patterns ordered by specificity (most explicit first).
// Each pattern is paired with a function that extracts (month, day, year | null).
const DUE_DATE_PATTERNS: Array<{
  regex: RegExp;
  extract: (match: RegExpMatchArray) => { month: number; day: number; year: number | null } | null;
}> = [
  // "due February 1, 2026" / "due date: Feb 1 2026" / "deadline: March 15, 2026"
  {
    regex: new RegExp(
      `(?:due\\s*(?:date)?\\s*[:;]?\\s*|deadline\\s*[:;]?\\s*)(${MONTH_PATTERN})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?[,\\s]+(\\d{4})`,
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
      `(?:due\\s*(?:date)?\\s*[:;]?\\s*|deadline\\s*[:;]?\\s*)(${MONTH_PATTERN})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?`,
      "i"
    ),
    extract: (m) => {
      const month = MONTH_NAMES[m[1].toLowerCase()];
      return month ? { month, day: parseInt(m[2], 10), year: null } : null;
    },
  },
  // "due 02/01/2026" or "due 2/1/2026" or "due date: 02-01-2026"
  {
    regex: /(?:due\s*(?:date)?\s*[:;]?\s*|deadline\s*[:;]?\s*)(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i,
    extract: (m) => ({
      month: parseInt(m[1], 10),
      day: parseInt(m[2], 10),
      year: parseInt(m[3], 10),
    }),
  },
  // "due 02/01" (no year)
  {
    regex: /(?:due\s*(?:date)?\s*[:;]?\s*|deadline\s*[:;]?\s*)(\d{1,2})[\/\-](\d{1,2})/i,
    extract: (m) => ({
      month: parseInt(m[1], 10),
      day: parseInt(m[2], 10),
      year: null,
    }),
  },
];

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

function isValidDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
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

export function extractDueDate(text: string): string | null {
  for (const pattern of DUE_DATE_PATTERNS) {
    const match = text.match(pattern.regex);
    if (!match) continue;

    const parts = pattern.extract(match);
    if (!parts) continue;

    const year = parts.year ?? inferYear(parts.month, parts.day);
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
    logger.info("Due date extracted from document text", { raw: match[0], iso });
    return iso;
  }

  return null;
}
