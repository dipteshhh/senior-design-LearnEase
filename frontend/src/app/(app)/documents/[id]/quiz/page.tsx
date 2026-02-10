"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getQuizByDocumentId } from "@/lib/mock/store";

type QuizQuestion = {
  id: string;
  prompt: string;
  choices: string[];
  answerIndex: number;
  explanation?: string;
};

export default function QuizPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id; // ✅ this fixes "undefined" issue

  // Safety: if route param is missing, show a friendly fallback
  if (!id) {
    return (
      <div className="p-8">
        <p className="text-sm text-gray-600">Quiz route is missing document id.</p>
        <Link href="/dashboard" className="mt-4 inline-block underline">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const quiz = useMemo(() => getQuizByDocumentId(id), [id]);

  const questions: QuizQuestion[] = quiz.questions ?? [];
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);

  const current = questions[index];

  const isLast = index === questions.length - 1;
  const canGoNext = selected !== null;

  function onSelect(i: number) {
    setSelected(i);
    setChecked(false);
  }

  function onCheck() {
    if (selected === null) return;
    setChecked(true);
  }

  function onNext() {
    if (!canGoNext) return;
    setIndex((v) => Math.min(v + 1, questions.length - 1));
    setSelected(null);
    setChecked(false);
  }

  function onPrev() {
    setIndex((v) => Math.max(v - 1, 0));
    setSelected(null);
    setChecked(false);
  }

  // If no questions exist, render a stable empty state
  if (!current) {
    return (
      <div className="p-8 space-y-4">
        <h1 className="text-2xl font-semibold text-gray-900">Quiz</h1>
        <p className="text-sm text-gray-600">
          No quiz questions available yet for <span className="font-medium">{id}</span>.
        </p>
        <div className="flex gap-3">
          <Link href={`/documents/${id}`} className="underline">
            Back to Document
          </Link>
          <Link href="/dashboard" className="underline">
            Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const isCorrect = checked && selected === current.answerIndex;

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-gray-500">{quiz.title}</p>
          <h1 className="text-2xl font-semibold text-gray-900">
            Question {index + 1} of {questions.length}
          </h1>
        </div>

        <Link
          href={`/documents/${id}`}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
        >
          Back to Study Guide
        </Link>
      </div>

      {/* Card */}
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-gray-900">Question</p>
        <p className="mt-2 text-sm text-gray-700 whitespace-pre-line">
          {current.prompt}
        </p>

        {/* Choices */}
        <div className="mt-5 space-y-3">
          {current.choices.map((c, i) => {
            const active = selected === i;
            return (
              <button
                key={c}
                type="button"
                onClick={() => onSelect(i)}
                className={[
                  "w-full rounded-xl border px-4 py-3 text-left text-sm transition",
                  active
                    ? "border-gray-900 bg-gray-50"
                    : "border-gray-200 bg-white hover:bg-gray-50",
                ].join(" ")}
                aria-pressed={active}
              >
                {c}
              </button>
            );
          })}
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onCheck}
            disabled={selected === null}
            className="rounded-xl bg-black px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Check Answer
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onPrev}
              disabled={index === 0}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-900 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!canGoNext || isLast}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-900 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>

        {/* Feedback */}
        {checked && (
          <div className="mt-6 rounded-xl bg-gray-50 p-4">
            <p className="text-sm font-semibold text-gray-900">
              {isCorrect ? "✅ Correct" : "❌ Not quite"}
            </p>
            <p className="mt-2 text-sm text-gray-700">
              {current.explanation ?? "No explanation yet."}
            </p>
          </div>
        )}
      </div>

      <Link href={`/documents/${id}`} className="text-sm underline">
        Back to Document
      </Link>
    </div>
  );
}
