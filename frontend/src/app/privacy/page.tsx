import Link from "next/link";

const privacySections = [
  {
    title: "What We Collect",
    body:
      "LearnEase stores the Google account identifier needed for session handling together with uploaded documents and generated study materials associated with that account.",
  },
  {
    title: "Why We Store It",
    body:
      "Stored data supports document retrieval, study-guide and quiz generation, checklist persistence, and account-scoped deletion flows.",
  },
  {
    title: "Protection",
    body:
      "Uploaded document files and extracted text artifacts are encrypted at rest with AES-256-GCM. Generated study guides, quizzes, checklist items, and account metadata (email, name, filenames, due dates) are stored in the application database without additional field-level encryption. All documents are scoped to the authenticated owner and served only over authenticated, same-origin requests.",
  },
  {
    title: "Retention and Deletion",
    body:
      "Documents are subject to backend retention policy and users can request deletion of their stored account data from the application settings page.",
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl rounded-[28px] border border-slate-200 bg-white p-8 shadow-[0_16px_40px_rgba(15,23,42,0.06)] sm:p-10">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">
              LearnEase
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
              Privacy Policy
            </h1>
          </div>
          <Link href="/signin" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            Back to sign in
          </Link>
        </div>

        <p className="mt-6 text-sm leading-7 text-slate-600">
          This page summarizes how LearnEase handles account and document data in the current
          project implementation.
        </p>

        <div className="mt-8 space-y-6">
          {privacySections.map((section) => (
            <section key={section.title} className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-5">
              <h2 className="text-lg font-semibold text-slate-950">{section.title}</h2>
              <p className="mt-2 text-sm leading-7 text-slate-600">{section.body}</p>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
