"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { DocumentListItem } from "@/lib/contracts";
import { listDocuments } from "@/lib/data/documents";
import { getErrorMessage } from "@/lib/errorUx";

function generationStatusLabel(
  status: DocumentListItem["study_guide_status"]
): "Ready" | "Processing" | "Failed" | "Idle" {
  if (status === "ready") return "Ready";
  if (status === "processing") return "Processing";
  if (status === "failed") return "Failed";
  return "Idle";
}

function FlowStatusBadge({
  flow,
  status,
}: {
  flow: "Study guide" | "Quiz";
  status: DocumentListItem["study_guide_status"];
}) {
  const label = generationStatusLabel(status);

  if (label === "Ready") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        {flow}: {label}
      </span>
    );
  }

  if (label === "Processing" || label === "Idle") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        {flow}: {label}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700">
      <span className="h-2 w-2 rounded-full bg-rose-500" />
      {flow}: {label}
    </span>
  );
}

function formatUploadedLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown upload time";

  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function documentHref(doc: DocumentListItem): string {
  if (doc.study_guide_status === "ready" && doc.has_study_guide) {
    return `/documents/${doc.id}`;
  }
  return `/documents/${doc.id}/processing`;
}

function DocumentCard({ doc }: { doc: DocumentListItem }) {
  const isStudyGuideProcessing = doc.study_guide_status === "processing";
  const isQuizProcessing = doc.quiz_status === "processing";
  const hasFlowFailure =
    doc.study_guide_status === "failed" || doc.quiz_status === "failed";

  return (
    <Link
      href={documentHref(doc)}
      className="group block rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-black/20"
      aria-label={`Open ${doc.filename}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">{doc.filename}</p>
          <p className="mt-2 text-xs text-gray-500">
            {doc.page_count} pages <span className="px-1">•</span> {formatUploadedLabel(doc.uploaded_at)}
          </p>
        </div>
        <div className="shrink-0">
          <div className="flex flex-col items-end gap-2">
            <FlowStatusBadge flow="Study guide" status={doc.study_guide_status} />
            {doc.document_type === "LECTURE" ? (
              <FlowStatusBadge flow="Quiz" status={doc.quiz_status} />
            ) : null}
          </div>
        </div>
      </div>

      {isStudyGuideProcessing ? (
        <p className="mt-4 text-xs text-gray-500">Study guide generation in progress...</p>
      ) : null}
      {doc.document_type === "LECTURE" && isQuizProcessing ? (
        <p className="mt-4 text-xs text-gray-500">Quiz generation in progress...</p>
      ) : null}
      {hasFlowFailure && doc.error_message ? (
        <p className="mt-4 text-xs text-rose-700">{doc.error_message}</p>
      ) : null}
    </Link>
  );
}

function DashboardPageContent() {
  const searchParams = useSearchParams();
  const q = (searchParams.get("q") ?? "").trim();
  const [docs, setDocs] = useState<DocumentListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await listDocuments(q);
        if (!cancelled) {
          setDocs(response);
        }
      } catch (err) {
        if (!cancelled) {
          setError(getErrorMessage(err, "Unable to load documents."));
          setDocs([]);
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
  }, [q]);

  const readyCount = useMemo(
    () => docs.filter((doc) => doc.study_guide_status === "ready").length,
    [docs]
  );
  const processingCount = useMemo(
    () => docs.filter((doc) => doc.study_guide_status === "processing").length,
    [docs]
  );

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Welcome back</h1>
        <p className="mt-2 text-sm text-gray-500">
          {readyCount} ready, {processingCount} processing
          {q ? <span className="ml-2 text-gray-400">• filtered by “{q}”</span> : null}
        </p>
      </div>

      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-gray-950 to-gray-800 p-8 text-white shadow-sm">
        <h2 className="text-2xl font-semibold tracking-tight">Transform your next assignment</h2>
        <p className="mt-3 max-w-xl text-sm text-white/80">
          Upload a PDF or DOCX and generate structured study guides with key actions, checklist,
          sections, and lecture quizzes.
        </p>
        <div className="mt-6">
          <Link
            href="/upload"
            className="inline-flex items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-gray-900 shadow-sm transition hover:bg-white/90"
          >
            Upload Document
          </Link>
        </div>
      </div>

      <div className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">Recent uploads</h3>
          <p className="text-sm text-gray-500">{docs.length} documents</p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3 animate-pulse">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-2xl border bg-white p-5 shadow-sm space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    <div className="h-4 w-3/4 rounded bg-gray-200" />
                    <div className="h-3 w-1/2 rounded bg-gray-100" />
                  </div>
                  <div className="h-6 w-24 rounded-full bg-gray-100" />
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {!isLoading && !error && docs.length === 0 ? (
          <div className="rounded-2xl border bg-white p-10 text-center shadow-sm">
            <p className="text-sm font-medium text-gray-900">
              {q ? "No matching documents" : "No documents yet"}
            </p>
            <p className="mt-2 text-sm text-gray-500">
              {q ? "Try a different search term." : "Upload your first document to get started."}
            </p>
          </div>
        ) : null}

        {!isLoading && !error && docs.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {docs.slice(0, 3).map((doc) => (
              <DocumentCard key={doc.id} doc={doc} />
            ))}

            {docs[3] ? (
              <div className="md:col-span-2">
                <DocumentCard doc={docs[3]} />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-gray-600">Loading dashboard...</p>}>
      <DashboardPageContent />
    </Suspense>
  );
}
