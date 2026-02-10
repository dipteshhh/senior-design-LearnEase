import Link from "next/link";
import { getDocumentById } from "@/lib/mock/store";

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params; // ✅ unwrap params
  const doc = getDocumentById(id);

  if (!doc) {
    return (
      <div className="p-8 space-y-4">
        <h1 className="text-2xl font-semibold">Document not found</h1>
        <p className="text-sm text-gray-600">Tried id: {id}</p>
        <Link href="/dashboard" className="underline">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold text-gray-900">
            {doc.title}
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Status: {doc.status} {doc.pages ? `• ${doc.pages} pages` : ""}
          </p>
        </div>

        <Link
          href={`/documents/${doc.id}/quiz`}
          className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white"
        >
          Start Quiz
        </Link>
      </div>

      <div className="rounded-2xl border bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Study Guide</h2>

        <div>
          <p className="text-sm font-semibold text-gray-900">Summary</p>
          <p className="mt-2 text-sm text-gray-700">{doc.studyGuide.summary}</p>
        </div>

        <div>
          <p className="text-sm font-semibold text-gray-900">Key Takeaways</p>
          <ul className="mt-2 list-disc pl-5 text-sm text-gray-700 space-y-1">
            {doc.studyGuide.keyTakeaways.map((k) => (
              <li key={k}>{k}</li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-sm font-semibold text-gray-900">Checklist</p>
          <ul className="mt-2 list-disc pl-5 text-sm text-gray-700 space-y-1">
            {doc.studyGuide.checklist.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      </div>

      <Link href="/dashboard" className="text-sm underline">
        Back to Dashboard
      </Link>
    </div>
  );
}
