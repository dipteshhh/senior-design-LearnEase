"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiClientError, api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorUx";
import {
  getDuplicateReuseMessage,
  getUploadRedirectPath,
  shouldTriggerStudyGuideCreate,
} from "@/lib/uploadResponse";
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
  status?: "uploaded" | "processing" | "ready" | "failed";
  reused_existing?: boolean;
  message?: string;
}

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
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
    setInfo(null);
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

      const duplicateReuseMessage = getDuplicateReuseMessage(payload);
      if (duplicateReuseMessage) {
        setInfo(duplicateReuseMessage);
      }

      if (shouldTriggerStudyGuideCreate(payload)) {
        try {
          await api("/api/study-guide/create", {
            method: "POST",
            body: JSON.stringify({ document_id: documentId }),
          });
        } catch (startError) {
          // Keep the one-click flow moving even if the handoff request fails.
          // The processing page has an idle-state auto-start safety net.
          if (
            !(startError instanceof ApiClientError) ||
            (startError.code !== "ALREADY_PROCESSING" &&
              startError.code !== "ILLEGAL_RETRY_STATE")
          ) {
            console.warn("Study guide start handoff failed; processing page will retry.", startError);
          }
        }
      }

      if (duplicateReuseMessage) {
        await new Promise((resolve) => setTimeout(resolve, 900));
      }

      router.push(getUploadRedirectPath(documentId, payload));
    } catch (uploadError) {
      setError(getErrorMessage(uploadError, "Unable to upload right now. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  }

  const canContinue = Boolean(file) && !isSubmitting;

  return (
    <div className="mx-auto w-full max-w-6xl py-2 sm:py-4">
      <div className="mx-auto max-w-5xl">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#688078]">
            Upload
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#10201d] sm:text-4xl">
            Upload a document
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-[#61716d] sm:text-base">
            Upload a PDF or DOCX file to create a structured study guide.
          </p>
        </div>

        <div
          className={[
            "mt-8 rounded-lg border border-dashed px-6 py-10 transition sm:mt-10 sm:px-8 sm:py-12",
            dragActive
              ? "border-[#55c6a3] bg-[#effbf5] shadow-[0_18px_44px_rgba(20,118,95,0.12)]"
              : "border-[#cfe2d7] bg-[#fbfcf8] shadow-[0_16px_40px_rgba(16,32,29,0.06)]",
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
            <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-[#d5f36b] text-[#123c38] ring-1 ring-[#bedc59]">
              <Upload className="h-8 w-8" />
            </div>

            <h2 className="mt-6 text-2xl font-semibold tracking-tight text-[#10201d]">
              Drag and drop your file
            </h2>
            <p className="mt-2 text-sm text-[#61716d] sm:text-base">
              or browse from your computer
            </p>

            <div className="mt-6">
              <button
                type="button"
                onClick={onBrowseClick}
                className="inline-flex items-center gap-2 rounded-lg bg-[#123c38] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#0d2d2a]"
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
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

            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 text-xs text-[#61716d] sm:text-sm">
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

            <p className="mt-4 text-xs leading-6 text-[#61716d] sm:text-sm">
              Files are encrypted and auto-deleted after 30 days.
            </p>

            {fileLabel ? (
              <div className="mt-6 w-full rounded-lg border border-[#cfe2d7] bg-white px-4 py-4 text-left shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#e2f7ef] text-[#14765f] ring-1 ring-[#c7e9dc]">
                    <FileText className="h-5 w-5" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[#10201d]">Selected file</p>
                    <p className="mt-1 break-words text-sm text-[#61716d]">{fileLabel}</p>
                    <p className="mt-2 text-sm font-medium text-emerald-700">
                      Ready to create study guide
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            {error ? (
              <div className="mt-4 w-full rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-left text-sm text-red-700">
                {error}
              </div>
            ) : null}

            {info ? (
              <div className="mt-4 w-full rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-left text-sm text-emerald-800">
                {info}
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
              "rounded-lg px-6 py-3 text-sm font-semibold transition",
              canContinue
                ? "bg-[#123c38] text-white hover:bg-[#0d2d2a]"
                : "cursor-not-allowed bg-[#dce5df] text-[#88968f]",
            ].join(" ")}
          >
            {isSubmitting ? "Creating..." : "Create Study Guide"}
          </button>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:mt-9 xl:grid-cols-3">
          <article className="rounded-lg border border-[#cfe2d7] bg-[#fbfffc] p-6 shadow-[0_12px_30px_rgba(16,32,29,0.05)]">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#e2f7ef] text-[#14765f] ring-1 ring-[#c7e9dc]">
              <Lightbulb className="h-6 w-6" />
            </div>
            <h3 className="mt-5 text-xl font-semibold text-[#10201d]">Key concepts</h3>
            <p className="mt-3 text-sm leading-7 text-[#61716d]">
              Understand the main ideas in your document faster.
            </p>
          </article>

          <article className="rounded-lg border border-[#ead6b6] bg-[#fffaf0] p-6 shadow-[0_12px_30px_rgba(16,32,29,0.05)]">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#fff2dc] text-[#9a5b0f] ring-1 ring-[#ead6b6]">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h3 className="mt-5 text-xl font-semibold text-[#10201d]">Action items</h3>
            <p className="mt-3 text-sm leading-7 text-[#61716d]">
              Find tasks, deadlines, and important requirements.
            </p>
          </article>

          <article className="rounded-lg border border-[#d5dfe9] bg-[#fbfcff] p-6 shadow-[0_12px_30px_rgba(16,32,29,0.05)] sm:col-span-2 xl:col-span-1">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#e9f0fb] text-[#335d9a] ring-1 ring-[#d5dfe9]">
              <Focus className="h-6 w-6" />
            </div>
            <h3 className="mt-5 text-xl font-semibold text-[#10201d]">Focus mode</h3>
            <p className="mt-3 text-sm leading-7 text-[#61716d]">
              Study one section at a time with less distraction.
            </p>
          </article>
        </div>
      </div>
    </div>
  );
}
