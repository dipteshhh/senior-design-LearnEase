"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
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
    <div className="p-8">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Documents</h1>
          <p className="mt-2 text-sm text-gray-500">
            {docs.length} documents — {readyCount} ready, {processingCount} processing
            {q ? <span className="ml-2 text-gray-400">• filtered by &ldquo;{q}&rdquo;</span> : null}
          </p>
        </div>
        <Link
          href="/upload"
          className="inline-flex items-center justify-center rounded-xl bg-black px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
        >
          Upload Document
        </Link>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 animate-pulse">
          {Array.from({ length: 4 }).map((_, i) => (
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
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
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
    <Suspense fallback={<p className="p-8 text-sm text-gray-600">Loading documents...</p>}>
      <DocumentsPageContent />
    </Suspense>
  );
}
