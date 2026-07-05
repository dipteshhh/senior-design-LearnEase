"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle2, Clock3, LibraryBig } from "lucide-react";
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
  const totalCount = docs.length;

  return (
    <div className="space-y-7">
      <div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#688078]">
            Dashboard
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#10201d] sm:text-3xl">
            Welcome back
          </h1>
          <p className="mt-2 text-sm text-[#61716d]">
            {readyCount} ready, {processingCount} processing
            {q ? <span className="ml-2 text-[#7d8b85]">filtered by &ldquo;{q}&rdquo;</span> : null}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-[#cfe2d7] bg-[#fbfffc] p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#688078]">Library</p>
            <LibraryBig className="h-4 w-4 text-[#14765f]" aria-hidden="true" />
          </div>
          <p className="mt-3 text-2xl font-semibold text-[#10201d]">{totalCount}</p>
          <p className="mt-1 text-sm text-[#61716d]">documents</p>
        </div>
        <div className="rounded-lg border border-[#cfe2d7] bg-[#f5fff9] p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#688078]">Ready</p>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          </div>
          <p className="mt-3 text-2xl font-semibold text-[#10201d]">{readyCount}</p>
          <p className="mt-1 text-sm text-[#61716d]">study guides</p>
        </div>
        <div className="rounded-lg border border-[#ead6b6] bg-[#fffaf0] p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8a6b39]">Processing</p>
            <Clock3 className="h-4 w-4 text-amber-600" aria-hidden="true" />
          </div>
          <p className="mt-3 text-2xl font-semibold text-[#10201d]">{processingCount}</p>
          <p className="mt-1 text-sm text-[#61716d]">in progress</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-[#cfe2d7] bg-[#fbfcf8] shadow-[0_16px_42px_rgba(16,32,29,0.07)]">
        <div className="grid gap-6 p-6 sm:p-7 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-center">
          <div>
            <div className="inline-flex rounded-full bg-[#d5f36b] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#123c38]">
              Study flow
            </div>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-[#10201d]">
              Turn documents into a focused study plan.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[#61716d]">
              Upload a PDF or DOCX and generate structured study briefs, key actions,
              checklists, and lecture quizzes.
            </p>
          </div>
          <div className="rounded-lg border border-[#dbe5de] bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#688078]">
              Next action
            </p>
            <Link
              href="/upload"
              className="mt-4 inline-flex w-full items-center justify-between rounded-lg bg-[#123c38] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#0d2d2a]"
            >
              Upload a file
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-base font-semibold text-[#10201d]">Recent uploads</h3>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <p className="text-sm text-[#61716d]">{docs.length} documents</p>
            {docs.length > DASHBOARD_RECENT_LIMIT ? (
              <Link
                href="/documents"
                className="inline-flex items-center gap-1 text-sm font-semibold text-[#14765f] transition hover:text-[#123c38]"
              >
                View all
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 animate-pulse sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-[#dbe5de] bg-white/80 p-5 shadow-sm space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    <div className="h-4 w-3/4 rounded bg-[#dbe5de]" />
                    <div className="h-3 w-1/2 rounded bg-[#edf3ee]" />
                  </div>
                  <div className="h-6 w-24 rounded-full bg-[#edf3ee]" />
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
          <div className="rounded-lg border border-dashed border-[#cfe2d7] bg-white/75 p-10 text-center shadow-sm">
            <p className="text-sm font-semibold text-[#10201d]">
              {q ? "No matching documents" : "No documents yet"}
            </p>
            <p className="mt-2 text-sm text-[#61716d]">
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
    <Suspense fallback={<p className="py-4 text-sm text-[#61716d]">Loading dashboard...</p>}>
      <DashboardPageContent />
    </Suspense>
  );
}
