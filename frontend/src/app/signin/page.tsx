"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { GOOGLE_CLIENT_ID } from "@/lib/config";
import { getErrorMessage } from "@/lib/errorUx";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
          }) => void;
          renderButton: (
            target: HTMLElement,
            options: {
              theme?: "outline" | "filled_black" | "filled_blue";
              size?: "large" | "medium" | "small";
              text?: "signin_with" | "signup_with" | "continue_with" | "signin";
              width?: number;
            }
          ) => void;
        };
      };
    };
  }
}

const GOOGLE_SCRIPT_URL = "https://accounts.google.com/gsi/client";
const IS_DEV = process.env.NODE_ENV !== "production";

function sanitizeReturnTo(raw: string | null): string {
  if (!raw || !raw.startsWith("/")) {
    return "/dashboard";
  }
  if (raw.startsWith("//") || raw.startsWith("/\\")) {
    return "/dashboard";
  }
  return raw;
}

function SignInPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = useMemo(
    () => sanitizeReturnTo(searchParams.get("returnTo")),
    [searchParams]
  );

  const buttonRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [manualCredential, setManualCredential] = useState("");

  useEffect(() => {
    router.prefetch(returnTo);
  }, [returnTo, router]);

  const completeSignIn = useCallback(
    async (credential: string) => {
      setError(null);
      setIsSubmitting(true);
      try {
        await api<{ user: { id: string; email: string; name: string | null } }>(
          "/api/auth/google",
          {
            method: "POST",
            body: JSON.stringify({ credential }),
          },
          { suppressUnauthorizedEvent: true }
        );
        router.replace(returnTo);
      } catch (err) {
        setError(getErrorMessage(err, "Sign-in failed. Please try again."));
      } finally {
        setIsSubmitting(false);
      }
    },
    [returnTo, router]
  );

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      setError("Missing NEXT_PUBLIC_GOOGLE_CLIENT_ID configuration.");
      return;
    }

    const renderGoogleButton = () => {
      if (!window.google || !buttonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => {
          const credential = response.credential?.trim();
          if (!credential) {
            setError("Google sign-in did not return a credential.");
            return;
          }
          void completeSignIn(credential);
        },
      });
      buttonRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        width: 320,
      });
    };

    if (window.google) {
      renderGoogleButton();
      return;
    }

    const script = document.createElement("script");
    script.src = GOOGLE_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => renderGoogleButton();
    script.onerror = () =>
      setError("Failed to load Google sign-in script. Please refresh and try again.");
    document.head.appendChild(script);

    return () => {
      script.remove();
    };
  }, [completeSignIn]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-6 py-12">
      <div className="w-full max-w-md rounded-2xl border bg-white p-8 shadow-sm">
        {isSubmitting ? (
          <div className="py-8 text-center">
            <p className="text-lg font-semibold text-gray-900">Signing you in...</p>
            <p className="mt-2 text-sm text-gray-600">
              Finishing Google authentication and restoring your session.
            </p>
          </div>
        ) : null}

        {!isSubmitting ? (
          <>
        <h1 className="text-2xl font-semibold text-gray-900">Sign in to LearnEase</h1>
        <p className="mt-2 text-sm text-gray-600">
          Continue with your Google account to access your study documents.
        </p>

        <div className="mt-6 flex justify-center">
          <div ref={buttonRef} />
        </div>

        {IS_DEV ? (
          <div className="mt-6 border-t pt-6">
            <p className="text-xs text-gray-500">
              Fallback: paste a Google ID token for backend token-exchange testing.
            </p>
            <textarea
              value={manualCredential}
              onChange={(event) => setManualCredential(event.target.value)}
              rows={4}
              className="mt-2 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-gray-500"
              placeholder="Google ID token"
              disabled={isSubmitting}
            />
            <button
              type="button"
              disabled={isSubmitting || manualCredential.trim().length === 0}
              onClick={() => {
                void completeSignIn(manualCredential.trim());
              }}
              className="mt-3 w-full rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Signing in..." : "Sign in with token"}
            </button>
          </div>
        ) : null}
          </>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-gray-600">Loading sign-in...</p>}>
      <SignInPageContent />
    </Suspense>
  );
}
