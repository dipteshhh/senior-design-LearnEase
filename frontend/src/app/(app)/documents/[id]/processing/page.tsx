"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ApiClientError, api } from "@/lib/api";
import type { DocumentListItem, DocumentType, GenerationStatus } from "@/lib/contracts";
import { getDocumentStatus } from "@/lib/data/documents";
import { getErrorMessage } from "@/lib/errorUx";
import {
  DEFAULT_POLL_DELAY_MS,
  getTransientDelayMs,
  shouldRunPolling,
  toPollDelayMs,
} from "@/lib/polling";
import { usePageVisible } from "@/lib/usePageVisible";

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function formatDocumentType(type: DocumentType): string {
  switch (type) {
    case "HOMEWORK":
      return "Homework";
    case "LECTURE":
      return "Lecture";
    case "SYLLABUS":
      return "Syllabus";
    default:
      return "Document";
  }
}

function formatPageCount(pageCount: number): string {
  if (!Number.isFinite(pageCount) || pageCount <= 0) return "Pages unavailable";
  return `${pageCount} ${pageCount === 1 ? "page" : "pages"}`;
}

function formatRelativeUploadTime(value?: string): string {
  if (!value) return "Uploaded recently";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Uploaded recently";

  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60_000) return "Uploaded just now";

  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 60) {
    return `Uploaded ${diffMinutes} ${diffMinutes === 1 ? "minute" : "minutes"} ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `Uploaded ${diffHours} ${diffHours === 1 ? "hour" : "hours"} ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `Uploaded ${diffDays} ${diffDays === 1 ? "day" : "days"} ago`;
  }

  return `Uploaded ${date.toLocaleDateString()}`;
}

function inferExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex === -1 || dotIndex === filename.length - 1) return "FILE";
  return filename.slice(dotIndex + 1).toUpperCase();
}

function getStatusHeading(status: GenerationStatus | undefined): string {
  switch (status) {
    case "ready":
      return "Your study guide is ready";
    case "failed":
      return "We couldn’t finish the study guide";
    case "processing":
      return "Creating your study guide";
    case "idle":
    default:
      return "Preparing your document";
  }
}

function getStatusDescription(status: GenerationStatus | undefined): string {
  switch (status) {
    case "ready":
      return "Everything is complete. We’re taking you to the document page now.";
    case "failed":
      return "Something interrupted generation. You can retry now or return to your dashboard.";
    case "processing":
      return "We’re analyzing your document and organizing it into structured study materials. This may take a little longer for larger files.";
    case "idle":
    default:
      return "Your document is queued and generation will begin shortly.";
  }
}

type StepState = "complete" | "active" | "pending" | "halted";

type StepItem = {
  key: string;
  label: string;
  state: StepState;
};

function ProcessingGlyph({ failed = false }: { failed?: boolean }) {
  return (
    <div
      className={[
        "flex h-16 w-16 items-center justify-center rounded-[22px] shadow-[0_8px_24px_rgba(15,23,42,0.12)]",
        failed ? "bg-rose-600" : "bg-black",
      ].join(" ")}
    >
      <svg
        className="h-7 w-7 animate-spin text-white"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle
          cx="12"
          cy="12"
          r="7.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="32 18"
        />
      </svg>
    </div>
  );
}

function StepIcon({ state }: { state: StepState }) {
  if (state === "complete") {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 shadow-sm">
        <svg viewBox="0 0 20 20" className="h-5 w-5 text-white" fill="none" aria-hidden="true">
          <path
            d="M5 10.25 8.25 13.5 15 6.75"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }

  if (state === "active") {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black shadow-sm">
        <svg
          className="h-5 w-5 animate-spin text-white"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle
            cx="12"
            cy="12"
            r="7.5"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeDasharray="34 18"
          />
        </svg>
      </div>
    );
  }

  if (state === "halted") {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-500 shadow-sm">
        <svg viewBox="0 0 20 20" className="h-5 w-5 text-white" fill="none" aria-hidden="true">
          <path
            d="M6.5 6.5 13.5 13.5M13.5 6.5 6.5 13.5"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100">
      <div className="h-2.5 w-2.5 rounded-full bg-gray-300" />
    </div>
  );
}

function StepRail({
  index,
  stepsLength,
  currentState,
  nextState,
}: {
  index: number;
  stepsLength: number;
  currentState: StepState;
  nextState: StepState | undefined;
}) {
  if (index === stepsLength - 1) return null;

  let lineClass = "bg-gray-200";

  if (currentState === "complete" && (nextState === "complete" || nextState === "active")) {
    lineClass = "bg-emerald-500";
  } else if (currentState === "complete" && nextState === "halted") {
    lineClass = "bg-rose-300";
  } else if (currentState === "halted") {
    lineClass = "bg-rose-200";
  }

  return (
    <div
      className={`ml-[19px] mt-3 h-10 w-[2px] rounded-full ${lineClass}`}
      aria-hidden="true"
    />
  );
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "neutral" | "success" | "danger";
}) {
  const className =
    tone === "danger"
      ? "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200"
      : tone === "success"
        ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200"
        : "bg-gray-100 text-gray-700 ring-1 ring-inset ring-gray-200";

  return (
    <div className={`rounded-full px-3 py-1 text-[12px] font-semibold ${className}`}>
      {label}
    </div>
  );
}

export default function ProcessingPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";

  const [document, setDocument] = useState<DocumentListItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [pollTrigger, setPollTrigger] = useState(0);
  const [processingStartedAt, setProcessingStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const isPageVisible = usePageVisible();
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const isFailed = document?.study_guide_status === "failed";
  const isReady = document?.study_guide_status === "ready";
  const isUnsupported = document?.error_code === "DOCUMENT_UNSUPPORTED";

  const refreshDocument = useCallback(
    async (signal?: AbortSignal) => {
      const next = await getDocumentStatus(id, { signal });
      if (isMountedRef.current) {
        setDocument(next);
      }
      return next;
    },
    [id]
  );

  const startGeneration = useCallback(
    async (signal?: AbortSignal): Promise<number> => {
      if (!id) return DEFAULT_POLL_DELAY_MS;

      try {
        await api<{ status: string; cached?: boolean }>("/api/study-guide/create", {
          method: "POST",
          body: JSON.stringify({ document_id: id }),
          signal,
        });

        if (isMountedRef.current) {
          setError(null);
        }

        return DEFAULT_POLL_DELAY_MS;
      } catch (err) {
        if (isAbortError(err)) {
          throw err;
        }

        if (err instanceof ApiClientError) {
          if (err.code === "ALREADY_PROCESSING") {
            if (isMountedRef.current) {
              setError(getErrorMessage(err, "Study guide generation is already in progress."));
            }
            return toPollDelayMs(err.retryAfterSeconds);
          }

          if (err.code === "RATE_LIMITED") {
            if (isMountedRef.current) {
              setError(getErrorMessage(err, "Too many requests right now."));
            }
            return toPollDelayMs(err.retryAfterSeconds);
          }

          if (err.code === "ILLEGAL_RETRY_STATE") {
            if (isMountedRef.current) {
              setError(null);
            }
            return DEFAULT_POLL_DELAY_MS;
          }
        }
        if (isMountedRef.current) {
          setError(getErrorMessage(err, "Unable to start study guide generation."));
        }

        return DEFAULT_POLL_DELAY_MS;
      }
    },
    [id]
  );

  const retryGeneration = useCallback(async () => {
    if (!id) return;

    if (isMountedRef.current) {
      setIsRetrying(true);
    }

    try {
      await api<{ status: string; retry: boolean }>("/api/study-guide/retry", {
        method: "POST",
        body: JSON.stringify({ document_id: id }),
      });

      if (isMountedRef.current) {
        setError(null);
        setProcessingStartedAt(Date.now());
        setElapsedMs(0);
      }

      await refreshDocument();

      if (isMountedRef.current) {
        setPollTrigger((current) => current + 1);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(getErrorMessage(err, "Retry failed. Please try again."));
      }
    } finally {
      if (isMountedRef.current) {
        setIsRetrying(false);
      }
    }
  }, [id, refreshDocument]);

  useEffect(() => {
    if (document?.study_guide_status === "processing" && processingStartedAt == null) {
      setProcessingStartedAt(Date.now());
    }

    if (document?.study_guide_status !== "processing" && !isRetrying) {
      setElapsedMs(0);
    }
  }, [document?.study_guide_status, isRetrying, processingStartedAt]);

  useEffect(() => {
    if (document?.study_guide_status !== "processing" || processingStartedAt == null) return;

    const interval = window.setInterval(() => {
      setElapsedMs(Date.now() - processingStartedAt);
    }, 800);

    return () => {
      window.clearInterval(interval);
    };
  }, [document?.study_guide_status, processingStartedAt]);

  useEffect(() => {
    if (!shouldRunPolling(id, isPageVisible)) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let requestController: AbortController | null = null;

    const nextSignal = (): AbortSignal => {
      requestController?.abort();
      requestController = new AbortController();
      return requestController.signal;
    };

    const poll = async () => {
      let nextDelayMs = DEFAULT_POLL_DELAY_MS;

      try {
        const next = await refreshDocument(nextSignal());

        if (cancelled || !isMountedRef.current) {
          return;
        }

        if (!next) {
          setError("Document not found.");
          return;
        }

        if (next.study_guide_status === "processing" && processingStartedAt == null) {
          setProcessingStartedAt(Date.now());
        }

        if (next.study_guide_status === "ready") {
          router.replace(`/documents/${id}`);
          return;
        }

        if (next.study_guide_status === "failed") {
          if (next.error_code === "DOCUMENT_UNSUPPORTED") {
            setError("This document type is not supported for study guide generation.");
          } else {
            setError(next.error_message ?? "Study guide generation failed.");
          }
          return;
        }

        setError(null);
      } catch (err) {
        if (cancelled || !isMountedRef.current) {
          return;
        }

        if (isAbortError(err)) {
          return;
        }

        const transientDelayMs = getTransientDelayMs(err);
        if (transientDelayMs != null) {
          setError(getErrorMessage(err, "Temporary backend limit reached."));
          nextDelayMs = transientDelayMs;
        } else {
          setError(getErrorMessage(err, "Unable to check generation status."));
          return;
        }
      }

      if (!cancelled) {
        timer = setTimeout(() => {
          void poll();
        }, nextDelayMs);
      }
    };

    void startGeneration(nextSignal())
      .then((initialDelayMs) => {
        if (!cancelled && initialDelayMs >= 0) {
          timer = setTimeout(() => {
            void poll();
          }, initialDelayMs ?? DEFAULT_POLL_DELAY_MS);
        }
      })
      .catch((err) => {
        if (isAbortError(err) || cancelled || !isMountedRef.current) {
          return;
        }
        setError(getErrorMessage(err, "Unable to start study guide generation."));
      });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      requestController?.abort();
    };
  }, [id, isPageVisible, pollTrigger, processingStartedAt, refreshDocument, router, startGeneration]);

  const statusLine = useMemo(() => {
    if (isUnsupported) return "This document type is not supported.";
    if (!document) return "Waiting for document status...";
    if (document.study_guide_status === "ready") return "Study guide is ready.";
    if (document.study_guide_status === "failed") return "Study guide generation failed.";
    if (document.study_guide_status === "processing") return "Generating study guide...";
    return "Queued for generation...";
  }, [document]);

  const progressLabel = useMemo(() => {
    if (isReady) return "100% complete";
    if (document?.error_code === "DOCUMENT_UNSUPPORTED") return "Unsupported document";
    if (isFailed) return "Generation interrupted";
    if (!document) return "Preparing…";
    if (document.study_guide_status === "idle") return "Queued";
    return "Usually takes around 30–60 seconds";
  }, [document, isFailed, isReady]);

  const visualStepIndex = useMemo(() => {
    if (isReady) return 5;
    if (isFailed) return 3;
    if (!document || document.study_guide_status === "idle") return 0;
    if (document.study_guide_status !== "processing") return 1;

    if (elapsedMs < 8_000) return 1;
    if (elapsedMs < 18_000) return 2;
    if (elapsedMs < 32_000) return 3;
    if (elapsedMs < 50_000) return 4;
    return 5;
  }, [document, elapsedMs, isFailed, isReady]);

  const steps = useMemo<StepItem[]>(() => {
    const labels = [
      "Extracting text from document",
      "Analyzing structure and sections",
      "Identifying key concepts",
      "Generating action items",
      "Creating study materials",
    ];

    if (isFailed) {
      return labels.map((label, index) => {
        if (index < 2) return { key: label, label, state: "complete" as const };
        if (index === 2) return { key: label, label, state: "halted" as const };
        return { key: label, label, state: "pending" as const };
      });
    }

    return labels.map((label, index) => {
      const stepNumber = index + 1;
      let state: StepState = "pending";

      if (isReady || visualStepIndex > stepNumber) {
        state = "complete";
      } else if (visualStepIndex === stepNumber) {
        state = "active";
      }

      return {
        key: label,
        label,
        state,
      };
    });
  }, [isFailed, isReady, visualStepIndex]);

 const completionPercent = useMemo(() => {
  if (isReady) return 100;
  if (isFailed) return 60;

  switch (visualStepIndex) {
    case 0:
      return 8;
    case 1:
      return 20;
    case 2:
      return 40;
    case 3:
      return 60;
    case 4:
      return 80;
    default:
      return 92;
  }
}, [isFailed, isReady, visualStepIndex]);

  const statusPill = useMemo(() => {
    if (isUnsupported) return { label: "Unsupported", tone: "danger" as const };
    if (isFailed) return { label: "Failed", tone: "danger" as const };
    if (isReady) return { label: "Ready", tone: "success" as const };
    if (document?.study_guide_status === "idle") return { label: "Queued", tone: "neutral" as const };
    return { label: "Processing", tone: "neutral" as const };
  }, [document?.study_guide_status, isFailed, isReady, isUnsupported]);

  if (!id) {
    return <p className="px-6 py-10 text-sm text-gray-600">Missing document id.</p>;
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#fafafa]">
      <div className="mx-auto flex w-full max-w-4xl flex-col px-6 py-10 md:px-8 md:py-14">
        <div className="mx-auto flex w-full max-w-2xl flex-col items-center text-center">
          <ProcessingGlyph failed={isFailed} />

          <h1 className="mt-7 max-w-2xl text-3xl font-semibold tracking-tight text-gray-950 md:text-4xl">
            {isUnsupported ? "Document not supported" : getStatusHeading(document?.study_guide_status)}
          </h1>

          <p className="mt-3 max-w-xl text-sm leading-7 text-gray-600 md:text-base">
            {isUnsupported ? "This document type is not supported for study guide generation. Please upload a different document." : getStatusDescription(document?.study_guide_status)}
          </p>

          <p className="mt-4 text-sm font-medium text-gray-400">{progressLabel}</p>
        </div>

        <div className="mx-auto mt-12 grid w-full max-w-4xl gap-6 lg:grid-cols-[1.55fr_0.95fr] lg:items-start">
          <section className="rounded-[28px] border border-gray-200 bg-white p-7 shadow-[0_10px_30px_rgba(15,23,42,0.05)] md:p-8">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-950">Generation progress</h2>
                <p className="mt-1.5 text-sm text-gray-500">{statusLine}</p>
              </div>
              <StatusPill label={statusPill.label} tone={statusPill.tone} />
            </div>

            <div className="mb-8 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className={[
                  "h-full rounded-full transition-all duration-700",
                  isUnsupported ? "bg-amber-500" : isFailed ? "bg-rose-500" : isReady ? "bg-emerald-500" : "bg-gray-950",
                ].join(" ")}
                style={{ width: isUnsupported ? "100%" : `${completionPercent}%` }}
              />
            </div>

            <div className="space-y-0">
              {steps.map((step, index) => {
                const textClass =
                  step.state === "pending"
                    ? "text-gray-400"
                    : step.state === "halted"
                      ? "text-gray-950"
                      : step.state === "active"
                        ? "text-gray-950"
                        : "text-gray-900";

                const weightClass =
                  step.state === "active" || step.state === "halted" ? "font-semibold" : "font-medium";

                return (
                  <div key={step.key}>
                    <div className="flex items-center gap-4">
                      <StepIcon state={step.state} />
                      <p className={`text-sm md:text-base ${textClass} ${weightClass}`}>
                        {step.label}
                      </p>
                    </div>
                    <StepRail
                      index={index}
                      stepsLength={steps.length}
                      currentState={step.state}
                      nextState={steps[index + 1]?.state}
                    />
                  </div>
                );
              })}
            </div>

            {error ? (
              <div className="mt-8 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}
          </section>

          <aside className="space-y-6">
            <section className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gray-50 text-xs font-semibold text-gray-700">
                  {document?.filename ? inferExtension(document.filename) : "DOC"}
                </div>

                <div className="min-w-0">
                  <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">
                    Document
                  </h2>
                  <p className="mt-2 truncate text-[17px] font-semibold text-gray-950">
                    {document?.filename ?? "Loading document…"}
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    {document
                      ? `${formatDocumentType(document.document_type)} • ${formatPageCount(document.page_count)}`
                      : "Fetching document details"}
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    {document ? formatRelativeUploadTime(document.uploaded_at) : "Please wait"}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
              <h2 className="text-base font-semibold text-gray-950">Helpful note</h2>
              <p className="mt-3 max-w-[30ch] text-sm leading-7 text-gray-600">
                Processing can take longer when the document is large or when the response must match a strict structured format.
              </p>
              <p className="mt-3 max-w-[30ch] text-sm leading-7 text-gray-500">
                You can leave this page and return from the dashboard at any time. You’ll be redirected automatically once generation is complete.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                {isUnsupported ? (
                  <Link
                    href="/upload"
                    className="inline-flex items-center justify-center rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                  >
                    Upload a different document
                  </Link>
                ) : isFailed ? (
                  <button
                    type="button"
                    onClick={() => {
                      void retryGeneration();
                    }}
                    disabled={isRetrying}
                    className="inline-flex items-center justify-center rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isRetrying ? "Retrying..." : "Retry generation"}
                  </button>
                ) : null}

                <Link
                  href="/dashboard"
                  className="inline-flex items-center justify-center rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-900 transition hover:bg-gray-50"
                >
                  Back to Dashboard
                </Link>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}