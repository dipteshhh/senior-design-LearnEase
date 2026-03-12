"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  GraduationCap,
  Layers,
  Lock,
  Menu,
  Quote,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";

const howItWorks = [
  {
    step: "01",
    icon: Upload,
    title: "Upload your course material",
    description:
      "Add a PDF or DOCX such as lecture slides, class notes, syllabi, or academic documents.",
  },
  {
    step: "02",
    icon: FileText,
    title: "Generate a structured guide",
    description:
      "LearnEase organizes the content into summaries, sections, checklists, and traceable citations.",
  },
  {
    step: "03",
    icon: ClipboardCheck,
    title: "Review with clarity",
    description:
      "Study with a cleaner reading experience, focus mode, and learning-first outputs built for understanding.",
  },
];

const features = [
  {
    icon: Layers,
    title: "Context-Aware Sections",
    description:
      "Tabs like Overview, Key Actions, Checklist, Important Details, and Sections adapt to the uploaded document.",
  },
  {
    icon: Target,
    title: "Focus Mode",
    description:
      "Read one section at a time in a distraction-minimized layout designed for better concentration.",
  },
  {
    icon: GraduationCap,
    title: "Lecture-Oriented Quiz Support",
    description:
      "Generate comprehension checks from lecture-based material to reinforce understanding without giving graded answers.",
  },
];

const trustItems = [
  {
    icon: ShieldCheck,
    title: "Encrypted at Rest",
    description: "Uploaded artifacts are protected using AES-256 encryption.",
  },
  {
    icon: Trash2,
    title: "Auto-Deletion",
    description:
      "Documents are retained for 30 days by default and can be deleted by the user at any time.",
  },
  {
    icon: Lock,
    title: "Ownership Protected",
    description:
      "Access controls ensure users can only view and manage their own uploaded content.",
  },
];

const learningPoints = [
  "Built for academic understanding, not shortcut answers",
  "Structured study guides with traceable citations",
  "Clean workflow from document upload to review",
];

export default function Home() {
  const year = new Date().getFullYear();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
              <BookOpen className="h-5 w-5 text-slate-900" />
            </div>

            <div className="min-w-0">
              <p className="truncate text-base font-bold tracking-tight text-slate-950 sm:text-lg">
                LearnEase
              </p>
            </div>
          </Link>

          <nav className="hidden items-center gap-6 lg:flex xl:gap-8">
            <a
              href="#how-it-works"
              className="text-sm font-medium text-slate-600 transition hover:text-slate-900"
            >
              How it works
            </a>
            <a
              href="#features"
              className="text-sm font-medium text-slate-600 transition hover:text-slate-900"
            >
              Features
            </a>
            <a
              href="#security"
              className="text-sm font-medium text-slate-600 transition hover:text-slate-900"
            >
              Security
            </a>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/signin"
              className="hidden rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 sm:inline-flex"
            >
              Log in
            </Link>

            <Link
              href="/signin"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 sm:px-5"
            >
              <span className="hidden xs:inline">Get Started</span>
              <span className="xs:hidden">Get Started</span>
              <ArrowRight className="h-4 w-4" />
            </Link>

            <button
              type="button"
              onClick={() => setMobileNavOpen((current) => !current)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 lg:hidden"
              aria-label="Open navigation menu"
              aria-expanded={mobileNavOpen}
              aria-controls="mobile-nav"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>

        {mobileNavOpen ? (
          <div id="mobile-nav" className="border-t border-slate-200 px-4 py-4 lg:hidden">
            <nav className="flex flex-col gap-2">
              <a
                href="#how-it-works"
                onClick={() => setMobileNavOpen(false)}
                className="rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                How it works
              </a>
              <a
                href="#features"
                onClick={() => setMobileNavOpen(false)}
                className="rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                Features
              </a>
              <a
                href="#security"
                onClick={() => setMobileNavOpen(false)}
                className="rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                Security
              </a>
              <Link
                href="/signin"
                onClick={() => setMobileNavOpen(false)}
                className="rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                Log in
              </Link>
            </nav>
          </div>
        ) : null}
      </header>

      <main>
        <section className="relative overflow-hidden px-4 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-16 lg:px-8 lg:pb-24 lg:pt-20">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(15,23,42,0.06),transparent_40%)]" />

          <div className="mx-auto grid w-full max-w-7xl items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
            <div className="order-1">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-600 shadow-sm sm:text-sm">
                <Sparkles className="h-4 w-4 text-slate-900" />
                Built for learning-focused academic support
              </div>

              <h1 className="mt-6 max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight text-slate-950 sm:mt-8 sm:text-5xl lg:text-[60px] xl:text-[64px]">
                Understand academic documents faster with structured study guidance
              </h1>

              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:mt-6 sm:text-lg sm:leading-8">
                LearnEase turns uploaded PDF and DOCX documents into organized study guides,
                section-based reading, checklists, and citation-backed summaries designed to
                improve understanding without acting as a homework solver.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:mt-10 sm:flex-row sm:flex-wrap">
                <Link
                  href="/signin"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                >
                  Get Started with Google
                  <ArrowRight className="h-5 w-5" />
                </Link>

                <a
                  href="#how-it-works"
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-6 py-3.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
                >
                  See How It Works
                </a>
              </div>

              <div className="mt-8 grid gap-3 sm:mt-10">
                {learningPoints.map((point) => (
                  <div key={point} className="flex items-center gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    <p className="text-sm leading-6 text-slate-700 sm:text-base">{point}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="order-2 relative lg:pt-4">
              <div className="rounded-[24px] border border-slate-200 bg-white p-3 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:rounded-[28px] sm:p-4">
                <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4 sm:rounded-[24px] sm:p-5">
                  <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        Generated Study Guide
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Based on uploaded lecture material
                      </p>
                    </div>

                    <div className="w-fit rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      Ready
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4">
                    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            Week 4 Lecture Notes.pdf
                          </p>
                          <p className="text-xs text-slate-500">Uploaded document</p>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:text-xs">
                          Overview
                        </p>
                        <p className="mt-3 text-sm leading-6 text-slate-600">
                          Main themes are extracted into a concise summary so students can quickly
                          understand what the material is about before reading in detail.
                        </p>
                      </div>

                      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:text-xs">
                          Key Actions
                        </p>
                        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                          <li>• Review highlighted concepts</li>
                          <li>• Read section summaries</li>
                          <li>• Use checklist before quiz prep</li>
                        </ul>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:text-xs">
                        Citations Included
                      </p>
                      <p className="mt-3 text-sm leading-6 text-slate-600">
                        Each generated item can reference the source material so users can trace
                        ideas back to the original document content.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row lg:hidden">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Learning-first
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    Not a homework solver
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Output
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    Structured study guide
                  </p>
                </div>
              </div>

              <div className="absolute -bottom-6 -left-6 hidden rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-lg lg:block">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Learning-first
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  Not a homework solver
                </p>
              </div>

              <div className="absolute -right-6 -top-6 hidden rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-lg lg:block">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Output
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  Structured study guide
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-slate-200 bg-slate-50 px-4 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-center gap-4 text-sm text-slate-700 sm:flex-row sm:flex-wrap sm:gap-6 lg:gap-8">
            <div className="flex items-center gap-2 text-center">
              <XCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>Not a homework solver</span>
            </div>
            <div className="flex items-center gap-2 text-center">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
              <span>No answer generation for graded work</span>
            </div>
            <div className="flex items-center gap-2 text-center">
              <Quote className="h-4 w-4 shrink-0 text-slate-700" />
              <span>Citations required for generated items</span>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
          <div className="mx-auto w-full max-w-6xl">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">
                How it works
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                A simple workflow from upload to understanding
              </h2>
              <p className="mt-4 text-base text-slate-600 sm:text-lg">
                LearnEase keeps the process focused, structured, and easy to present in an
                academic setting.
              </p>
            </div>

            <div className="mt-12 grid gap-6 md:grid-cols-2 xl:mt-16 xl:grid-cols-3 xl:gap-8">
              {howItWorks.map((item) => (
                <article
                  key={item.step}
                  className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.04)] transition hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(15,23,42,0.08)] sm:p-8"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white">
                      <item.icon className="h-7 w-7" />
                    </div>
                    <span className="text-sm font-semibold tracking-wide text-slate-300">
                      {item.step}
                    </span>
                  </div>

                  <h3 className="mt-6 text-xl font-semibold text-slate-900">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{item.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="bg-slate-50 px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
          <div className="mx-auto w-full max-w-6xl">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">
                Features
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                Built for learning, clarity, and academic responsibility
              </h2>
              <p className="mt-4 text-base text-slate-600 sm:text-lg">
                The interface is designed to help students study better while keeping the product
                aligned with academic integrity.
              </p>
            </div>

            <div className="mt-12 grid gap-6 md:grid-cols-2 xl:mt-16 xl:grid-cols-3">
              {features.map((feature) => (
                <article
                  key={feature.title}
                  className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.04)] transition hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(15,23,42,0.08)] sm:p-8"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900/10">
                    <feature.icon className="h-6 w-6 text-slate-900" />
                  </div>
                  <h3 className="mt-5 text-xl font-semibold text-slate-900">{feature.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{feature.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="security" className="px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
          <div className="mx-auto w-full max-w-6xl">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">
                Trust and security
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                Designed with privacy and ownership in mind
              </h2>
              <p className="mt-4 text-base text-slate-600 sm:text-lg">
                LearnEase is positioned as a responsible academic tool, so privacy and user
                control are part of the product story.
              </p>
            </div>

            <div className="mt-12 grid gap-6 md:grid-cols-2 xl:mt-16 xl:grid-cols-3">
              {trustItems.map((item) => (
                <article
                  key={item.title}
                  className="rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-[0_8px_24px_rgba(15,23,42,0.04)] transition hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(15,23,42,0.08)] sm:p-8"
                >
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900/10">
                    <item.icon className="h-6 w-6 text-slate-900" />
                  </div>
                  <h3 className="mt-5 text-xl font-semibold text-slate-900">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{item.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 pb-20 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-5xl rounded-[28px] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 px-6 py-12 text-center text-white shadow-[0_24px_80px_rgba(15,23,42,0.25)] sm:rounded-[32px] sm:px-10 sm:py-14 lg:px-12 lg:py-16">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60 sm:text-sm">
              Final call to action
            </p>

            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              Ready to study smarter with LearnEase?
            </h2>

            <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-white/80 sm:text-lg">
              Upload your first document and experience a cleaner, more organized way to review
              academic material for your courses.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/signin"
                className="inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
              >
                Get Started
                <ArrowRight className="h-5 w-5" />
              </Link>

              <a
                href="#how-it-works"
                className="inline-flex items-center rounded-2xl border border-white/20 bg-white/10 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-white/15"
              >
                Review the workflow
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-slate-50 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
              <BookOpen className="h-5 w-5 text-slate-900" />
            </div>

            <div>
              <p className="font-semibold text-slate-900">LearnEase</p>
              <p className="text-sm text-slate-500">Senior Design Project</p>
            </div>
          </div>

          <p className="text-center text-sm text-slate-500 sm:text-right">
            © {year} LearnEase. Built with care for students.
          </p>
        </div>
      </footer>
    </div>
  );
}
