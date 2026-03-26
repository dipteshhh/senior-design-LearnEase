"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  Lock,
  ShieldCheck,
} from "lucide-react";
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
  if (!raw || !raw.startsWith("/")) return "/dashboard";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/dashboard";
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
  const completeSignInRef = useRef<(credential: string) => Promise<void>>(undefined);

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [manualCredential, setManualCredential] = useState("");
  const [showDevOptions, setShowDevOptions] = useState(false);

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

  // Keep the ref in sync so the stable Google callback always calls the latest version.
  completeSignInRef.current = completeSignIn;

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      setError("Missing NEXT_PUBLIC_GOOGLE_CLIENT_ID configuration.");
      return;
    }

    let resizeHandler: (() => void) | null = null;

    const initializeGoogleButton = () => {
      if (!window.google || !buttonRef.current) return;

      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => {
          const credential = response.credential?.trim();
          if (!credential) {
            setError("Google sign-in did not return a credential.");
            return;
          }
          void completeSignInRef.current?.(credential);
        },
      });

      buttonRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        width: Math.min(380, Math.max(280, buttonRef.current.offsetWidth || 340)),
      });
    };

    const handleResize = () => {
      if (!window.google || !buttonRef.current) return;
      buttonRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        width: Math.min(380, Math.max(280, buttonRef.current.offsetWidth || 340)),
      });
    };

    if (window.google) {
      initializeGoogleButton();
      resizeHandler = handleResize;
      window.addEventListener("resize", resizeHandler);
      return () => window.removeEventListener("resize", handleResize);
    }

    const script = document.createElement("script");
    script.src = GOOGLE_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      initializeGoogleButton();
      resizeHandler = handleResize;
      window.addEventListener("resize", handleResize);
    };
    script.onerror = () => {
      setError("Failed to load Google sign-in script. Please refresh and try again.");
    };

    document.head.appendChild(script);

    return () => {
      if (resizeHandler) window.removeEventListener("resize", resizeHandler);
      script.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_top,rgba(15,23,42,0.08),transparent_45%)]" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_center,rgba(15,23,42,0.05),transparent_60%)]" />

      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl flex-col justify-center">
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-slate-500 transition hover:text-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        </div>

        <div className="mx-auto w-full max-w-lg">
          <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_25px_70px_rgba(15,23,42,0.10)] sm:p-8">
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-slate-950 text-white shadow-sm">
                <BookOpen className="h-7 w-7" />
              </div>

              <h1 className="mt-6 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                Sign in to LearnEase
              </h1>

              <p className="mx-auto mt-5 max-w-md text-sm leading-7 text-slate-600 sm:text-base">
                Continue with your Google account to upload documents and generate
                structured study guides.
              </p>
            </div>

            <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              {isSubmitting ? (
                <div className="py-6 text-center">
                  <p className="text-lg font-semibold text-slate-950">Signing you in...</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Finishing Google authentication and restoring your session.
                  </p>
                </div>
              ) : (
                <div ref={buttonRef} className="flex min-h-[44px] justify-center" />
              )}
            </div>

            {!isSubmitting ? (
              <>
                <div className="mt-8 border-t border-slate-200 pt-6">
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
                      <p className="text-sm leading-6 text-slate-700">
                        We only request your basic Google profile details needed to
                        create your session.
                      </p>
                    </div>

                    <div className="flex items-start gap-3">
                      <Lock className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
                      <p className="text-sm leading-6 text-slate-700">
                        Documents are encrypted and automatically removed after the
                        retention period.
                      </p>
                    </div>
                  </div>
                </div>

                {IS_DEV ? (
                  <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50">
                    <button
                      type="button"
                      onClick={() => setShowDevOptions((prev) => !prev)}
                      className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-slate-700"
                    >
                      <span>Developer testing options</span>
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${
                          showDevOptions ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    {showDevOptions ? (
                      <div className="border-t border-slate-200 px-4 py-4">
                        <p className="text-xs leading-5 text-slate-500">
                          Paste a Google ID token for backend token-exchange testing.
                        </p>

                        <textarea
                          value={manualCredential}
                          onChange={(event) => setManualCredential(event.target.value)}
                          rows={4}
                          className="mt-3 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-500"
                          placeholder="Google ID token"
                          disabled={isSubmitting}
                        />

                        <button
                          type="button"
                          disabled={isSubmitting || manualCredential.trim().length === 0}
                          onClick={() => void completeSignIn(manualCredential.trim())}
                          className="mt-3 w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Sign in with token
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {error ? (
                  <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>

          <p className="mt-6 text-center text-xs leading-6 text-slate-500 sm:text-sm">
            By continuing, you agree to our{" "}
            <Link href="/terms" className="font-semibold text-slate-900 hover:underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="font-semibold text-slate-900 hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
          <p className="text-sm text-slate-600">Loading sign-in...</p>
        </div>
      }
    >
      <SignInPageContent />
    </Suspense>
  );
}
