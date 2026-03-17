"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ApiClientError, api } from "@/lib/api";
import type { DocumentListItem, Quiz } from "@/lib/contracts";
import { getDocumentStatus } from "@/lib/data/documents";
import { getErrorMessage } from "@/lib/errorUx";
import {
  DEFAULT_POLL_DELAY_MS,
  shouldResetQuizStateOnFlowStart,
  shouldRunPolling,
  toPollDelayMs,
} from "@/lib/polling";
import { usePageVisible } from "@/lib/usePageVisible";

type QuizState = "idle" | "loading" | "ready" | "failed" | "blocked";

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function getAnswerIndex(answer: string, options: string[]): number {
  const trimmed = answer.trim();
  if (/^[A-D]$/i.test(trimmed)) {
    return trimmed.toUpperCase().charCodeAt(0) - "A".charCodeAt(0);
  }
  return options.findIndex((option) => option === trimmed);
}

export default function QuizPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [doc, setDoc] = useState<DocumentListItem | null>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [state, setState] = useState<QuizState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const isPageVisible = usePageVisible();
  const isMountedRef = useRef(true);
  const hasLoadedQuizRef = useRef(false);
  const autoStartFiredRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    hasLoadedQuizRef.current = false;
    autoStartFiredRef.current = false;
  }, [id]);

  useEffect(() => {
    hasLoadedQuizRef.current = quiz != null;
  }, [quiz]);

  const refreshDocument = useMemo(
    () => async (signal?: AbortSignal): Promise<DocumentListItem | null> => {
      const next = await getDocumentStatus(id, { signal });
      if (isMountedRef.current) {
        setDoc(next);
      }
      return next;
    },
    [id]
  );

  const fetchQuiz = useMemo(
    () => async (signal?: AbortSignal): Promise<boolean> => {
      try {
        const response = await api<Quiz>(`/api/quiz/${id}`, signal ? { signal } : {});
        if (isMountedRef.current) {
          hasLoadedQuizRef.current = true;
          setQuiz(response);
          setState("ready");
        }
        return true;
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 404) {
          return false;
        }
        throw err;
      }
    },
    [id]
  );

  const syncStateFromDocument = useCallback(
    async (nextDoc: DocumentListItem | null): Promise<void> => {
      if (!isMountedRef.current) {
        return;
      }

      if (!nextDoc) {
        setState("failed");
        setError("Document not found.");
        return;
      }

      if (nextDoc.quiz_status === "ready") {
        const fetched = await fetchQuiz();
        if (!isMountedRef.current) {
          return;
        }

        if (fetched) {
          setError(null);
          return;
        }
      }

      if (nextDoc.quiz_status === "failed") {
        setState("failed");
        setError(nextDoc.error_message ?? "Quiz generation failed.");
        return;
      }

      setState("loading");
      setError(null);
    },
    [fetchQuiz]
  );

  useEffect(() => {
    if (!id) return;

    let cancelled = false;
    const controller = new AbortController();

    const load = async () => {
      try {
        const nextDoc = await refreshDocument(controller.signal);
        if (cancelled || !isMountedRef.current) {
          return;
        }

        if (!nextDoc) {
          setState("failed");
          setError("Document not found.");
          return;
        }

        if (nextDoc.document_type !== "LECTURE") {
          setState("blocked");
          setError("Quiz is available only for lecture documents.");
          return;
        }

        if (nextDoc.quiz_status === "ready") {
          const fetched = await fetchQuiz(controller.signal);
          if (cancelled || !isMountedRef.current) {
            return;
          }

          if (fetched) {
            setError(null);
            return;
          }

          setState("loading");
          setError(null);
          return;
        }

        if (nextDoc.quiz_status === "failed") {
          setState("failed");
          setError(nextDoc.error_message ?? "Quiz generation failed.");
          return;
        }

        setState(nextDoc.quiz_status === "processing" ? "loading" : "idle");
        setError(null);
      } catch (err) {
        if (cancelled || !isMountedRef.current || isAbortError(err)) {
          return;
        }

        setState("failed");
        setError(getErrorMessage(err, "Unable to load quiz right now."));
      }
    };

    void load();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [fetchQuiz, id, refreshDocument]);

  useEffect(() => {
    const shouldPollWhileLoading = state === "loading";
    if (!shouldRunPolling(id, isPageVisible, shouldPollWhileLoading || doc?.quiz_status === "processing")) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let requestController: AbortController | null = null;

    const nextSignal = (): AbortSignal => {
      requestController?.abort();
      requestController = new AbortController();
      return requestController.signal;
    };

    const schedulePoll = (delayMs: number) => {
      if (cancelled) return;
      timer = setTimeout(() => {
        void pollOnce();
      }, delayMs);
    };

    const pollOnce = async () => {
      let nextDelayMs = DEFAULT_POLL_DELAY_MS;
      try {
        const latest = await refreshDocument(nextSignal());
        if (!latest) {
          if (!cancelled) {
            setState("failed");
            setError("Document not found.");
          }
          return;
        }

        if (latest.quiz_status === "ready") {
          const fetched = await fetchQuiz(nextSignal());
          if (fetched) {
            if (!cancelled) {
              setError(null);
            }
            return;
          }
        }

        if (latest.quiz_status === "failed") {
          if (!cancelled) {
            setState("failed");
            setError(latest.error_message ?? "Quiz generation failed.");
          }
          return;
        }

        if (!cancelled) {
          setState("loading");
          setError(null);
        }
      } catch (err) {
        if (isAbortError(err)) {
          return;
        }
        if (
          err instanceof ApiClientError &&
          (err.code === "RATE_LIMITED" || err.code === "ALREADY_PROCESSING")
        ) {
          if (!cancelled) {
            setError(getErrorMessage(err, "Temporary backend limit reached."));
          }
          nextDelayMs = toPollDelayMs(err.retryAfterSeconds);
        } else {
          if (!cancelled) {
            setState("failed");
            setError(getErrorMessage(err, "Unable to load quiz right now."));
          }
          return;
        }
      }

      schedulePoll(nextDelayMs);
    };

    schedulePoll(DEFAULT_POLL_DELAY_MS);

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
      requestController?.abort();
    };
  }, [doc?.quiz_status, fetchQuiz, id, isPageVisible, refreshDocument, state]);

  const handleStart = useCallback(async () => {
    if (!id || isStarting) return;

    if (isMountedRef.current) {
      setIsStarting(true);
    }

    if (shouldResetQuizStateOnFlowStart(hasLoadedQuizRef.current)) {
      setState("loading");
      setError(null);
      setQuiz(null);
      setIndex(0);
      setSelected(null);
      setChecked(false);
    }

    try {
      const response = await api<{ status: string; cached?: boolean }>(
        "/api/quiz/create",
        {
          method: "POST",
          body: JSON.stringify({ document_id: id }),
        }
      );

      if (response.status === "ready") {
        const fetched = await fetchQuiz();
        if (fetched && isMountedRef.current) {
          setError(null);
        }
        return;
      }

      const nextDoc = await refreshDocument();
      if (!nextDoc) {
        if (isMountedRef.current) {
          setState("failed");
          setError("Document not found.");
        }
        return;
      }

      await syncStateFromDocument(nextDoc);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "DOCUMENT_NOT_LECTURE") {
        if (isMountedRef.current) {
          setState("blocked");
          setError("Quiz is available only for lecture documents.");
        }
      } else if (isMountedRef.current) {
        if (
          err instanceof ApiClientError &&
          (err.code === "ALREADY_PROCESSING" || err.code === "ILLEGAL_RETRY_STATE")
        ) {
          void refreshDocument().then(async (nextDoc) => {
            await syncStateFromDocument(nextDoc);
          });
        }

        const fallback =
          err instanceof ApiClientError && err.code === "ALREADY_PROCESSING"
            ? "Quiz generation is already in progress."
            : "Unable to start quiz generation.";
        setError(getErrorMessage(err, fallback));
        if (doc?.quiz_status === "processing") {
          setState("loading");
        } else {
          setState("failed");
        }
      }
    } finally {
      if (isMountedRef.current) {
        setIsStarting(false);
      }
    }
  }, [doc?.quiz_status, fetchQuiz, id, isStarting, refreshDocument, syncStateFromDocument]);

  // Auto-start quiz generation when state becomes "idle" (no quiz exists yet).
  // This removes the intermediate "Generate quiz" confirmation page — clicking
  // "Test Your Knowledge" from the study guide now triggers generation immediately.
  useEffect(() => {
    if (state === "idle" && !autoStartFiredRef.current) {
      autoStartFiredRef.current = true;
      void handleStart();
    }
  }, [state, handleStart]);

  async function handleRetry() {
    if (!id || isRetrying) return;

    if (isMountedRef.current) {
      setIsRetrying(true);
    }
    try {
      await api<{ status: string; retry: boolean }>(
        "/api/quiz/retry",
        {
          method: "POST",
          body: JSON.stringify({ document_id: id }),
        }
      );

      const nextDoc = await refreshDocument();
      if (isMountedRef.current) {
        await syncStateFromDocument(nextDoc);
      }
    } catch (err) {
      if (
        err instanceof ApiClientError &&
        (err.code === "ALREADY_PROCESSING" || err.code === "RATE_LIMITED")
      ) {
        if (isMountedRef.current) {
          if (err.code === "ALREADY_PROCESSING") {
            void refreshDocument().then(async (nextDoc) => {
              await syncStateFromDocument(nextDoc);
            });
          }
          setError(getErrorMessage(err, "Quiz generation is already in progress."));
          setState(doc?.quiz_status === "processing" ? "loading" : "failed");
        }
      } else {
        if (isMountedRef.current) {
          setError(getErrorMessage(err, "Retry failed."));
        }
      }
    } finally {
      if (isMountedRef.current) {
        setIsRetrying(false);
      }
    }
  }

  const current = useMemo(() => {
    if (!quiz) return null;
    return quiz.questions[index] ?? null;
  }, [index, quiz]);

  const isLast = quiz ? index === quiz.questions.length - 1 : false;
  const answerIndex = current ? getAnswerIndex(current.answer, current.options) : -1;
  const isCorrect = checked && selected != null && selected === answerIndex;
  const progressPercent = quiz ? ((index + 1) / quiz.questions.length) * 100 : 0;

  if (!id) {
    return <p className="px-1 py-4 text-sm text-gray-600">Missing document id.</p>;
  }

  if (state === "loading" || state === "idle") {
    return (
      <div className="mx-auto flex min-h-[55vh] w-full max-w-3xl flex-col items-center justify-center gap-6 px-4 py-10 sm:px-6 sm:py-14">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-gray-900" />
        <div className="space-y-2 text-center">
          <h1 className="text-xl font-semibold text-gray-900">Generating your quiz...</h1>
          <p className="text-sm text-gray-500">
            We&apos;re creating practice questions from your lecture.
          </p>
          <p className="text-xs text-gray-400">This may take a few seconds. Please don&apos;t close this page.</p>
        </div>
        {error ? (
          <div className="w-full max-w-xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            {error}
          </div>
        ) : null}
        <Link href={`/documents/${id}`} className="text-sm text-gray-500 underline hover:text-gray-700">
          Back to Study Guide
        </Link>
      </div>
    );
  }

  if (state === "blocked") {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 px-1 py-2 sm:py-4">
        <h1 className="text-2xl font-semibold text-gray-900">Quiz unavailable</h1>
        <p className="text-sm text-gray-600">{error}</p>
        <Link href={`/documents/${id}`} className="text-sm underline">
          Back to Document
        </Link>
      </div>
    );
  }

  if (state === "failed") {
    // Use /api/quiz/retry only when the backend recorded a failure;
    // otherwise fall back to /api/quiz/create so we don't hit ILLEGAL_RETRY_STATE.
    const canRetry = doc?.quiz_status === "failed";
    const retryInProgress = canRetry ? isRetrying : isStarting;

    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 px-1 py-2 sm:py-4">
        <h1 className="text-2xl font-semibold text-gray-900">Quiz generation failed</h1>
        <p className="text-sm text-rose-700">{error ?? "Unable to generate quiz."}</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => {
              if (canRetry) {
                void handleRetry();
              } else {
                autoStartFiredRef.current = false;
                void handleStart();
              }
            }}
            disabled={retryInProgress}
            className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {retryInProgress ? "Retrying..." : "Retry quiz"}
          </button>
          <Link href={`/documents/${id}`} className="rounded-xl border px-4 py-2 text-center text-sm font-semibold sm:w-auto">
            Back to Document
          </Link>
        </div>
      </div>
    );
  }

  if (!quiz || !current) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 px-1 py-2 sm:py-4">
        <h1 className="text-2xl font-semibold text-gray-900">Quiz</h1>
        <p className="text-sm text-gray-600">No quiz questions available yet.</p>
        <Link href={`/documents/${id}`} className="text-sm underline">
          Back to Document
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-gray-500">{doc?.filename ?? "Lecture Quiz"}</p>
          <h1 className="text-2xl font-semibold text-gray-900">
            Question {index + 1} of {quiz.questions.length}
          </h1>
        </div>
        <Link
          href={`/documents/${id}`}
          className="inline-flex w-full items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50 sm:w-auto"
        >
          Back to Study Guide
        </Link>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-gray-900 transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="rounded-2xl border bg-white p-4 shadow-sm sm:p-6">
        <p className="text-sm font-semibold text-gray-900">Question</p>
        <p className="mt-2 whitespace-pre-line text-sm text-gray-700">{current.question}</p>

        <div className="mt-5 space-y-3">
          {current.options.map((option, optionIndex) => {
            const isSelected = selected === optionIndex;
            const isCorrectOption = optionIndex === answerIndex;

            let optionStyle = "border-gray-200 bg-white hover:bg-gray-50";
            if (checked) {
              if (isCorrectOption) {
                optionStyle = "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500";
              } else if (isSelected) {
                optionStyle = "border-rose-500 bg-rose-50 ring-1 ring-rose-500";
              } else {
                optionStyle = "border-gray-200 bg-white opacity-60";
              }
            } else if (isSelected) {
              optionStyle = "border-gray-900 bg-gray-50 ring-1 ring-gray-900";
            }

            return (
              <button
                key={option}
                type="button"
                onClick={() => {
                  if (!checked) {
                    setSelected(optionIndex);
                  }
                }}
                disabled={checked}
                className={[
                  "w-full rounded-xl border px-4 py-3 text-left text-sm transition",
                  checked ? "cursor-default" : "",
                  optionStyle,
                ].join(" ")}
              >
                <span className="flex items-center justify-between gap-2">
                  <span>{option}</span>
                  {checked && isCorrectOption ? (
                    <span className="shrink-0 text-emerald-600 font-semibold text-xs">Correct</span>
                  ) : null}
                  {checked && isSelected && !isCorrectOption ? (
                    <span className="shrink-0 text-rose-600 font-semibold text-xs">Incorrect</span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>

        {/* Feedback panel after checking */}
        {checked ? (
          <div className={[
            "mt-5 rounded-xl p-4",
            isCorrect ? "bg-emerald-50 border border-emerald-200" : "bg-rose-50 border border-rose-200",
          ].join(" ")}>
            <p className={[
              "text-sm font-semibold",
              isCorrect ? "text-emerald-800" : "text-rose-800",
            ].join(" ")}>
              {isCorrect ? "Correct!" : "Not quite"}
            </p>
            <p className="mt-2 text-sm text-gray-700">
              {answerIndex >= 0 ? current.options[answerIndex] : current.answer}
            </p>
            {current.supporting_quote ? (
              <p className="mt-1 text-xs text-gray-500 italic">
                {current.supporting_quote}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Action buttons */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {!checked ? (
            <button
              type="button"
              onClick={() => setChecked(true)}
              disabled={selected == null}
              className="w-full rounded-xl bg-black px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto"
            >
              Check Answer
            </button>
          ) : (
            <div className="hidden sm:block" />
          )}

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
            {checked && !isLast ? (
              <button
                type="button"
                onClick={() => {
                  setIndex((value) => Math.min(value + 1, quiz.questions.length - 1));
                  setSelected(null);
                  setChecked(false);
                }}
                className="w-full rounded-xl bg-black px-5 py-2.5 text-sm font-semibold text-white hover:bg-black/90 sm:w-auto"
              >
                Next Question
              </button>
            ) : null}
            {checked && isLast ? (
              <Link
                href={`/documents/${id}`}
                className="inline-flex w-full items-center justify-center rounded-xl bg-black px-5 py-2.5 text-sm font-semibold text-white hover:bg-black/90 sm:w-auto"
              >
                Finish Quiz
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
