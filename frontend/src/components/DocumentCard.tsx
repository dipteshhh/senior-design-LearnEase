"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { BookOpen, ClipboardList, FileText, Trash2 } from "lucide-react";
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
      <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        {flow}: {label}
      </span>
    );
  }

  if (label === "Processing" || label === "Idle") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        {flow}: {label}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-800">
      <span className="h-2 w-2 rounded-full bg-rose-500" />
      {flow}: {label}
    </span>
  );
}

function getDocumentTypeMeta(type: DocumentListItem["document_type"]) {
  if (type === "LECTURE") {
    return {
      label: "Lecture",
      Icon: BookOpen,
      accent: "bg-[#55c6a3]",
      icon: "bg-[#e2f7ef] text-[#14765f]",
      badge: "bg-[#e2f7ef] text-[#14765f]",
      card: "border-[#c7e9dc] bg-[#fbfffc]",
    };
  }

  if (type === "HOMEWORK") {
    return {
      label: "Homework",
      Icon: ClipboardList,
      accent: "bg-[#f0b35d]",
      icon: "bg-[#fff2dc] text-[#9a5b0f]",
      badge: "bg-[#fff2dc] text-[#9a5b0f]",
      card: "border-[#ead6b6] bg-[#fffdfa]",
    };
  }

  return {
    label: "Document",
    Icon: FileText,
    accent: "bg-[#82a7dd]",
    icon: "bg-[#e9f0fb] text-[#335d9a]",
    badge: "bg-[#e9f0fb] text-[#335d9a]",
    card: "border-[#d5dfe9] bg-[#fbfcff]",
  };
}

function getDocumentStateMeta(doc: DocumentListItem) {
  if (doc.study_guide_status === "ready" && doc.has_study_guide) {
    return {
      accent: "bg-[#55c6a3]",
      card: "border-[#c7e9dc] bg-[#fbfffc]",
      icon: "bg-[#e2f7ef] text-[#14765f]",
      badge: "bg-[#e2f7ef] text-[#14765f]",
    };
  }

  if (doc.study_guide_status === "failed" || doc.quiz_status === "failed") {
    return {
      accent: "bg-rose-400",
      card: "border-rose-200 bg-white",
      icon: "bg-rose-50 text-rose-700",
      badge: "bg-rose-50 text-rose-700",
    };
  }

  if (doc.study_guide_status === "processing" || doc.quiz_status === "processing") {
    return {
      accent: "bg-[#f0b35d]",
      card: "border-[#ead6b6] bg-[#fffdfa]",
      icon: "bg-[#fff2dc] text-[#9a5b0f]",
      badge: "bg-[#fff2dc] text-[#9a5b0f]",
    };
  }

  return {
    accent: "bg-[#d4ded8]",
    card: "border-[#d5dfe9] bg-[#fbfcff]",
    icon: "bg-[#e9f0fb] text-[#335d9a]",
    badge: "bg-[#e9f0fb] text-[#335d9a]",
  };
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
      <div className="w-full max-w-md rounded-lg border border-[#d9e3dc] bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-[#10201d]">Delete document</h2>
        <p className="mt-2 text-sm leading-6 text-[#61716d]">
          Are you sure you want to delete <span className="font-medium text-[#10201d]">{filename}</span>? This will also remove any generated study guides, quizzes, and related data. This action cannot be undone.
        </p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="rounded-lg border border-[#d5ded8] px-4 py-2 text-sm font-semibold text-[#10201d] transition hover:bg-[#f7faf6] disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
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
  const typeMeta = getDocumentTypeMeta(doc.document_type);
  const stateMeta = getDocumentStateMeta(doc);
  const TypeIcon = typeMeta.Icon;

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
      <div
        className={`group relative overflow-hidden rounded-lg border p-5 shadow-[0_12px_32px_rgba(16,32,29,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_42px_rgba(16,32,29,0.1)] focus-within:ring-2 focus-within:ring-[#55c6a3]/35 ${stateMeta.card}`}
      >
        <div className={`absolute inset-x-0 top-0 h-1 ${stateMeta.accent}`} />
        <Link
          href={documentHref(doc)}
          className="absolute inset-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#55c6a3]/45"
          aria-label={`Open ${doc.filename}`}
        />

        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${stateMeta.icon}`}>
              <TypeIcon className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] ${stateMeta.badge}`}>
                  {typeMeta.label}
                </span>
                <span className="text-xs font-medium text-[#7a8a82]">
                  {formatUploadedLabel(doc.uploaded_at)}
                </span>
              </div>
              <p className="mt-3 truncate text-base font-semibold text-[#10201d]">{doc.filename}</p>
              <p className="mt-1 text-xs font-medium text-[#61716d]">
                {doc.page_count} pages
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-start">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowConfirm(true);
              }}
              className="relative z-10 rounded-lg p-1.5 text-[#7a8a82] opacity-100 transition hover:bg-rose-50 hover:text-rose-600 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-rose-300"
              aria-label={`Delete ${doc.filename}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <FlowStatusBadge flow="Study guide" status={doc.study_guide_status} />
          {doc.document_type === "LECTURE" ? (
            <FlowStatusBadge flow="Quiz" status={doc.quiz_status} />
          ) : null}
        </div>

        {isStudyGuideProcessing ? (
          <p className="mt-4 text-xs font-medium text-[#61716d]">Study guide generation in progress...</p>
        ) : null}
        {doc.document_type === "LECTURE" && isQuizProcessing ? (
          <p className="mt-4 text-xs font-medium text-[#61716d]">Quiz generation in progress...</p>
        ) : null}
        {hasFlowFailure && doc.error_message ? (
          <p className="mt-4 text-xs font-medium text-rose-700">{doc.error_message}</p>
        ) : null}
        {deleteError ? (
          <p className="mt-2 text-xs font-medium text-rose-700">{deleteError}</p>
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
