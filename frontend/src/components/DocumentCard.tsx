"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import type { DocumentListItem } from "@/lib/contracts";
import { deleteDocument } from "@/lib/data/documents";
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

export function formatUploadedLabel(value: string): string {
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

export function documentHref(doc: DocumentListItem): string {
  if (doc.study_guide_status === "ready" && doc.has_study_guide) {
    return `/documents/${doc.id}`;
  }
  return `/documents/${doc.id}/processing`;
}

function ConfirmDeleteDialog({
  filename,
  onCancel,
  onConfirm,
  isDeleting,
}: {
  filename: string;
  onCancel: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === backdropRef.current) onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Confirm document deletion"
    >
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-gray-900">Delete document</h2>
        <p className="mt-2 text-sm text-gray-600">
          Are you sure you want to delete <span className="font-medium text-gray-900">{filename}</span>? This will also remove any generated study guides, quizzes, and related data. This action cannot be undone.
        </p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-900 transition hover:bg-gray-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function DocumentCard({
  doc,
  onDeleted,
}: {
  doc: DocumentListItem;
  onDeleted?: () => void;
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const isStudyGuideProcessing = doc.study_guide_status === "processing";
  const isQuizProcessing = doc.quiz_status === "processing";
  const hasFlowFailure =
    doc.study_guide_status === "failed" || doc.quiz_status === "failed";

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteDocument(doc.id);
      setShowConfirm(false);
      onDeleted?.();
    } catch (err) {
      setDeleteError(getErrorMessage(err, "Unable to delete document right now."));
      setIsDeleting(false);
    }
  }, [doc.id, onDeleted]);

  return (
    <>
      <div className="group relative rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md focus-within:ring-2 focus-within:ring-black/20">
        <Link
          href={documentHref(doc)}
          className="absolute inset-0 rounded-2xl focus:outline-none focus:ring-2 focus:ring-black/20"
          aria-label={`Open ${doc.filename}`}
        />

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900">{doc.filename}</p>
            <p className="mt-2 text-xs text-gray-500">
              {doc.page_count} pages <span className="px-1">•</span> {formatUploadedLabel(doc.uploaded_at)}
            </p>
          </div>
          <div className="flex shrink-0 items-start gap-2">
            <div className="flex flex-col items-end gap-2">
              <FlowStatusBadge flow="Study guide" status={doc.study_guide_status} />
              {doc.document_type === "LECTURE" ? (
                <FlowStatusBadge flow="Quiz" status={doc.quiz_status} />
              ) : null}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowConfirm(true);
              }}
              className="relative z-10 rounded-lg p-1.5 text-gray-400 opacity-100 transition hover:bg-rose-50 hover:text-rose-600 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-rose-300"
              aria-label={`Delete ${doc.filename}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
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
        {deleteError ? (
          <p className="mt-2 text-xs text-rose-700">{deleteError}</p>
        ) : null}
      </div>

      {showConfirm ? (
        <ConfirmDeleteDialog
          filename={doc.filename}
          onCancel={() => {
            setShowConfirm(false);
            setDeleteError(null);
          }}
          onConfirm={() => {
            void handleDelete();
          }}
          isDeleting={isDeleting}
        />
      ) : null}
    </>
  );
}
