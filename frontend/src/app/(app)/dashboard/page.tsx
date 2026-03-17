"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { DocumentListItem } from "@/lib/contracts";
import { listDocuments } from "@/lib/data/documents";
import { getErrorMessage } from "@/lib/errorUx";
import { DocumentCard } from "@/components/DocumentCard";

const DASHBOARD_RECENT_LIMIT = 4;

function DashboardPageContent() {
  const searchParams = useSearchParams();
  const q = (searchParams.get("q") ?? "").trim();
  const [docs, setDocs] = useState<DocumentListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => {
    setFetchKey((k) => k + 1);
  }, []);

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
  }, [q, fetchKey]);

  const readyCount = useMemo(
    () => docs.filter((doc) => doc.study_guide_status === "ready").length,
    [docs]
  );
  const processingCount = useMemo(
    () => docs.filter((doc) => doc.study_guide_status === "processing").length,
    [docs]
  );

  const recentDocs = useMemo(
    () => docs.slice(0, DASHBOARD_RECENT_LIMIT),
    [docs]
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">Welcome back</h1>
        <p className="mt-2 text-sm text-gray-500">
          {readyCount} ready, {processingCount} processing
          {q ? <span className="ml-2 text-gray-400">• filtered by “{q}”</span> : null}
        </p>
      </div>

      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-gray-950 to-gray-800 p-6 text-white shadow-sm sm:p-8">
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Transform your next assignment</h2>
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

      <div>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-base font-semibold text-gray-900">Recent uploads</h3>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <p className="text-sm text-gray-500">{docs.length} documents</p>
            {docs.length > DASHBOARD_RECENT_LIMIT ? (
              <Link
                href="/documents"
                className="text-sm font-medium text-gray-700 hover:text-gray-900 transition"
              >
                View all →
              </Link>
            ) : null}
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 animate-pulse sm:grid-cols-2 xl:grid-cols-3">
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

        {!isLoading && !error && recentDocs.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {recentDocs.map((doc) => (
              <DocumentCard key={doc.id} doc={doc} onDeleted={refetch} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<p className="py-4 text-sm text-gray-600">Loading dashboard...</p>}>
      <DashboardPageContent />
    </Suspense>
  );
}
