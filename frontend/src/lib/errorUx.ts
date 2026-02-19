import { ApiClientError } from "@/lib/api";

export function getErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiClientError)) {
    return fallback;
  }

  if (error.code === "ALREADY_PROCESSING") {
    if (error.retryAfterSeconds != null) {
      return `Generation is already in progress. Try again in ${error.retryAfterSeconds}s.`;
    }
    return "Generation is already in progress.";
  }

  if (error.code === "RATE_LIMITED") {
    if (error.retryAfterSeconds != null) {
      return `Too many requests right now. Please retry in ${error.retryAfterSeconds}s.`;
    }
    return "Too many requests right now. Please wait a moment and retry.";
  }

  if (error.code === "DOCUMENT_NOT_LECTURE") {
    return "Quiz is available only for lecture documents.";
  }

  if (error.code === "DOCUMENT_UNSUPPORTED" || error.code === "UNSUPPORTED_MEDIA_TYPE") {
    return "Only supported document types can be processed.";
  }

  if (error.code === "FILE_TOO_LARGE") {
    return "File is too large. Max size is 50MB.";
  }

  if (error.code === "MISSING_FILE") {
    return "Please choose a file before uploading.";
  }

  if (error.code === "EXTRACTION_FAILED") {
    return "We could not process this file. Please try another one.";
  }

  if (error.code === "INVALID_GOOGLE_TOKEN") {
    return "Google sign-in failed. Please try signing in again.";
  }

  if (error.code === "EMAIL_NOT_VERIFIED") {
    return "Your Google email is not verified.";
  }

  if (error.code === "AUTH_PROVIDER_UNAVAILABLE") {
    return "Google sign-in is temporarily unavailable. Please try again later.";
  }

  if (error.code === "GENERATION_FAILED") {
    return "Generation is temporarily unavailable. Please try again later.";
  }

  if (error.message?.trim()) {
    return error.message;
  }

  return fallback;
}
