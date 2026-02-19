"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ApiClientError, api } from "@/lib/api";
import type { DocumentListItem } from "@/lib/contracts";
import { getDocumentStatus } from "@/lib/data/documents";
import { getErrorMessage } from "@/lib/errorUx";
import { DEFAULT_POLL_DELAY_MS, getTransientDelayMs, toPollDelayMs } from "@/lib/polling";

export default function ProcessingPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [document, setDocument] = useState<DocumentListItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const isFailed = document?.study_guide_status === "failed";
  const isReady = document?.study_guide_status === "ready";

  const refreshDocument = useCallback(async () => {
    const next = await getDocumentStatus(id);
    if (isMountedRef.current) {
      setDocument(next);
    }
    return next;
  }, [id]);

  const startGeneration = useCallback(async (): Promise<number> => {
    if (!id) return DEFAULT_POLL_DELAY_MS;
    try {
      await api<{ status: string; cached?: boolean }>(
        "/api/study-guide/create",
        {
          method: "POST",
          body: JSON.stringify({ document_id: id }),
        }
      );
      if (isMountedRef.current) {
        setError(null);
      }
      return DEFAULT_POLL_DELAY_MS;
    } catch (err) {
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
  }, [id]);

  const retryGeneration = useCallback(async () => {
    if (!id) return;
    if (isMountedRef.current) {
      setIsRetrying(true);
    }
    try {
      await api<{ status: string; retry: boolean }>(
        "/api/study-guide/retry",
        {
          method: "POST",
          body: JSON.stringify({ document_id: id }),
        }
      );
      if (isMountedRef.current) {
        setError(null);
      }
      await refreshDocument();
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
    if (!id) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      let nextDelayMs = DEFAULT_POLL_DELAY_MS;
      try {
        const next = await refreshDocument();
        if (cancelled || !isMountedRef.current) {
          return;
        }

        if (!next) {
          setError("Document not found.");
          return;
        }

        if (next.study_guide_status === "ready") {
          router.replace(`/documents/${id}`);
          return;
        }

        if (next.study_guide_status === "failed") {
          setError(next.error_message ?? "Study guide generation failed.");
          return;
        }
        setError(null);
      } catch (err) {
        if (cancelled || !isMountedRef.current) {
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

    void startGeneration().then((initialDelayMs) => {
      if (!cancelled) {
        timer = setTimeout(() => {
          void poll();
        }, initialDelayMs ?? DEFAULT_POLL_DELAY_MS);
      }
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [id, refreshDocument, router, startGeneration]);

  const statusLine = useMemo(() => {
    if (!document) return "Waiting for document status...";
    if (document.study_guide_status === "ready") return "Study guide is ready.";
    if (document.study_guide_status === "failed") return "Study guide generation failed.";
    if (document.study_guide_status === "processing") return "Generating study guide...";
    return "Queued for generation...";
  }, [document]);

  if (!id) {
    return <p className="text-sm text-gray-600">Missing document id.</p>;
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-6 py-10">
      <div className="rounded-2xl border bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">Creating your study guide</h1>
        <p className="mt-2 text-sm text-gray-600">{statusLine}</p>

        <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className={[
              "h-full rounded-full transition-all",
              isFailed ? "w-full bg-rose-500" : isReady ? "w-full bg-emerald-500" : "w-2/3 bg-gray-900",
            ].join(" ")}
          />
        </div>

        {error ? (
          <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          {isFailed ? (
            <button
              type="button"
              onClick={() => {
                void retryGeneration();
              }}
              disabled={isRetrying}
              className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRetrying ? "Retrying..." : "Retry generation"}
            </button>
          ) : null}

          <Link
            href="/dashboard"
            className="rounded-xl border px-4 py-2 text-sm font-semibold text-gray-900"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
