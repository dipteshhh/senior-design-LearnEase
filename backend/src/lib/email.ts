import { createHash } from "crypto";
import { Resend, type ErrorResponse } from "resend";
import { logger } from "./logger.js";

interface EmailOptions {
  to: string;
  subject: string;
  text: string;
}

type EmailProviderError = Error & {
  code?: string;
  statusCode?: number | null;
};

/**
 * Returns a short, non-reversible identifier for an email address so that
 * reminder logs can be correlated without writing the plaintext recipient
 * into persistent log storage.
 */
function hashRecipient(address: string): string {
  return createHash("sha256").update(address.trim().toLowerCase()).digest("hex").slice(0, 16);
}

function createClient() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  return new Resend(apiKey);
}

function getFromAddress(): string | null {
  const from = process.env.RESEND_FROM?.trim();
  return from || null;
}

function buildProviderError(error: ErrorResponse): EmailProviderError {
  const providerError = new Error(error.message) as EmailProviderError;
  providerError.name = "ResendApiError";
  providerError.code = error.name;
  providerError.statusCode = error.statusCode;
  return providerError;
}

let cachedClient: ReturnType<typeof createClient> | undefined;

function getClient() {
  if (cachedClient === undefined) {
    cachedClient = createClient();
  }
  return cachedClient;
}

export function isEmailConfigured(): boolean {
  return getClient() !== null && getFromAddress() !== null;
}

/**
 * Send an email. Returns true on success. Returns false if Resend is not
 * configured (terminal — will never work). Throws on API/network failures so
 * the caller can inspect the error and decide whether to retry.
 */
export async function sendEmail(options: EmailOptions): Promise<boolean> {
  const client = getClient();
  const from = getFromAddress();
  const recipientHash = hashRecipient(options.to);
  if (!client || !from) {
    logger.warn("Email not sent — Resend not configured", {
      recipientHash,
      subject: options.subject,
    });
    return false;
  }

  const { error } = await client.emails.send({
    from,
    to: options.to,
    subject: options.subject,
    text: options.text,
  });

  if (error) {
    throw buildProviderError(error);
  }

  logger.info("Reminder email sent", { recipientHash, subject: options.subject });
  return true;
}
