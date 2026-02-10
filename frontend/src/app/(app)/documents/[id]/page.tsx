// src/app/(app)/documents/[id]/page.tsx
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

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-3xl border bg-white p-6 shadow-sm ${className}`}>
      {children}
    </section>
  );
}

function SubCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-white p-5">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      <div className="mt-3 text-sm text-gray-700">{children}</div>
    </div>
  );
}

function TabLink({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={[
        "relative pb-3 text-sm font-medium transition-colors",
        active ? "text-gray-900" : "text-gray-500 hover:text-gray-900",
      ].join(" ")}
    >
      {label}
      {active ? (
        <span className="absolute inset-x-0 -bottom-[1px] h-[2px] rounded-full bg-black" />
      ) : null}
    </Link>
  );
}

function formatProcessedLabel(doc: any) {
  // MVP-safe: you only have createdAtLabel (like "2 hours ago") in list,
  // but detail has createdAt ISO. We'll show a friendly label either way.
  if (doc?.createdAtLabel) return `Processed ${doc.createdAtLabel}`;
  if (doc?.createdAt) {
    try {
      const d = new Date(doc.createdAt);
      return `Processed on ${d.toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      })}`;
    } catch {
      return "Processed";
    }
  }
  return "Processed";
}

function buildSectionsFromDoc(doc: any) {
  // MVP-safe mock sections. Later backend can replace with real headings.
  const takeaways: string[] = doc?.studyGuide?.keyTakeaways ?? [];
  const checklist: string[] = doc?.studyGuide?.checklist ?? [];

  const sections = [
    {
      title: "Overview",
      desc:
        "High-level summary and key context from the document to get you oriented quickly.",
      items: [],
    },
    {
      title: "Key concepts",
      desc: "Core ideas pulled from the document to reduce rereading.",
      items: takeaways.slice(0, 5),
    },
    {
      title: "Action items",
      desc: "Tasks, requirements, or next steps identified from the content.",
      items: checklist.slice(0, 5),
    },
    {
      title: "Checklist",
      desc: "A step-by-step list to help you work through the document calmly.",
      items: checklist.slice(0, 6),
    },
    {
      title: "Important details",
      desc: "Key facts like dates, constraints, scoring, submission details, and page references.",
      items: [],
    },
  ];

  return sections;
}

export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const tab = (sp.tab ?? "overview").toLowerCase();

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
  const processedLine = `${formatProcessedLabel(doc)} • ${
    typeof doc.pages === "number" ? `${doc.pages} pages` : "— pages"
  }`;

  // MVP placeholders — safe with your constraints
  const topic = (doc as any)?.topic ?? "—";
  const dueDate = (doc as any)?.dueDate ?? "—";
  const estTime = (doc as any)?.estimatedTime ?? "—";

  const sections = buildSectionsFromDoc(doc);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* Header row */}
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h1 className="truncate text-4xl font-semibold tracking-tight text-gray-900">
            {doc.title}
          </h1>
          <p className="mt-2 text-sm text-gray-500">{processedLine}</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Secondary */}
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50"
          >
            Focus Mode
          </button>

          {/* Primary */}
          {canQuiz ? (
            <Link
              href={`/documents/${doc.id}/quiz`}
              className="inline-flex items-center justify-center rounded-xl bg-black px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-black/90 focus:outline-none focus:ring-2 focus:ring-black/20"
            >
              Test Your Knowledge
            </Link>
          ) : (
            <span className="inline-flex items-center justify-center rounded-xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-600">
              Quiz when ready
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <div className="flex flex-wrap items-center gap-8">
          <TabLink
            href={`/documents/${doc.id}?tab=overview`}
            active={tab === "overview"}
            label="Overview"
          />
          <TabLink
            href={`/documents/${doc.id}?tab=actions`}
            active={tab === "actions"}
            label="Key Actions"
          />
          <TabLink
            href={`/documents/${doc.id}?tab=checklist`}
            active={tab === "checklist"}
            label="Checklist"
          />
          <TabLink
            href={`/documents/${doc.id}?tab=details`}
            active={tab === "details"}
            label="Important Details"
          />
          <TabLink
            href={`/documents/${doc.id}?tab=sections`}
            active={tab === "sections"}
            label="Sections"
          />
        </div>
      </div>

      {/* Content */}
      {tab === "overview" && (
        <Card>
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100">
              <span className="text-lg">📄</span>
            </div>

            <div className="min-w-0">
              <h2 className="text-base font-semibold text-gray-900">
                Document Summary
              </h2>
              <p className="mt-2 text-sm leading-7 text-gray-700">
                {(doc as any)?.studyGuide?.summary ??
                  "—"}
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <SubCard title="Topic">
              <p className="text-sm font-semibold text-gray-900">{topic}</p>
            </SubCard>

            <SubCard title="Due Date">
              <p className="text-sm font-semibold text-gray-900">{dueDate}</p>
            </SubCard>

            <SubCard title="Estimated Time">
              <p className="text-sm font-semibold text-gray-900">{estTime}</p>
            </SubCard>
          </div>
        </Card>
      )}

      {tab === "actions" && (
        <Card>
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-base font-semibold text-gray-900">Key Actions</h2>
            <span className="text-xs text-gray-500">v1 (mock)</span>
          </div>

          <div className="mt-5 grid gap-4">
            <SubCard title="What you should do next">
              <ul className="space-y-3">
                {(doc as any)?.studyGuide?.keyTakeaways?.length ? (
                  (doc as any).studyGuide.keyTakeaways.map((k: string) => (
                    <li key={k} className="flex gap-3">
                      <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-black/70" />
                      <span className="leading-7">{k}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-gray-500">No actions generated yet.</li>
                )}
              </ul>
            </SubCard>
          </div>
        </Card>
      )}

      {tab === "checklist" && (
        <Card>
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-base font-semibold text-gray-900">Checklist</h2>
            <span className="text-xs text-gray-500">v1 (mock)</span>
          </div>

          <div className="mt-5 grid gap-4">
            <SubCard title="Step-by-step">
              <ul className="space-y-3">
                {(doc as any)?.studyGuide?.checklist?.length ? (
                  (doc as any).studyGuide.checklist.map((c: string) => (
                    <li key={c} className="flex items-start gap-3">
                      <span className="mt-[6px] h-5 w-5 shrink-0 rounded-md border bg-white" />
                      <span className="leading-7">{c}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-gray-500">No checklist generated yet.</li>
                )}
              </ul>
            </SubCard>
          </div>
        </Card>
      )}

      {tab === "details" && (
        <Card>
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-base font-semibold text-gray-900">
              Important Details
            </h2>
            <span className="text-xs text-gray-500">MVP-safe</span>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <SubCard title="Document info">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-gray-500">Status</p>
                  <StatusPill status={doc.status} />
                </div>

                <div className="flex items-center justify-between gap-4">
                  <p className="text-gray-500">Pages</p>
                  <p className="font-medium text-gray-900">
                    {typeof doc.pages === "number" ? doc.pages : "—"}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <p className="text-gray-500">Processed</p>
                  <p className="font-medium text-gray-900">
                    {formatProcessedLabel(doc).replace("Processed ", "")}
                  </p>
                </div>
              </div>
            </SubCard>

            <SubCard title="Extracted fields (placeholder)">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-gray-500">Topic</p>
                  <p className="font-medium text-gray-900">{topic}</p>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <p className="text-gray-500">Due Date</p>
                  <p className="font-medium text-gray-900">{dueDate}</p>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <p className="text-gray-500">Estimated time</p>
                  <p className="font-medium text-gray-900">{estTime}</p>
                </div>
              </div>

              <p className="mt-4 text-xs text-gray-500">
                These fields will be auto-filled once backend extraction is connected.
              </p>
            </SubCard>
          </div>
        </Card>
      )}

      {tab === "sections" && (
        <Card>
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-base font-semibold text-gray-900">Sections</h2>
            <span className="text-xs text-gray-500">MVP (mock)</span>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4">
            {sections.map((s) => (
              <SubCard key={s.title} title={s.title}>
                <p className="text-sm text-gray-600">{s.desc}</p>

                {s.items?.length ? (
                  <ul className="mt-4 space-y-2">
                    {s.items.map((it: string) => (
                      <li key={it} className="flex gap-3">
                        <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-black/70" />
                        <span className="leading-7">{it}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 text-sm text-gray-500">
                    Nothing to show here yet.
                  </p>
                )}
              </SubCard>
            ))}
          </div>
        </Card>
      )}

      {/* Back link (optional convenience) */}
      <div className="pt-2">
        <Link
          href="/dashboard"
          className="text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          ← Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
