"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { DocumentDetail, DocumentListItem, ExtractionItem } from "@/lib/contracts";
import { deleteDocument, getDocument, updateChecklistItem } from "@/lib/data/documents";
import { getErrorMessage } from "@/lib/errorUx";

function StatusPill({ status }: { status: DocumentListItem["status"] }) {
  const base = "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold";
  if (status === "ready") {
    return (
      <span className={`${base} bg-emerald-50 text-emerald-700`}>
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        Ready
      </span>
    );
  }
  if (status === "processing" || status === "uploaded") {
    return (
      <span className={`${base} bg-amber-50 text-amber-700`}>
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        Processing
      </span>
    );
  }
  return (
    <span className={`${base} bg-rose-50 text-rose-700`}>
      <span className="h-2 w-2 rounded-full bg-rose-500" />
      Failed
    </span>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <section className="rounded-3xl border bg-white p-6 shadow-sm">{children}</section>;
}

function SubCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-white p-5">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      <div className="mt-3 text-sm text-gray-700">{children}</div>
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function ExtractionList({ items }: { items: ExtractionItem[] }) {
  if (items.length === 0) {
    return <p className="text-gray-500">No items generated.</p>;
  }
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id} className="space-y-1">
          <p className="font-medium text-gray-900">{item.label}</p>
          <p className="text-xs text-gray-600">{item.supporting_quote}</p>
        </li>
      ))}
    </ul>
  );
}

export default function DocumentPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const id = params?.id;
  const tab = (searchParams.get("tab") ?? "overview").toLowerCase();
  const isFocusMode = searchParams.get("focus") === "1";
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [checklistCompleted, setChecklistCompleted] = useState<Record<string, boolean>>({});
  const [isDeleting, setIsDeleting] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await getDocument(id);
        if (!cancelled) {
          setDetail(response);
        }
      } catch (err) {
        if (!cancelled) {
          setError(getErrorMessage(err, "Unable to load document."));
          setDetail(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const document = detail?.document ?? null;
  const studyGuide = detail?.studyGuide ?? null;
  const canOpenQuiz = document?.document_type === "LECTURE";

  const importantDetails = useMemo(() => {
    if (!studyGuide) {
      return [
        { title: "Dates", items: [] as ExtractionItem[] },
        { title: "Policies", items: [] as ExtractionItem[] },
        { title: "Contacts", items: [] as ExtractionItem[] },
        { title: "Logistics", items: [] as ExtractionItem[] },
      ];
    }
    return [
      { title: "Dates", items: studyGuide.important_details.dates },
      { title: "Policies", items: studyGuide.important_details.policies },
      { title: "Contacts", items: studyGuide.important_details.contacts },
      { title: "Logistics", items: studyGuide.important_details.logistics },
    ];
  }, [studyGuide]);

  useEffect(() => {
    if (!detail) return;
    setChecklistCompleted(detail.checklistCompletion);
  }, [detail]);

  useEffect(() => {
    if (!studyGuide) return;
    const total = studyGuide.sections.length;
    if (total === 0) {
      setFocusIndex(0);
      return;
    }
    setFocusIndex((prev) => Math.max(0, Math.min(prev, total - 1)));
  }, [studyGuide]);

  if (!id) {
    return <p className="text-sm text-gray-600">Missing document id.</p>;
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-8 animate-pulse">
        <div className="space-y-3">
          <div className="h-9 w-2/3 rounded-xl bg-gray-200" />
          <div className="h-4 w-1/3 rounded-lg bg-gray-100" />
        </div>
        <div className="flex gap-8 border-b pb-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-4 w-20 rounded bg-gray-100" />
          ))}
        </div>
        <div className="rounded-3xl border bg-white p-6 shadow-sm space-y-4">
          <div className="h-5 w-1/2 rounded bg-gray-200" />
          <div className="h-4 w-full rounded bg-gray-100" />
          <div className="h-4 w-5/6 rounded bg-gray-100" />
          <div className="h-4 w-4/6 rounded bg-gray-100" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
        <Link href="/dashboard" className="text-sm underline">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Document not found</h1>
        <Link href="/dashboard" className="text-sm underline">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  if (!studyGuide) {
    return (
      <div className="space-y-5">
        <h1 className="text-3xl font-semibold text-gray-900">{document.filename}</h1>
        <StatusPill status={document.status} />
        <p className="text-sm text-gray-600">
          Study guide is not ready yet. Continue processing or retry from the processing page.
        </p>
        {document.error_message ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {document.error_message}
          </p>
        ) : null}
        <div className="flex gap-3">
          <Link href={`/documents/${document.id}/processing`} className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white">
            Open Processing
          </Link>
          <Link href="/dashboard" className="rounded-xl border px-4 py-2 text-sm font-semibold text-gray-900">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const focusSection = studyGuide.sections[focusIndex] ?? null;

  async function handleChecklistToggle(itemId: string, completed: boolean) {
    if (!document) return;

    const previous = checklistCompleted[itemId] ?? false;
    const nextState = { ...checklistCompleted, [itemId]: completed };
    setChecklistCompleted(nextState);

    try {
      await updateChecklistItem(document.id, itemId, completed);
    } catch (err) {
      setChecklistCompleted((current) => ({ ...current, [itemId]: previous }));
      setError(getErrorMessage(err, "Unable to update checklist item."));
    }
  }

  async function handleDeleteDocument() {
    if (!document || isDeleting) return;
    const confirmed = window.confirm(
      "Delete this document and all generated artifacts? This action cannot be undone."
    );
    if (!confirmed) return;

    setIsDeleting(true);
    setError(null);
    try {
      await deleteDocument(document.id);
      router.replace("/dashboard");
    } catch (err) {
      setError(getErrorMessage(err, "Unable to delete document right now."));
      setIsDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h1 className="truncate text-4xl font-semibold tracking-tight text-gray-900">
            {document.filename}
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Processed on {formatDate(document.uploaded_at)} • {document.page_count} pages
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={`/documents/${document.id}?tab=sections&focus=1`}
            className="inline-flex items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50"
          >
            Focus Mode
          </Link>

          {canOpenQuiz ? (
            <Link
              href={`/documents/${document.id}/quiz`}
              className="inline-flex items-center justify-center rounded-xl bg-black px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-black/90"
            >
              Test Your Knowledge
            </Link>
          ) : (
            <span className="inline-flex items-center justify-center rounded-xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-600">
              Quiz for lecture docs only
            </span>
          )}

          <button
            type="button"
            onClick={() => {
              void handleDeleteDocument();
            }}
            disabled={isDeleting}
            className="inline-flex items-center justify-center rounded-xl border border-rose-300 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>

      <div className="border-b">
        <div className="flex flex-wrap items-center gap-8">
          <Link href={`/documents/${document.id}?tab=overview`} className={tab === "overview" ? "pb-3 text-sm font-semibold text-gray-900" : "pb-3 text-sm text-gray-500"}>
            Overview
          </Link>
          <Link href={`/documents/${document.id}?tab=actions`} className={tab === "actions" ? "pb-3 text-sm font-semibold text-gray-900" : "pb-3 text-sm text-gray-500"}>
            Key Actions
          </Link>
          <Link href={`/documents/${document.id}?tab=checklist`} className={tab === "checklist" ? "pb-3 text-sm font-semibold text-gray-900" : "pb-3 text-sm text-gray-500"}>
            Checklist
          </Link>
          <Link href={`/documents/${document.id}?tab=details`} className={tab === "details" ? "pb-3 text-sm font-semibold text-gray-900" : "pb-3 text-sm text-gray-500"}>
            Important Details
          </Link>
          <Link href={`/documents/${document.id}?tab=sections`} className={tab === "sections" ? "pb-3 text-sm font-semibold text-gray-900" : "pb-3 text-sm text-gray-500"}>
            Sections
          </Link>
        </div>
      </div>

      {tab === "overview" ? (
        <Card>
          <h2 className="text-base font-semibold text-gray-900">{studyGuide.overview.title}</h2>
          <p className="mt-2 text-sm leading-7 text-gray-700">{studyGuide.overview.summary}</p>
          <div className="mt-4">
            <StatusPill status={document.status} />
          </div>
        </Card>
      ) : null}

      {tab === "actions" ? (
        <Card>
          <h2 className="text-base font-semibold text-gray-900">Key Actions</h2>
          <div className="mt-4">
            <ExtractionList items={studyGuide.key_actions} />
          </div>
        </Card>
      ) : null}

      {tab === "checklist" ? (
        <Card>
          <h2 className="text-base font-semibold text-gray-900">Checklist</h2>
          <div className="mt-4">
            {studyGuide.checklist.length === 0 ? (
              <p className="text-gray-500">No checklist items generated.</p>
            ) : (
              <ul className="space-y-3">
                {studyGuide.checklist.map((item) => {
                  const checked = checklistCompleted[item.id] ?? false;
                  return (
                    <li key={item.id} className="rounded-xl border p-3">
                      <label className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            void handleChecklistToggle(item.id, event.target.checked);
                          }}
                          className="mt-1 h-4 w-4 rounded border-gray-300"
                        />
                        <span className="space-y-1">
                          <span className="block font-medium text-gray-900">{item.label}</span>
                          <span className="block text-xs text-gray-600">{item.supporting_quote}</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>
      ) : null}

      {tab === "details" ? (
        <Card>
          <h2 className="text-base font-semibold text-gray-900">Important Details</h2>
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            {importantDetails.map((group) => (
              <SubCard key={group.title} title={group.title}>
                <ExtractionList items={group.items} />
              </SubCard>
            ))}
          </div>
        </Card>
      ) : null}

      {tab === "sections" ? (
        <Card>
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-base font-semibold text-gray-900">
              {isFocusMode ? "Focus Mode" : "Sections"}
            </h2>
            <Link
              href={
                isFocusMode
                  ? `/documents/${document.id}?tab=sections`
                  : `/documents/${document.id}?tab=sections&focus=1`
              }
              className="text-sm font-medium text-gray-600 underline"
            >
              {isFocusMode ? "Exit Focus Mode" : "Enter Focus Mode"}
            </Link>
          </div>

          {studyGuide.sections.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">No sections available.</p>
          ) : isFocusMode ? (
            <div className="mt-6 space-y-4">
              {focusSection ? (
                <SubCard title={focusSection.title}>
                  <p className="text-sm text-gray-700">{focusSection.content}</p>
                  <p className="mt-3 text-xs text-gray-500">
                    Citations: {focusSection.citations.length}
                  </p>
                </SubCard>
              ) : null}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setFocusIndex((prev) => Math.max(0, prev - 1))}
                  disabled={focusIndex <= 0}
                  className="rounded-xl border px-4 py-2 text-sm font-semibold text-gray-900 disabled:opacity-50"
                >
                  Previous Section
                </button>
                <p className="text-xs text-gray-500">
                  Section {focusIndex + 1} of {studyGuide.sections.length}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setFocusIndex((prev) =>
                      Math.min(studyGuide.sections.length - 1, prev + 1)
                    )
                  }
                  disabled={focusIndex >= studyGuide.sections.length - 1}
                  className="rounded-xl border px-4 py-2 text-sm font-semibold text-gray-900 disabled:opacity-50"
                >
                  Next Section
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-4">
              {studyGuide.sections.map((section) => (
                <SubCard key={section.id} title={section.title}>
                  <p className="text-sm text-gray-700">{section.content}</p>
                  <p className="mt-3 text-xs text-gray-500">
                    Citations: {section.citations.length}
                  </p>
                </SubCard>
              ))}
            </div>
          )}
        </Card>
      ) : null}

      <div className="pt-2">
        <Link href="/dashboard" className="text-sm font-medium text-gray-600 hover:text-gray-900">
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
