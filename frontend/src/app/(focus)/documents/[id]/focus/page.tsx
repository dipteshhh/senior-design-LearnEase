"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Citation, DocumentDetail } from "@/lib/contracts";
import { getDocument } from "@/lib/data/documents";
import { getErrorMessage } from "@/lib/errorUx";

function QuoteIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 11H6.75A1.75 1.75 0 0 1 5 9.25V8a3 3 0 0 1 3-3" />
      <path d="M19 11h-3.25A1.75 1.75 0 0 1 14 9.25V8a3 3 0 0 1 3-3" />
      <path d="M9 11v3.25A2.75 2.75 0 0 1 6.25 17H5" />
      <path d="M18 11v3.25A2.75 2.75 0 0 1 15.25 17H14" />
    </svg>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500">
      {text}
    </div>
  );
}

function formatCitationLabel(citation: Citation): string {
  if (citation.source_type === "pdf") {
    return `Page ${citation.page}`;
  }
  return `Paragraph ${citation.paragraph}`;
}

export default function FocusModePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [focusIndex, setFocusIndex] = useState(0);

  const [citationDrawerOpen, setCitationDrawerOpen] = useState(false);
  const [activeCitations, setActiveCitations] = useState<Citation[]>([]);
  const [citationTitle, setCitationTitle] = useState("");

  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const res = await getDocument(id);
        if (!cancelled) {
          setDetail(res);
        }
      } catch (err) {
        if (!cancelled) {
          setError(getErrorMessage(err, "Unable to load focus mode."));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const studyGuide = detail?.studyGuide ?? null;
  const sections = studyGuide?.sections ?? [];
  const sectionCount = sections.length;
  const focusSection = sections[focusIndex] ?? null;

  useEffect(() => {
    if (sectionCount === 0) {
      setFocusIndex(0);
      return;
    }

    setFocusIndex((prev) => Math.max(0, Math.min(prev, sectionCount - 1)));
  }, [sectionCount]);

  const scrollToTop = useCallback(() => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }, []);

  function goToSection(index: number) {
    setFocusIndex(index);
    scrollToTop();
  }

  const goToPreviousSection = useCallback(() => {
    setFocusIndex((prev) => {
      const next = Math.max(0, prev - 1);
      if (next !== prev) scrollToTop();
      return next;
    });
  }, [scrollToTop]);

  const goToNextSection = useCallback(() => {
    setFocusIndex((prev) => {
      const next = Math.min(sectionCount - 1, prev + 1);
      if (next !== prev) scrollToTop();
      return next;
    });
  }, [scrollToTop, sectionCount]);

  function openCitationDrawer(title: string, citations: Citation[]) {
    setCitationTitle(title);
    setActiveCitations(citations);
    setCitationDrawerOpen(true);
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") {
        goToPreviousSection();
      }

      if (event.key === "ArrowRight") {
        goToNextSection();
      }

      if (event.key === "Escape") {
        if (citationDrawerOpen) {
          setCitationDrawerOpen(false);
        } else if (id) {
          router.push(`/documents/${id}?tab=sections`);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [citationDrawerOpen, goToNextSection, goToPreviousSection, id, router]);

  if (!id) {
    return <p className="p-6 text-sm text-gray-600">Missing document id.</p>;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f5f5f3] px-4 pb-8 pt-6 sm:px-6">
        <div className="mx-auto w-full max-w-5xl animate-pulse">
          <div className="flex items-start justify-between">
            <div className="h-8 w-40 rounded bg-gray-200" />
            <div className="flex gap-4">
              <div className="h-6 w-6 rounded-full bg-gray-200" />
              <div className="h-6 w-6 rounded-full bg-gray-200" />
            </div>
          </div>

          <div className="mt-10 rounded-[22px] border border-gray-200 bg-white px-6 py-10 shadow-[0_2px_8px_rgba(15,23,42,0.06)] sm:px-10 sm:py-14 lg:px-14 lg:py-16">
            <div className="h-10 w-2/3 rounded bg-gray-200" />
            <div className="mt-8 h-5 w-full rounded bg-gray-100" />
            <div className="mt-3 h-5 w-11/12 rounded bg-gray-100" />
            <div className="mt-3 h-5 w-9/12 rounded bg-gray-100" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#f5f5f3] px-4 pb-8 pt-6 sm:px-6">
        <div className="mx-auto w-full max-w-5xl">
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        </div>
      </div>
    );
  }

  if (!studyGuide || sectionCount === 0 || !focusSection) {
    return (
      <div className="min-h-screen bg-[#f5f5f3] px-4 pb-8 pt-6 sm:px-6">
        <div className="mx-auto w-full max-w-5xl">
          <EmptyState text="No sections available for focus mode." />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-[#f5f5f3] px-4 pb-8 pt-6 sm:px-6">
        <div className="mx-auto w-full max-w-5xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              aria-label="Exit focus mode"
              onClick={() => router.push(`/documents/${id}?tab=sections`)}
              className="mt-1 text-gray-500 transition hover:text-gray-800"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m18 6-12 12" />
                <path d="m6 6 12 12" />
              </svg>
            </button>

            <div className="order-last w-full sm:order-none sm:flex-1 sm:px-4">
              <h1 className="text-[18px] font-semibold tracking-tight text-gray-950">
                Focus Mode
              </h1>
              <p className="mt-1 text-[15px] text-gray-500">
                Section {focusIndex + 1} of {sectionCount}
              </p>
            </div>

            <div className="flex items-center gap-5 pt-1 text-gray-500 sm:gap-6">
              <button
                type="button"
                aria-label="Previous section"
                onClick={goToPreviousSection}
                disabled={focusIndex === 0}
                className="transition hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>

              <button
                type="button"
                aria-label="Next section"
                onClick={goToNextSection}
                disabled={focusIndex === sectionCount - 1}
                className="transition hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </div>
          </div>

          <div className="mt-8 rounded-[24px] border border-[#dedede] bg-white px-6 py-8 shadow-[0_2px_10px_rgba(15,23,42,0.06)] sm:mt-10 sm:px-10 sm:py-10 lg:px-14 lg:py-14">
            <h2 className="text-[22px] font-semibold tracking-tight text-gray-950 sm:text-[25px]">
              {focusSection.title}
            </h2>

            <p className="mt-6 text-[16px] leading-[1.95] text-gray-700 sm:mt-8">
              {focusSection.content}
            </p>

            <button
              type="button"
              onClick={() =>
                openCitationDrawer(focusSection.title, focusSection.citations)
              }
              className="mt-8 inline-flex items-center gap-2 text-[15px] font-medium text-gray-500 transition hover:text-gray-800 sm:mt-11"
            >
              <QuoteIcon />
              View source citations ({focusSection.citations.length})
            </button>
          </div>

          <div className="mt-12 flex items-center justify-center gap-3">
            {sections.map((_, index) => {
              const active = index === focusIndex;

              return (
                <button
                  key={index}
                  type="button"
                  aria-label={`Go to section ${index + 1}`}
                  onClick={() => goToSection(index)}
                  className={`rounded-full transition ${
                    active
                      ? "h-[6px] w-10 bg-black"
                      : "h-[6px] w-[6px] bg-gray-300 hover:bg-gray-400"
                  }`}
                />
              );
            })}
          </div>
        </div>
      </div>

      {citationDrawerOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            aria-label="Close citations panel"
            onClick={() => setCitationDrawerOpen(false)}
            className="absolute inset-0 bg-black/10"
          />

          <aside className="relative z-10 h-full w-full max-w-md border-l border-gray-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-5">
              <div>
                <p className="text-lg font-semibold text-gray-950">Source Citations</p>
                <p className="mt-1 text-sm text-gray-500">{citationTitle}</p>
              </div>

              <button
                type="button"
                onClick={() => setCitationDrawerOpen(false)}
                className="rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m18 6-12 12" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            <div className="h-[calc(100%-88px)] overflow-y-auto px-5 py-5">
              <div className="space-y-4">
                {activeCitations.length === 0 ? (
                  <EmptyState text="No citations available." />
                ) : (
                  activeCitations.map((citation, index) => (
                    <div
                      key={`${citation.source_type}-${index}-${formatCitationLabel(citation)}`}
                      className="rounded-2xl border border-gray-200 bg-white p-4"
                    >
                      <p className="text-sm font-semibold text-gray-950">
                        {formatCitationLabel(citation)}
                      </p>
                      <p className="mt-3 text-sm leading-7 text-gray-600">
                        {citation.excerpt}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
