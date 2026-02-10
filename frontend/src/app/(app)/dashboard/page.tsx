import Link from "next/link";
import type { DocumentListItem } from "@/lib/contracts";
import { listDocuments } from "@/lib/data/documents";

function StatusBadge({ status }: { status: DocumentListItem["status"] }) {
  if (status === "READY") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        Ready
      </span>
    );
  }

  if (status === "PROCESSING") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        Processing
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700">
      <span className="h-2 w-2 rounded-full bg-rose-500" />
      Failed
    </span>
  );
}


function FileIcon() {
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-6 w-6 text-gray-500"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-6Z" />
        <path d="M14 2v6h6" />
        <path d="M9 13h6" />
        <path d="M9 17h6" />
      </svg>
    </div>
  );
}

function DocumentCard({ doc }: { doc: DocumentListItem }) {

  const isProcessing = doc.status === "PROCESSING";
  const showProgress = isProcessing && typeof doc.progress === "number";

  const href =
    doc.status === "READY" ? `/documents/${doc.id}` : "/dashboard";

  return (
    <Link
      href={href}
      className="group block rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-black/20"
      aria-label={`Open ${doc.title}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <FileIcon />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900">
              {doc.title}
            </p>
            <p className="mt-2 text-xs text-gray-500">
              {typeof doc.pages === "number" ? `${doc.pages} pages` : "—"}{" "}
              <span className="px-1">•</span> {doc.createdAtLabel}
            </p>
          </div>
        </div>

        <div className="shrink-0">
          <StatusBadge status={doc.status} />
        </div>
      </div>

      {showProgress && (
        <div className="mt-5">
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-gray-900 transition-[width]"
              style={{ width: `${Math.max(0, Math.min(100, doc.progress!))}%` }}
              aria-hidden="true"
            />
          </div>
          <p className="mt-2 text-xs text-gray-500">{doc.progress}% complete</p>
        </div>
      )}

      {!showProgress && isProcessing && (
        <div className="mt-5">
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
            <div className="h-full w-1/3 rounded-full bg-gray-900" />
          </div>
          <p className="mt-2 text-xs text-gray-500">Working on it…</p>
        </div>
      )}
    </Link>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const q = sp.q ?? "";
  const docs = await listDocuments(q);

  const readyCount = docs.filter((d) => d.status === "READY").length;
  const processingCount = docs.filter((d) => d.status === "PROCESSING").length;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
          Welcome back
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          {readyCount} ready, {processingCount} processing
          {q ? (
            <span className="ml-2 text-gray-400">
              • filtered by “{searchParams?.q}”
            </span>
          ) : null}
        </p>
      </div>

      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-gray-950 to-gray-800 p-8 text-white shadow-sm">
        <div className="flex items-start justify-between gap-10">
          <div className="max-w-xl">
            <h2 className="text-2xl font-semibold tracking-tight">
              Transform your next assignment
            </h2>
            <p className="mt-3 text-sm text-white/80">
              Upload a PDF or PowerPoint and we&apos;ll create a structured study
              guide with summary, key takeaways, checklist, and optional quizzes.
            </p>

            <div className="mt-6">
              <Link
                href="/upload"
                className="inline-flex items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-gray-900 shadow-sm transition hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-white/30"
              >
                <span className="mr-2" aria-hidden="true">
                  ⬆️
                </span>
                Upload Document
              </Link>
            </div>
          </div>

          <div className="hidden sm:flex">
            <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/10">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-10 w-10 text-white/70"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              >
                <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-6Z" />
                <path d="M14 2v6h6" />
                <path d="M8 13h8" />
                <path d="M8 17h8" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Recent uploads */}
      <div className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">Recent uploads</h3>
          <p className="text-sm text-gray-500">{docs.length} documents</p>
        </div>

        {docs.length === 0 ? (
          <div className="rounded-2xl border bg-white p-10 text-center shadow-sm">
            <p className="text-sm font-medium text-gray-900">
              {q ? "No matching documents" : "No documents yet"}
            </p>
            <p className="mt-2 text-sm text-gray-500">
              {q
                ? "Try a different search term."
                : "Upload your first assignment to generate a clean, structured study guide."}
            </p>

            <div className="mt-6 flex items-center justify-center gap-3">
              <Link
                href="/upload"
                className="inline-flex items-center justify-center rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-black/90 focus:outline-none focus:ring-2 focus:ring-black/30"
              >
                Upload Document
              </Link>

              {q ? (
                <Link
                  href="/dashboard"
                  className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-900 shadow-sm transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-black/20"
                >
                  Clear search
                </Link>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {docs.slice(0, 3).map((doc) => (
              <DocumentCard key={doc.id} doc={doc} />
            ))}

            {docs[3] && (
              <div className="md:col-span-2">
                <DocumentCard doc={docs[3]} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
