"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ApiClientError, api } from "@/lib/api";
import type { DocumentListItem, Quiz } from "@/lib/contracts";
import { getDocumentStatus } from "@/lib/data/documents";
import { getErrorMessage } from "@/lib/errorUx";
import { DEFAULT_POLL_DELAY_MS, toPollDelayMs } from "@/lib/polling";

type QuizState = "loading" | "ready" | "failed" | "blocked";

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
  const [isRetrying, setIsRetrying] = useState(false);
  const [pollTrigger, setPollTrigger] = useState(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!id) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedulePoll = (delayMs: number) => {
      if (cancelled) return;
      timer = setTimeout(() => {
        void pollOnce();
      }, delayMs);
    };

    const refreshDocument = async (): Promise<DocumentListItem | null> => {
      const next = await getDocumentStatus(id);
      if (!cancelled) {
        setDoc(next);
      }
      return next;
    };

    const fetchQuiz = async (): Promise<boolean> => {
      try {
        const response = await api<Quiz>(`/api/quiz/${id}`);
        if (!cancelled) {
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
    };

    const pollOnce = async () => {
      let nextDelayMs = DEFAULT_POLL_DELAY_MS;
      try {
        const latest = await refreshDocument();
        if (!latest) {
          if (!cancelled) {
            setState("failed");
            setError("Document not found.");
          }
          return;
        }

        if (latest.quiz_status === "ready") {
          const fetched = await fetchQuiz();
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
          setError(null);
        }
      } catch (err) {
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

    const startFlow = async () => {
      if (!cancelled) {
        setState("loading");
        setError(null);
        setQuiz(null);
        setIndex(0);
        setSelected(null);
        setChecked(false);
      }

      try {
        const nextDoc = await refreshDocument();
        if (!nextDoc) {
          if (!cancelled) {
            setState("failed");
            setError("Document not found.");
          }
          return;
        }

        if (nextDoc.document_type !== "LECTURE") {
          if (!cancelled) {
            setState("blocked");
            setError("Quiz is available only for lecture documents.");
          }
          return;
        }

        let initialDelayMs = DEFAULT_POLL_DELAY_MS;
        try {
          const createResponse = await api<{ status: string; cached?: boolean }>(
            "/api/quiz/create",
            {
              method: "POST",
              body: JSON.stringify({ document_id: id }),
            }
          );

          if (createResponse.status === "ready") {
            const fetched = await fetchQuiz();
            if (fetched) {
              if (!cancelled) {
                setError(null);
              }
              return;
            }
          }
        } catch (err) {
          if (err instanceof ApiClientError) {
            if (err.code === "ALREADY_PROCESSING") {
              if (!cancelled) {
                setError(getErrorMessage(err, "Quiz generation is already in progress."));
              }
              initialDelayMs = toPollDelayMs(err.retryAfterSeconds);
            } else if (err.code === "RATE_LIMITED") {
              if (!cancelled) {
                setError(getErrorMessage(err, "Too many requests right now."));
              }
              initialDelayMs = toPollDelayMs(err.retryAfterSeconds);
            } else if (err.code === "ILLEGAL_RETRY_STATE") {
              // Poll current status below.
            } else if (err.code === "DOCUMENT_NOT_LECTURE") {
              if (!cancelled) {
                setState("blocked");
                setError("Quiz is available only for lecture documents.");
              }
              return;
            } else {
              throw err;
            }
          } else {
            throw err;
          }
        }

        schedulePoll(initialDelayMs);
      } catch (err) {
        if (!cancelled) {
          setState("failed");
          setError(getErrorMessage(err, "Unable to load quiz right now."));
        }
      }
    };

    void startFlow();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [id, pollTrigger]);

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
      if (isMountedRef.current) {
        setError(null);
        setPollTrigger((value) => value + 1);
      }
    } catch (err) {
      if (
        err instanceof ApiClientError &&
        (err.code === "ALREADY_PROCESSING" || err.code === "RATE_LIMITED")
      ) {
        if (isMountedRef.current) {
          setError(getErrorMessage(err, "Quiz generation is already in progress."));
          setPollTrigger((value) => value + 1);
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

  if (!id) {
    return <p className="text-sm text-gray-600">Missing document id.</p>;
  }

  if (state === "loading") {
    return (
      <div className="space-y-6 p-8 animate-pulse">
        <div className="space-y-2">
          <div className="h-4 w-32 rounded bg-gray-100" />
          <div className="h-7 w-56 rounded-lg bg-gray-200" />
        </div>
        <div className="rounded-2xl border bg-white p-6 shadow-sm space-y-4">
          <div className="h-4 w-20 rounded bg-gray-200" />
          <div className="h-4 w-full rounded bg-gray-100" />
          <div className="h-4 w-3/4 rounded bg-gray-100" />
          <div className="space-y-3 mt-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (state === "blocked") {
    return (
      <div className="space-y-4 p-8">
        <h1 className="text-2xl font-semibold text-gray-900">Quiz unavailable</h1>
        <p className="text-sm text-gray-600">{error}</p>
        <Link href={`/documents/${id}`} className="text-sm underline">
          Back to Document
        </Link>
      </div>
    );
  }

  if (state === "failed") {
    return (
      <div className="space-y-4 p-8">
        <h1 className="text-2xl font-semibold text-gray-900">Quiz generation failed</h1>
        <p className="text-sm text-rose-700">{error ?? "Unable to generate quiz."}</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              void handleRetry();
            }}
            disabled={isRetrying}
            className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRetrying ? "Retrying..." : "Retry quiz"}
          </button>
          <Link href={`/documents/${id}`} className="rounded-xl border px-4 py-2 text-sm font-semibold">
            Back to Document
          </Link>
        </div>
      </div>
    );
  }

  if (!quiz || !current) {
    return (
      <div className="space-y-4 p-8">
        <h1 className="text-2xl font-semibold text-gray-900">Quiz</h1>
        <p className="text-sm text-gray-600">No quiz questions available yet.</p>
        <Link href={`/documents/${id}`} className="text-sm underline">
          Back to Document
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-gray-500">{doc?.filename ?? "Lecture Quiz"}</p>
          <h1 className="text-2xl font-semibold text-gray-900">
            Question {index + 1} of {quiz.questions.length}
          </h1>
        </div>
        <Link
          href={`/documents/${id}`}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
        >
          Back to Study Guide
        </Link>
      </div>

      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-gray-900">Question</p>
        <p className="mt-2 whitespace-pre-line text-sm text-gray-700">{current.question}</p>

        <div className="mt-5 space-y-3">
          {current.options.map((option, optionIndex) => {
            const active = selected === optionIndex;
            return (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setSelected(optionIndex);
                  setChecked(false);
                }}
                className={[
                  "w-full rounded-xl border px-4 py-3 text-left text-sm transition",
                  active ? "border-gray-900 bg-gray-50" : "border-gray-200 bg-white hover:bg-gray-50",
                ].join(" ")}
              >
                {option}
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setChecked(true)}
            disabled={selected == null}
            className="rounded-xl bg-black px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Check Answer
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setIndex((value) => Math.max(value - 1, 0));
                setSelected(null);
                setChecked(false);
              }}
              disabled={index === 0}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-900 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => {
                setIndex((value) => Math.min(value + 1, quiz.questions.length - 1));
                setSelected(null);
                setChecked(false);
              }}
              disabled={selected == null || isLast}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-900 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>

        {checked ? (
          <div className="mt-6 rounded-xl bg-gray-50 p-4">
            <p className="text-sm font-semibold text-gray-900">
              {isCorrect ? "Correct" : "Not quite"}
            </p>
            <p className="mt-2 text-sm text-gray-700">
              Answer: {answerIndex >= 0 ? current.options[answerIndex] : current.answer}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {current.supporting_quote}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
