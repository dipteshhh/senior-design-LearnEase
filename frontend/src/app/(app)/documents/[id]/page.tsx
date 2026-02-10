import Link from "next/link";
import { getDocument } from "@/lib/data/documents";

function StatusPill({ status }: { status: string }) {
  const base =
    "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold";
  if (status === "READY")
    return (
      <span className={`${base} bg-emerald-50 text-emerald-700`}>
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        Ready
      </span>
    );
  if (status === "PROCESSING")
    return (
      <span className={`${base} bg-amber-50 text-amber-700`}>
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        Processing
      </span>
    );
  return (
    <span className={`${base} bg-rose-50 text-rose-700`}>
      <span className="h-2 w-2 rounded-full bg-rose-500" />
      Failed
    </span>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      <div className="mt-3 text-sm text-gray-700">{children}</div>
    </section>
  );
}

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const doc = await getDocument(id);

  if (!doc) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Document not found</h1>
        <p className="text-sm text-gray-600">Tried id: {id}</p>
        <Link href="/dashboard" className="inline-flex underline">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const canQuiz = doc.status === "READY";

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Top breadcrumb */}
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard"
          className="text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          ← Back to Dashboard
        </Link>

        <div className="flex items-center gap-3">
          <StatusPill status={doc.status} />
          {typeof doc.pages === "number" ? (
            <span className="text-xs text-gray-500">{doc.pages} pages</span>
          ) : null}
        </div>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h1 className="truncate text-3xl font-semibold tracking-tight text-gray-900">
            {doc.title}
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Your study guide is generated from this document.
          </p>
        </div>

        {canQuiz ? (
          <Link
            href={`/documents/${doc.id}/quiz`}
            className="inline-flex items-center justify-center rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-black/90 focus:outline-none focus:ring-2 focus:ring-black/20"
          >
            Start Quiz
          </Link>
        ) : (
          <span className="inline-flex items-center justify-center rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-600">
            Quiz available when ready
          </span>
        )}
      </div>

      {/* Study Guide */}
      <div className="rounded-3xl border bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Study Guide</h2>
          <span className="text-xs text-gray-500">v1 (mock)</span>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-5">
          <SectionCard title="Summary">
            <p className="leading-6">{doc.studyGuide.summary}</p>
          </SectionCard>

          <SectionCard title="Key Takeaways">
            <ul className="list-disc space-y-2 pl-5">
              {doc.studyGuide.keyTakeaways.map((k) => (
                <li key={k} className="leading-6">
                  {k}
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard title="Checklist">
            <ul className="list-disc space-y-2 pl-5">
              {doc.studyGuide.checklist.map((c) => (
                <li key={c} className="leading-6">
                  {c}
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
