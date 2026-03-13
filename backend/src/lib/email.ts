import nodemailer from "nodemailer";
import { logger } from "./logger.js";

interface EmailOptions {
  to: string;
  subject: string;
  text: string;
}

function createTransport() {
  const host = process.env.SMTP_HOST?.trim();
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

let cachedTransport: ReturnType<typeof createTransport> | undefined;

function getTransport() {
  if (cachedTransport === undefined) {
    cachedTransport = createTransport();
  }
  return cachedTransport;
}

export function isEmailConfigured(): boolean {
  return getTransport() !== null;
}

/**
 * Send an email. Returns true on success. Returns false if SMTP is not
 * configured (terminal — will never work). Throws on send failure so the
 * caller can inspect the error and decide whether to retry.
 */
export async function sendEmail(options: EmailOptions): Promise<boolean> {
  const transport = getTransport();
  if (!transport) {
    logger.warn("Email not sent — SMTP not configured", { to: options.to, subject: options.subject });
    return false;
  }

  const from = process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim() || "noreply@learnease.app";

  await transport.sendMail({
    from,
    to: options.to,
    subject: options.subject,
    text: options.text,
  });
  logger.info("Reminder email sent", { to: options.to, subject: options.subject });
  return true;
}
