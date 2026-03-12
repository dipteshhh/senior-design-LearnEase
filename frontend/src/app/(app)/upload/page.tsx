"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorUx";
import {
  CheckCircle2,
  FileText,
  Focus,
  Lightbulb,
  Upload,
} from "lucide-react";

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const SUPPORTED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

interface UploadResponse {
  document_id?: string;
}

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const accept = ".pdf,.docx";

  const fileLabel = useMemo(() => {
    if (!file) return null;
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return `${file.name} • ${sizeMB}MB`;
  }, [file]);

  function validateAndSetFile(f: File) {
    const ext = f.name.split(".").pop()?.toLowerCase();
    const hasValidExt = ext === "pdf" || ext === "docx";
    const hasValidMime = f.type.length === 0 || SUPPORTED_MIME_TYPES.has(f.type);

    if (!hasValidExt || !hasValidMime) {
      setFile(null);
      setError("Only PDF and DOCX files are supported.");
      return;
    }

    if (f.size > MAX_FILE_SIZE_BYTES) {
      setFile(null);
      setError("File is too large. Max size is 50MB.");
      return;
    }

    setError(null);
    setFile(f);
  }

  function onBrowseClick() {
    fileInputRef.current?.click();
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) validateAndSetFile(f);

    // lets user pick the same file again if needed
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);

    const f = e.dataTransfer.files?.[0];
    if (f) validateAndSetFile(f);
  }

  async function onCreateSession() {
    if (!file) {
      setError("Please choose a PDF or DOCX file first.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const body = new FormData();
      body.append("file", file);

      const payload = await api<UploadResponse>("/api/upload", {
        method: "POST",
        body,
      });

      const documentId = payload.document_id;
      if (!documentId) {
        setError("Upload succeeded but no document id was returned.");
        return;
      }

      // Fire study guide generation immediately (best-effort).
      // The processing page will auto-start if this doesn't land.
      api("/api/study-guide/create", {
        method: "POST",
        body: JSON.stringify({ document_id: documentId }),
      }).catch(() => { /* processing page will handle retry */ });

      router.push(`/documents/${documentId}/processing`);
    } catch (uploadError) {
      setError(getErrorMessage(uploadError, "Unable to upload right now. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  }

  const canContinue = Boolean(file) && !isSubmitting;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            Upload a document
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
            Upload a PDF or DOCX file to create a structured study guide.
          </p>
        </div>

        <div
          className={[
            "mt-8 rounded-[28px] border border-dashed bg-white px-6 py-10 transition sm:mt-10 sm:px-8 sm:py-12",
            dragActive
              ? "border-slate-500 bg-slate-50"
              : "border-slate-300 shadow-[0_16px_40px_rgba(15,23,42,0.05)]",
          ].join(" ")}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragActive(false);
          }}
          onDrop={onDrop}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onBrowseClick();
            }
          }}
          role="button"
          tabIndex={0}
        >
          <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-100 text-slate-700 ring-1 ring-slate-200">
              <Upload className="h-8 w-8" />
            </div>

            <h2 className="mt-6 text-2xl font-semibold tracking-tight text-slate-950">
              Drag and drop your file
            </h2>
            <p className="mt-2 text-sm text-slate-600 sm:text-base">
              or browse from your computer
            </p>

            <div className="mt-6">
              <button
                type="button"
                onClick={onBrowseClick}
                className="rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Browse files
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept={accept}
                className="hidden"
                onChange={onFileChange}
              />
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 text-xs text-slate-500 sm:text-sm">
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                PDF files
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                DOCX files
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                Up to 50MB
              </span>
            </div>

            <p className="mt-4 text-xs leading-6 text-slate-500 sm:text-sm">
              Files are encrypted and auto-deleted after 30 days.
            </p>

            {fileLabel ? (
              <div className="mt-6 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-700 ring-1 ring-slate-200">
                    <FileText className="h-5 w-5" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-950">Selected file</p>
                    <p className="mt-1 break-words text-sm text-slate-600">{fileLabel}</p>
                    <p className="mt-2 text-sm font-medium text-emerald-700">
                      Ready to create study guide
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            {error ? (
              <div className="mt-4 w-full rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-left text-sm text-red-700">
                {error}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-8 flex items-center justify-center sm:mt-9">
          <button
            type="button"
            disabled={!canContinue}
            onClick={onCreateSession}
            className={[
              "rounded-full px-6 py-3 text-sm font-semibold transition",
              canContinue
                ? "bg-slate-950 text-white hover:bg-slate-800"
                : "cursor-not-allowed bg-slate-200 text-slate-400",
            ].join(" ")}
          >
            {isSubmitting ? "Creating..." : "Create Study Guide"}
          </button>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:mt-9 xl:grid-cols-3">
          <article className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 ring-1 ring-slate-200">
              <Lightbulb className="h-6 w-6" />
            </div>
            <h3 className="mt-5 text-xl font-semibold text-slate-950">Key concepts</h3>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              Understand the main ideas in your document faster.
            </p>
          </article>

          <article className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 ring-1 ring-slate-200">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h3 className="mt-5 text-xl font-semibold text-slate-950">Action items</h3>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              Find tasks, deadlines, and important requirements.
            </p>
          </article>

          <article className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.04)] sm:col-span-2 xl:col-span-1">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 ring-1 ring-slate-200">
              <Focus className="h-6 w-6" />
            </div>
            <h3 className="mt-5 text-xl font-semibold text-slate-950">Focus mode</h3>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              Study one section at a time with less distraction.
            </p>
          </article>
        </div>
      </div>
    </div>
  );
}