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
      return "Ready to create your study guide";
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
      return "Your document is uploaded and ready. Study guide generation starts only after you click Create Study Guide.";
  }
}

function getStudyGuideFailureMessage(document: DocumentListItem | null): string | null {
  if (!document || document.study_guide_status !== "failed") {
    return null;
  }

  if (document.error_code === "DOCUMENT_UNSUPPORTED") {
    return "This document type is not supported for study guide generation.";
  }

  return document.error_message ?? "Study guide generation failed.";
}

type StepState = "complete" | "active" | "pending" | "halted";

type StepItem = {
  key: string;
  label: string;
  state: StepState;
};

const STEP_SEQUENCE_THRESHOLDS_MS = [900, 1_800, 2_800, 3_900] as const;
const STEP_SEQUENCE_MIN_MS = 5_200;
const READY_REDIRECT_DELAY_MS = 450;

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
  const [isStarting, setIsStarting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [processingStartedAt, setProcessingStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isHoldingReadyTransition, setIsHoldingReadyTransition] = useState(false);

  const isPageVisible = usePageVisible();
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Optimistic flag: show processing UI immediately after clicking Create/Retry
  // without waiting for the API round-trip + poll cycle to confirm status.
  const [optimisticProcessing, setOptimisticProcessing] = useState(false);

  const beginVisualSequence = useCallback(() => {
    if (!isMountedRef.current) {
      return;
    }

    setProcessingStartedAt(Date.now());
    setElapsedMs(0);
    setIsHoldingReadyTransition(false);
  }, []);

  const holdReadyTransition = useCallback(() => {
    if (!isMountedRef.current) {
      return;
    }

    setIsHoldingReadyTransition(true);
    setProcessingStartedAt((current) => current ?? Date.now());
  }, []);

  const isFailed = !optimisticProcessing && document?.study_guide_status === "failed";
  const isReady = document?.study_guide_status === "ready";
  const isUnsupported =
    !optimisticProcessing &&
    (document?.document_type === "UNSUPPORTED" ||
      document?.error_code === "DOCUMENT_UNSUPPORTED");
  const isProcessing = optimisticProcessing || document?.study_guide_status === "processing";
  const isIdle = !optimisticProcessing && (document?.study_guide_status === "idle" || document?.study_guide_status == null);

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

  useEffect(() => {
    if (!id) return;

    let cancelled = false;
    const controller = new AbortController();

    const load = async () => {
      try {
        const next = await refreshDocument(controller.signal);
        if (cancelled || !isMountedRef.current) {
          return;
        }

        if (!next) {
          setError("Document not found.");
          return;
        }

        if (next.study_guide_status === "ready") {
          holdReadyTransition();
          setError(null);
          return;
        }

        setError(getStudyGuideFailureMessage(next));
      } catch (err) {
        if (cancelled || !isMountedRef.current || isAbortError(err)) {
          return;
        }

        setError(getErrorMessage(err, "Unable to load document status."));
      }
    };

    void load();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [holdReadyTransition, id, refreshDocument]);

  const startGeneration = useCallback(
    async () => {
      if (!id || isStarting) return;

      if (isMountedRef.current) {
        setIsStarting(true);
        setError(null);
        setOptimisticProcessing(true);
        beginVisualSequence();
      }

      try {
        await api<{ status: string; cached?: boolean }>("/api/study-guide/create", {
          method: "POST",
          body: JSON.stringify({ document_id: id }),
        });

        if (!isMountedRef.current) {
          return;
        }

        const next = await refreshDocument();
        if (!isMountedRef.current) {
          return;
        }

        if (next?.study_guide_status === "ready") {
          holdReadyTransition();
          return;
        }

        setError(getStudyGuideFailureMessage(next ?? null));
      } catch (err) {
        if (isMountedRef.current) {
          setOptimisticProcessing(false);
          if (
            err instanceof ApiClientError &&
            (err.code === "ALREADY_PROCESSING" || err.code === "ILLEGAL_RETRY_STATE")
          ) {
            void refreshDocument().then((next) => {
              if (!isMountedRef.current) {
                return;
              }
              setError(getStudyGuideFailureMessage(next ?? null));
            });
          }

          const fallback =
            err instanceof ApiClientError && err.code === "ALREADY_PROCESSING"
              ? "Study guide generation is already in progress."
              : "Unable to start study guide generation.";
          setError(getErrorMessage(err, fallback));
        }
      } finally {
        if (isMountedRef.current) {
          setIsStarting(false);
        }
      }
    },
    [beginVisualSequence, holdReadyTransition, id, isStarting, refreshDocument]
  );

  const retryGeneration = useCallback(async () => {
    if (!id) return;

    if (isMountedRef.current) {
      setIsRetrying(true);
      setOptimisticProcessing(true);
      setError(null);
      beginVisualSequence();
    }

    try {
      await api<{ status: string; retry: boolean }>("/api/study-guide/retry", {
        method: "POST",
        body: JSON.stringify({ document_id: id }),
      });

      if (isMountedRef.current) {
        setError(null);
      }

      await refreshDocument();
    } catch (err) {
      if (isMountedRef.current) {
        setOptimisticProcessing(false);
        if (
          err instanceof ApiClientError &&
          (err.code === "ALREADY_PROCESSING" || err.code === "ILLEGAL_RETRY_STATE")
        ) {
          void refreshDocument().then((next) => {
            if (!isMountedRef.current) {
              return;
            }
            setError(getStudyGuideFailureMessage(next ?? null));
          });
        }

        setError(getErrorMessage(err, "Retry failed. Please try again."));
      }
    } finally {
      if (isMountedRef.current) {
        setIsRetrying(false);
      }
    }
  }, [beginVisualSequence, id, refreshDocument]);

  useEffect(() => {
    if (document?.study_guide_status === "processing" && processingStartedAt == null) {
      setProcessingStartedAt(Date.now());
    }

    if (document?.study_guide_status === "ready") {
      holdReadyTransition();
    }

    // Clear optimistic flag once the real server state confirms processing (or any terminal state)
    if (optimisticProcessing && document?.study_guide_status != null && document.study_guide_status !== "idle") {
      setOptimisticProcessing(false);
    }

    if (
      document?.study_guide_status !== "processing" &&
      !isRetrying &&
      !optimisticProcessing &&
      !isHoldingReadyTransition
    ) {
      setElapsedMs(0);
    }
  }, [
    document?.study_guide_status,
    holdReadyTransition,
    isHoldingReadyTransition,
    isRetrying,
    optimisticProcessing,
    processingStartedAt,
  ]);

  useEffect(() => {
    const shouldTick =
      (optimisticProcessing || document?.study_guide_status === "processing" || isHoldingReadyTransition) &&
      processingStartedAt != null;
    if (!shouldTick) return;

    const interval = window.setInterval(() => {
      setElapsedMs(Date.now() - processingStartedAt!);
    }, 800);

    return () => {
      window.clearInterval(interval);
    };
  }, [document?.study_guide_status, isHoldingReadyTransition, optimisticProcessing, processingStartedAt]);

  useEffect(() => {
    if (!shouldRunPolling(id, isPageVisible, isProcessing)) return;

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
          holdReadyTransition();
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

    timer = setTimeout(() => {
      void poll();
    }, DEFAULT_POLL_DELAY_MS);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      requestController?.abort();
    };
  }, [holdReadyTransition, id, isPageVisible, isProcessing, processingStartedAt, refreshDocument]);

  const hasCompletedVisualSequence =
    processingStartedAt != null && elapsedMs >= STEP_SEQUENCE_MIN_MS;
  const isVisuallyReady = isReady && hasCompletedVisualSequence;
  const visualStatus: GenerationStatus | undefined = isUnsupported
    ? document?.study_guide_status
    : isVisuallyReady
      ? "ready"
      : isFailed
        ? "failed"
        : isProcessing || isHoldingReadyTransition
          ? "processing"
          : document?.study_guide_status;

  useEffect(() => {
    if (!isReady || !hasCompletedVisualSequence) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (!isMountedRef.current) {
        return;
      }

      router.replace(`/documents/${id}`);
    }, READY_REDIRECT_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [hasCompletedVisualSequence, id, isReady, router]);

  const statusLine = useMemo(() => {
    if (isUnsupported) return "This document type is not supported.";
    if (!document) return "Waiting for document status...";
    if (isVisuallyReady) return "Study guide is ready.";
    if (document.study_guide_status === "failed") return "Study guide generation failed.";
    if (isHoldingReadyTransition) return "Finalizing study guide...";
    if (document.study_guide_status === "processing") return "Generating study guide...";
    return "Queued for generation...";
  }, [document, isHoldingReadyTransition, isUnsupported, isVisuallyReady]);

  const progressLabel = useMemo(() => {
    if (isVisuallyReady) return "100% complete";
    if (document?.error_code === "DOCUMENT_UNSUPPORTED") return "Unsupported document";
    if (isFailed) return "Generation interrupted";
    if (!document) return "Preparing…";
    if (document.study_guide_status === "idle") return "Waiting for your action";
    return "Usually takes around 30–60 seconds";
  }, [document, isFailed, isVisuallyReady]);

  const visualStepIndex = useMemo(() => {
    if (isVisuallyReady) return 5;
    if (isFailed) return 3;
    if (!document || document.study_guide_status === "idle") return 0;
    if (elapsedMs < STEP_SEQUENCE_THRESHOLDS_MS[0]) return 1;
    if (elapsedMs < STEP_SEQUENCE_THRESHOLDS_MS[1]) return 2;
    if (elapsedMs < STEP_SEQUENCE_THRESHOLDS_MS[2]) return 3;
    if (elapsedMs < STEP_SEQUENCE_THRESHOLDS_MS[3]) return 4;
    return 5;
  }, [document, elapsedMs, isFailed, isVisuallyReady]);

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

      if (isVisuallyReady || visualStepIndex > stepNumber) {
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
  }, [isFailed, isVisuallyReady, visualStepIndex]);

	 const completionPercent = useMemo(() => {
	  if (isVisuallyReady) return 100;
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
	}, [isFailed, isVisuallyReady, visualStepIndex]);

  const statusPill = useMemo(() => {
    if (isUnsupported) return { label: "Unsupported", tone: "danger" as const };
    if (isFailed) return { label: "Failed", tone: "danger" as const };
    if (isVisuallyReady) return { label: "Ready", tone: "success" as const };
    if (document?.study_guide_status === "idle") return { label: "Not started", tone: "neutral" as const };
    return { label: "Processing", tone: "neutral" as const };
  }, [document?.study_guide_status, isFailed, isUnsupported, isVisuallyReady]);

  if (!id) {
    return <p className="px-6 py-10 text-sm text-gray-600">Missing document id.</p>;
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#fafafa]">
      <div className="mx-auto flex w-full max-w-4xl flex-col px-6 py-10 md:px-8 md:py-14">
        <div className="mx-auto flex w-full max-w-2xl flex-col items-center text-center">
          <ProcessingGlyph failed={isFailed} />

          <h1 className="mt-7 max-w-2xl text-3xl font-semibold tracking-tight text-gray-950 md:text-4xl">
            {isUnsupported ? "Document not supported" : getStatusHeading(visualStatus)}
          </h1>

          <p className="mt-3 max-w-xl text-sm leading-7 text-gray-600 md:text-base">
            {isUnsupported
              ? "This document type is not supported for study guide generation. Please upload a different document."
              : getStatusDescription(visualStatus)}
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
                  isUnsupported
                    ? "bg-amber-500"
                    : isFailed
                      ? "bg-rose-500"
                      : isVisuallyReady
                        ? "bg-emerald-500"
                        : "bg-gray-950",
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
                Generation begins only when you trigger it. Once it is processing, you can leave this page and return from the dashboard at any time.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                {isUnsupported ? (
                  <Link
                    href="/upload"
                    className="inline-flex items-center justify-center rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                  >
                    Upload a different document
                  </Link>
                ) : isIdle ? (
                  <button
                    type="button"
                    onClick={() => {
                      void startGeneration();
                    }}
                    disabled={isStarting}
                    className="inline-flex items-center justify-center rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isStarting ? "Starting..." : "Create Study Guide"}
                  </button>
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
