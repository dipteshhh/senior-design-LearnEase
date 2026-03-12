import Link from "next/link";

const termsSections = [
  {
    title: "Academic Use",
    body:
      "LearnEase is intended to help users understand uploaded academic materials. It is not a homework solver and must not be used to generate answers for graded work.",
  },
  {
    title: "Accounts",
    body:
      "You are responsible for the Google account used to access LearnEase and for the documents you upload through that account.",
  },
  {
    title: "Stored Content",
    body:
      "Uploaded files and generated study materials may be stored to support document review, checklist state, and retry flows. Retention follows the backend policy configured for the service.",
  },
  {
    title: "Project Status",
    body:
      "LearnEase is an academic senior design project and is provided as-is for evaluation and educational use.",
  },
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl rounded-[28px] border border-slate-200 bg-white p-8 shadow-[0_16px_40px_rgba(15,23,42,0.06)] sm:p-10">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">
              LearnEase
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
              Terms of Service
            </h1>
          </div>
          <Link href="/signin" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            Back to sign in
          </Link>
        </div>

        <p className="mt-6 text-sm leading-7 text-slate-600">
          These terms describe the intended use of LearnEase in its current senior design project
          form.
        </p>

        <div className="mt-8 space-y-6">
          {termsSections.map((section) => (
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
