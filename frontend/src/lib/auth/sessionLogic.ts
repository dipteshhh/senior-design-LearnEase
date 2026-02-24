import { ApiClientError } from "@/lib/api";

interface RedirectToSignInInput {
  isLoading: boolean;
  hasUser: boolean;
  hasSessionCheckError: boolean;
}

export function isUnauthorizedSessionError(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 401;
}

export function shouldRedirectToSignIn({
  isLoading,
  hasUser,
  hasSessionCheckError,
}: RedirectToSignInInput): boolean {
  return !isLoading && !hasUser && !hasSessionCheckError;
}
