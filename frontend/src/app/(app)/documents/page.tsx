"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Clock3, FileUp, FolderOpen } from "lucide-react";
import type { DocumentListItem } from "@/lib/contracts";
import { listDocuments } from "@/lib/data/documents";
import { getErrorMessage } from "@/lib/errorUx";
import { DocumentCard } from "@/components/DocumentCard";

function DocumentsPageContent() {
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

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="rounded-lg border border-[#cfe2d7] bg-[#fbfcf8] p-5 shadow-[0_14px_36px_rgba(16,32,29,0.06)] sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#688078]">
              Library
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#10201d] sm:text-3xl">
              Documents
            </h1>
            <p className="mt-2 text-sm text-[#61716d]">
              {docs.length} documents
              {q ? <span className="ml-2 text-[#7d8b85]">filtered by &ldquo;{q}&rdquo;</span> : null}
            </p>
          </div>
          <Link
            href="/upload"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#123c38] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0d2d2a] sm:w-auto"
          >
            <FileUp className="h-4 w-4" aria-hidden="true" />
            Upload Document
          </Link>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-[#dbe5de] bg-white px-4 py-3">
            <div className="flex items-center gap-2 text-[#14765f]">
              <FolderOpen className="h-4 w-4" aria-hidden="true" />
              <p className="text-sm font-semibold">{docs.length}</p>
            </div>
            <p className="mt-1 text-xs font-medium text-[#61716d]">Total documents</p>
          </div>
          <div className="rounded-lg border border-[#cfe2d7] bg-[#f5fff9] px-4 py-3">
            <div className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              <p className="text-sm font-semibold">{readyCount}</p>
            </div>
            <p className="mt-1 text-xs font-medium text-[#61716d]">Ready to study</p>
          </div>
          <div className="rounded-lg border border-[#ead6b6] bg-[#fffaf0] px-4 py-3">
            <div className="flex items-center gap-2 text-amber-700">
              <Clock3 className="h-4 w-4" aria-hidden="true" />
              <p className="text-sm font-semibold">{processingCount}</p>
            </div>
            <p className="mt-1 text-xs font-medium text-[#61716d]">Processing now</p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 animate-pulse sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
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

      {!isLoading && !error && docs.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {docs.map((doc) => (
            <DocumentCard key={doc.id} doc={doc} onDeleted={refetch} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function DocumentsPage() {
  return (
    <Suspense fallback={<p className="py-4 text-sm text-[#61716d]">Loading documents...</p>}>
      <DocumentsPageContent />
    </Suspense>
  );
}
