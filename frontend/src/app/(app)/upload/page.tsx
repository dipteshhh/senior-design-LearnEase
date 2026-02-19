"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "key_concepts" | "action_items" | "focus_mode";

const MODES: Array<{
  id: Mode;
  title: string;
  desc: string;
  badge?: string;
}> = [
  {
    id: "key_concepts",
    title: "Key concepts",
    desc: "Extract main ideas and themes from your document.",
  },
  {
    id: "action_items",
    title: "Action items",
    desc: "Identify tasks, deadlines, and requirements.",
  },
  {
    id: "focus_mode",
    title: "Focus mode",
    desc: "Study one section at a time, distraction-free.",
    badge: "Optional",
  },
];

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const SUPPORTED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
  };
}

interface UploadResponse {
  document_id?: string;
}

function getUploadErrorMessage(status: number, payload: ApiErrorPayload): string {
  const code = payload.error?.code;
  const message = payload.error?.message?.trim();

  if (code === "FILE_TOO_LARGE") {
    return "File is too large. Max size is 50MB.";
  }
  if (code === "UNSUPPORTED_MEDIA_TYPE" || status === 415) {
    return "Only PDF and DOCX files are supported.";
  }
  if (status === 401) {
    return "Please sign in before uploading a document.";
  }
  if (code === "EXTRACTION_FAILED") {
    return "We could not process this file. Please try another file.";
  }
  return message && message.length > 0
    ? message
    : "Upload failed. Please try again.";
}

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [selectedMode, setSelectedMode] = useState<Mode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const accept = ".pdf,.docx";

  const fileLabel = useMemo(() => {
    if (!file) return null;
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return `${file.name} • ${sizeMB}MB`;
  }, [file]);

  function validateAndSetFile(f: File) {
    setError(null);

    const ext = f.name.split(".").pop()?.toLowerCase();
    const hasValidExt = ext === "pdf" || ext === "docx";
    const hasValidMime = f.type.length === 0 || SUPPORTED_MIME_TYPES.has(f.type);

    if (!hasValidExt || !hasValidMime) {
      setError("Only PDF and DOCX files are supported.");
      return;
    }
    if (f.size > MAX_FILE_SIZE_BYTES) {
      setError("File is too large. Max size is 50MB.");
      return;
    }

    setFile(f);
  }

  function onBrowseClick() {
    fileInputRef.current?.click();
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) validateAndSetFile(f);
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

      const response = await fetch(`${API_BASE_URL}/api/upload`, {
        method: "POST",
        body,
        credentials: "include",
      });

      const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload & UploadResponse;

      if (!response.ok) {
        setError(getUploadErrorMessage(response.status, payload));
        return;
      }

      const documentId = payload.document_id;
      if (!documentId) {
        setError("Upload succeeded but no document id was returned.");
        return;
      }

      router.push(`/documents/${documentId}/processing`);
    } catch {
      setError("Unable to reach the backend. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const canContinue = Boolean(file && selectedMode) && !isSubmitting;

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Upload document</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Choose a PDF or DOCX file to transform into a personalized study guide.
        </p>
      </div>

      {/* Dropzone */}
      <div
        className={[
          "mt-8 rounded-2xl border border-dashed bg-white p-10 transition",
          dragActive ? "border-black/60" : "border-black/20",
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
        role="button"
        tabIndex={0}
      >
        <div className="mx-auto flex max-w-md flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-black/10">
            <span className="text-xl">⤴</span>
          </div>

          <p className="mt-4 text-base font-medium">Drag and drop your file</p>
          <p className="mt-1 text-sm text-muted-foreground">
            or browse from your computer
          </p>

          <div className="mt-6">
            <button
              type="button"
              onClick={onBrowseClick}
              className="rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
            >
              Browse Files
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={accept}
              className="hidden"
              onChange={onFileChange}
            />
          </div>

          <div className="mt-6 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              PDF files
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              DOCX files
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              Up to 50MB
            </span>
          </div>

          {/* Selected file + errors */}
          {fileLabel && (
            <div className="mt-6 w-full rounded-xl border border-black/10 bg-black/[0.02] px-4 py-3 text-left">
              <div className="text-sm font-medium">Selected file</div>
              <div className="mt-1 text-sm text-muted-foreground">{fileLabel}</div>
            </div>
          )}
          {error && (
            <div className="mt-4 w-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-left text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Privacy line near action */}
          <p className="mt-4 text-xs text-muted-foreground">
            🔒 Files are encrypted and auto-deleted after 30 days.
          </p>
        </div>
      </div>

      {/* Mode cards */}
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {MODES.map((m) => {
          const active = selectedMode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setSelectedMode(m.id)}
              className={[
                "group rounded-2xl border bg-white p-6 text-left transition",
                active ? "border-black/60 shadow-sm" : "border-black/10 hover:border-black/30",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-semibold">{m.title}</div>
                {m.badge && (
                  <span className="rounded-full border border-black/10 bg-black/[0.03] px-2 py-0.5 text-[11px] text-muted-foreground">
                    {m.badge}
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{m.desc}</p>

              <div className="mt-4 flex items-center gap-2 text-xs">
                <span
                  className={[
                    "h-2 w-2 rounded-full",
                    active ? "bg-green-500" : "bg-black/15 group-hover:bg-black/25",
                  ].join(" ")}
                />
                <span className={active ? "text-black" : "text-muted-foreground"}>
                  {active ? "Selected" : "Select"}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* CTA */}
      <div className="mt-10 flex items-center justify-center">
        <button
          type="button"
          disabled={!canContinue}
          onClick={onCreateSession}
          className={[
            "rounded-full px-6 py-3 text-sm font-medium transition",
            canContinue
              ? "bg-black text-white hover:opacity-90"
              : "cursor-not-allowed bg-black/10 text-black/40",
          ].join(" ")}
        >
          {isSubmitting ? "Uploading..." : "Create study session"}
        </button>
      </div>
    </div>
  );
}
