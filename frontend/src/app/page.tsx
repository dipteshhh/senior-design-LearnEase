import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  FileText,
  GraduationCap,
  Layers,
  Lock,
  Quote,
  ShieldCheck,
  Target,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";

const howItWorks = [
  {
    step: "1",
    icon: Upload,
    title: "Upload Document",
    description:
      "Upload a PDF or DOCX like lecture notes, assignment briefs, or a syllabus.",
  },
  {
    step: "2",
    icon: FileText,
    title: "Generate Study Guide",
    description:
      "Create a structured guide with key actions, checklists, and source citations.",
  },
  {
    step: "3",
    icon: ClipboardCheck,
    title: "Review and Learn",
    description:
      "Use sections, focus mode, and lecture quizzes to reinforce understanding.",
  },
];

const features = [
  {
    icon: Layers,
    title: "Context-Aware Tabs",
    description:
      "Overview, Key Actions, Checklist, Important Details, and Sections adapt to document content.",
  },
  {
    icon: Target,
    title: "Focus Mode",
    description: "Read one section at a time with a distraction-minimized layout.",
  },
  {
    icon: GraduationCap,
    title: "Lecture-Only Quiz",
    description: "Generate comprehension checks from lecture documents only.",
  },
];

const trustItems = [
  {
    icon: ShieldCheck,
    title: "Encrypted at Rest",
    description: "Uploaded artifacts are encrypted with AES-256.",
  },
  {
    icon: Trash2,
    title: "Auto-Deletion",
    description: "Documents are retained for 30 days by default and can be deleted anytime.",
  },
  {
    icon: Lock,
    title: "Ownership Protected",
    description: "Access controls ensure users can only read their own documents.",
  },
];

export default function Home() {
  const year = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <header className="sticky top-0 z-50 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-gray-900" />
            <span className="text-xl font-bold tracking-tight">LearnEase</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/signin"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 sm:inline-flex"
            >
              Log in
            </Link>
            <Link
              href="/signin"
              className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
            >
              Get Started
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="px-6 py-24">
          <div className="mx-auto w-full max-w-4xl text-center">
            <h1 className="text-balance text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
              Understand Academic Documents Faster
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600 sm:text-xl">
              Upload PDF or DOCX files and get structured study guides with traceable citations.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/signin"
                className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-6 py-3 text-sm font-semibold text-white hover:bg-gray-800"
              >
                Get Started with Google
                <ArrowRight className="h-5 w-5" />
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center rounded-xl border px-6 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50"
              >
                See How It Works
              </a>
            </div>
          </div>
        </section>

        <section className="border-y bg-gray-50 px-6 py-6">
          <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-center gap-5 text-sm sm:flex-row sm:gap-8">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-rose-600" />
              <span>Not a homework solver</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <span>No answer generation for graded work</span>
            </div>
            <div className="flex items-center gap-2">
              <Quote className="h-4 w-4 text-gray-700" />
              <span>Citations required for generated items</span>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="px-6 py-20">
          <div className="mx-auto w-full max-w-5xl">
            <h2 className="text-center text-3xl font-bold sm:text-4xl">How It Works</h2>
            <p className="mx-auto mt-4 max-w-xl text-center text-gray-600">
              Three steps from upload to understanding.
            </p>
            <div className="mt-14 grid gap-8 md:grid-cols-3">
              {howItWorks.map((item) => (
                <div key={item.step} className="text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-900 text-white">
                    <item.icon className="h-7 w-7" />
                  </div>
                  <p className="mt-4 text-xs font-semibold tracking-wide text-gray-500">
                    STEP {item.step}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-gray-50 px-6 py-20">
          <div className="mx-auto w-full max-w-5xl">
            <h2 className="text-center text-3xl font-bold sm:text-4xl">
              Features Built for Learning
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-center text-gray-600">
              Designed to organize material and improve clarity without providing answers.
            </p>
            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <article key={feature.title} className="rounded-2xl border bg-white p-6 shadow-sm">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-900/10">
                    <feature.icon className="h-6 w-6 text-gray-900" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">{feature.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 py-20">
          <div className="mx-auto w-full max-w-5xl">
            <h2 className="text-center text-3xl font-bold sm:text-4xl">Trust and Security</h2>
            <p className="mx-auto mt-4 max-w-xl text-center text-gray-600">
              LearnEase is built with privacy and data ownership in mind.
            </p>
            <div className="mt-14 grid gap-6 md:grid-cols-3">
              {trustItems.map((item) => (
                <article key={item.title} className="rounded-2xl border bg-white p-6 text-center shadow-sm">
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-gray-900/10">
                    <item.icon className="h-6 w-6 text-gray-900" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">{item.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 pb-16">
          <div className="mx-auto w-full max-w-3xl rounded-2xl bg-gradient-to-br from-gray-900 to-gray-700 px-8 py-12 text-center text-white sm:px-12">
            <h2 className="text-2xl font-bold sm:text-3xl">Ready to Study Smarter?</h2>
            <p className="mx-auto mt-3 max-w-lg text-white/80">
              Upload your first document and generate a structured study guide in a few moments.
            </p>
            <Link
              href="/signin"
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-100"
            >
              Get Started
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t px-6 py-8">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-gray-900" />
            <span className="font-semibold">LearnEase</span>
          </div>
          <p className="text-sm text-gray-500">© {year} LearnEase. Senior Design Project.</p>
        </div>
      </footer>
    </div>
  );
}
