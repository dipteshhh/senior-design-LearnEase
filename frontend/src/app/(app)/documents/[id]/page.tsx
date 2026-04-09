"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type {
  Citation,
  DocumentDetail,
  DocumentListItem,
  ExtractionItem,
  StudyGuideSection,
} from "@/lib/contracts";
import {
  deleteDocument,
  getDocument,
  updateChecklistItem,
  updateDueDate,
  updateDueTime,
  updateReminderOptIn,
} from "@/lib/data/documents";
import { getErrorMessage } from "@/lib/errorUx";

type TabId = "overview" | "actions" | "checklist" | "details" | "sections";

function StatusPill({ status }: { status: DocumentListItem["status"] }) {
  const base =
    "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium";

  if (status === "ready") {
    return (
      <span className={`${base} bg-emerald-50 text-emerald-700`}>
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        Ready
      </span>
    );
  }

  if (status === "processing" || status === "uploaded") {
    return (
      <span className={`${base} bg-amber-50 text-amber-700`}>
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        Processing
      </span>
    );
  }

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
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[28px] border border-gray-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)] sm:p-6 ${className}`}
    >
      {children}
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
      {text}
    </div>
  );
}

function SectionHeading({
  icon,
  title,
  description,
  right,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gray-100 text-gray-600">
          {icon}
        </div>
        <div>
          <h2 className="text-[22px] font-semibold tracking-tight text-gray-950 sm:text-[24px]">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-sm text-gray-500">{description}</p>
          ) : null}
        </div>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 px-5 py-5">
      <p className="text-sm font-medium text-gray-400">{label}</p>
      <p className="mt-2 text-[24px] font-semibold leading-snug tracking-tight text-gray-950 sm:text-[20px]">
        {value}
      </p>
    </div>
  );
}

function SummaryIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 3.75h7l4.25 4.25v11A1.75 1.75 0 0 1 16.5 20.75h-9A1.75 1.75 0 0 1 5.75 19V5.5A1.75 1.75 0 0 1 7.5 3.75Z" />
      <path d="M14 3.75V8h4.25" />
      <path d="M8.5 11.25h7" />
      <path d="M8.5 14.5h7" />
    </svg>
  );
}

function ActionsIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function ChecklistIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 6 1.5 1.5L13 5" />
      <path d="m9 12 1.5 1.5L13 11" />
      <path d="m9 18 1.5 1.5L13 17" />
      <path d="M5 6h1" />
      <path d="M5 12h1" />
      <path d="M5 18h1" />
      <path d="M16 6h3" />
      <path d="M16 12h3" />
      <path d="M16 18h3" />
    </svg>
  );
}

function DetailsIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 8.5h.01" />
      <path d="M11.25 12h1.5v4h1.5" />
      <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />
    </svg>
  );
}

function SectionsIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.75 6.75h14.5" />
      <path d="M4.75 12h14.5" />
      <path d="M4.75 17.25h14.5" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 9.25v4.5" />
      <path d="M12 17h.01" />
      <path d="m10.29 3.86-7 12.12A2 2 0 0 0 5 19h14a2 2 0 0 0 1.73-3.02l-7-12.12a2 2 0 0 0-3.46 0Z" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 8.5h.01" />
      <path d="M11.25 12h1.5v4h1.5" />
      <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />
    </svg>
  );
}

function QuoteIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 11H6.75A1.75 1.75 0 0 1 5 9.25V8a3 3 0 0 1 3-3" />
      <path d="M19 11h-3.25A1.75 1.75 0 0 1 14 9.25V8a3 3 0 0 1 3-3" />
      <path d="M9 11v3.25A2.75 2.75 0 0 1 6.25 17H5" />
      <path d="M18 11v3.25A2.75 2.75 0 0 1 15.25 17H14" />
    </svg>
  );
}

function formatDate(value: string): string {
  // Parse YYYY-MM-DD manually to avoid timezone shift.
  // new Date("2025-10-12") is parsed as UTC midnight, which
  // toLocaleDateString converts to the previous day in US timezones.
  const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (parts) {
    const [, y, m, d] = parts;
    // Construct with local components — month is 0-indexed
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    return date.toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }
  // Fallback for non-ISO formats
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${m.toString().padStart(2, "0")} ${period}`;
}

function buildTabHref(
  documentId: string,
  tab: TabId,
  isFocusMode: boolean = false
): string {
  const params = new URLSearchParams();

  params.set("tab", tab);

  if (isFocusMode) {
    params.set("focus", "1");
  }

  return `/documents/${documentId}?${params.toString()}`;
}

function formatCitationLabel(citation: Citation): string {
  if (citation.source_type === "pdf") {
    return `Page ${citation.page}`;
  }

  return `Paragraph ${citation.paragraph}`;
}

function formatCitationSubLabel(citation: Citation): string | null {
  if (citation.source_type === "pdf") {
    return null;
  }

  return citation.anchor_type === "paragraph" ? "DOCX paragraph reference" : null;
}

type ImportantDetailBucket = "dates" | "policies" | "contacts" | "logistics";
type FlattenedImportantDetail = ExtractionItem & {
  bucket: ImportantDetailBucket;
  stableKey: string;
};

function flattenImportantDetails(items: {
  dates: ExtractionItem[];
  policies: ExtractionItem[];
  contacts: ExtractionItem[];
  logistics: ExtractionItem[];
}): FlattenedImportantDetail[] {
  const addBucket = (
    bucket: ImportantDetailBucket,
    entries: ExtractionItem[]
  ): FlattenedImportantDetail[] =>
    entries.map((item, index) => ({
      ...item,
      bucket,
      stableKey: `${bucket}:${item.id}:${index}`,
    }));

  return [
    ...addBucket("dates", items.dates),
    ...addBucket("policies", items.policies),
    ...addBucket("contacts", items.contacts),
    ...addBucket("logistics", items.logistics),
  ];
}

function isDeadlineLike(item: ExtractionItem): boolean {
  const text = `${item.label} ${item.supporting_quote}`.toLowerCase();
  return (
    text.includes("deadline") ||
    text.includes("due date") ||
    text.includes("due ") ||
    text.includes("late submission") ||
    text.includes("late penalty")
  );
}

function getTabBadgeStyles(active: boolean, emphasis: "default" | "success" = "default") {
  if (emphasis === "success") {
    return "bg-emerald-100 text-emerald-700";
  }

  return active ? "bg-gray-950 text-white" : "bg-gray-100 text-gray-600";
}

export default function DocumentPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  const id = params?.id;
  const requestedTab = (searchParams.get("tab") ?? "overview").toLowerCase() as TabId;
  const isFocusMode = searchParams.get("focus") === "1";

  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [checklistCompleted, setChecklistCompleted] = useState<Record<string, boolean>>({});
  const [isDeleting, setIsDeleting] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const [openSectionId, setOpenSectionId] = useState<string | null>(null);
  const [citationDrawerOpen, setCitationDrawerOpen] = useState(false);
  const [citationDrawerTitle, setCitationDrawerTitle] = useState("Source Citations");
  const [activeCitations, setActiveCitations] = useState<Citation[]>([]);
  const [dueTimeInput, setDueTimeInput] = useState("");
  const [dueTimeSaving, setDueTimeSaving] = useState(false);
  const [savedDueTime, setSavedDueTime] = useState<string | null>(null);
  const [reminderOptInSaving, setReminderOptInSaving] = useState(false);
  const [manualReminderOpen, setManualReminderOpen] = useState(false);
  const [dueDateInput, setDueDateInput] = useState("");
  const [dueDateSaving, setDueDateSaving] = useState(false);
  const [isEditingDeadline, setIsEditingDeadline] = useState(false);

  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await getDocument(id);
        if (!cancelled) {
          setDetail(response);
        }
      } catch (err) {
        if (!cancelled) {
          setError(getErrorMessage(err, "Unable to load document."));
          setDetail(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const document = detail?.document ?? null;
  const studyGuide = detail?.studyGuide ?? null;

  useEffect(() => {
    if (!detail) return;
    setChecklistCompleted(detail.checklistCompletion);
    if (detail.document.assignment_due_time) {
      setSavedDueTime(detail.document.assignment_due_time);
      setDueTimeInput(detail.document.assignment_due_time);
    } else {
      setSavedDueTime(null);
      setDueTimeInput("");
    }
    setManualReminderOpen(false);
    setDueDateInput("");
    setIsEditingDeadline(false);
  }, [detail]);

  useEffect(() => {
    if (!studyGuide) return;

    const total = studyGuide.sections.length;

    if (total === 0) {
      setFocusIndex(0);
      setOpenSectionId(null);
      return;
    }

    setFocusIndex((prev) => Math.max(0, Math.min(prev, total - 1)));

    setOpenSectionId((current) => {
      if (current && studyGuide.sections.some((section) => section.id === current)) {
        return current;
      }
      return studyGuide.sections[0]?.id ?? null;
    });
  }, [studyGuide]);

  if (!id) {
    return <p className="text-sm text-gray-600">Missing document id.</p>;
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl animate-pulse space-y-8">
        <div className="space-y-3">
          <div className="h-10 w-2/3 rounded-xl bg-gray-200" />
          <div className="h-4 w-1/3 rounded-lg bg-gray-100" />
        </div>

        <div className="flex gap-6 border-b border-gray-200 pb-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-10 w-28 rounded-2xl bg-gray-100" />
          ))}
        </div>

        <div className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)] space-y-5">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-gray-100" />
            <div className="space-y-2">
              <div className="h-5 w-40 rounded bg-gray-200" />
              <div className="h-4 w-80 rounded bg-gray-100" />
            </div>
          </div>
          <div className="h-4 w-full rounded bg-gray-100" />
          <div className="h-4 w-11/12 rounded bg-gray-100" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="h-24 rounded-2xl bg-gray-100" />
            <div className="h-24 rounded-2xl bg-gray-100" />
            <div className="h-24 rounded-2xl bg-gray-100" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
        <Link href="/dashboard" className="text-sm font-medium underline">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-gray-900">Document not found</h1>
        <Link href="/dashboard" className="text-sm font-medium underline">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  if (!studyGuide) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div className="space-y-3">
          {document.status !== "failed" ? <StatusPill status={document.status} /> : null}
          <h1 className="text-3xl font-semibold tracking-tight text-gray-950 sm:text-4xl">
            {document.filename}
          </h1>
          <p className="text-sm text-gray-500">
            Processed on {formatDate(document.uploaded_at)} • {document.page_count} pages
          </p>
        </div>

        <Card>
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-950">
              Study guide not available yet
            </h2>
            <p className="text-sm leading-6 text-gray-600">
              This document does not have a ready study guide yet. Continue processing or return to
              your dashboard.
            </p>

            {document.document_type === "UNSUPPORTED" ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                This document type is not currently supported for full LearnEase results.
              </div>
            ) : null}

            {document.error_message ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {document.error_message}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                href={`/documents/${document.id}/processing`}
                className="inline-flex items-center justify-center rounded-2xl bg-black px-4 py-2.5 text-sm font-semibold text-white hover:bg-black/90"
              >
                Open Processing
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center rounded-2xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-50"
              >
                Back to Dashboard
              </Link>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const checklistTotal = studyGuide.checklist.length;
  const checklistDone = studyGuide.checklist.filter(
    (item) => checklistCompleted[item.id] ?? false
  ).length;
  const checklistProgress = checklistTotal > 0 ? (checklistDone / checklistTotal) * 100 : 0;

  const tabs: Array<{
    id: TabId;
    label: string;
    badge?: string;
    badgeTone?: "default" | "success";
  }> = [
    { id: "overview", label: "Overview" },
    { id: "actions", label: "Key Actions" },
    {
      id: "checklist",
      label: "Checklist",
      badge: checklistTotal > 0 ? `${checklistDone}/${checklistTotal}` : undefined,
      badgeTone: "success",
    },
    { id: "details", label: "Important Details" },
    {
      id: "sections" as TabId,
      label: document.document_type === "HOMEWORK" ? "Problem Guide" : "Sections",
      badge: studyGuide.sections.length > 0 ? String(studyGuide.sections.length) : undefined,
      badgeTone: "default" as const,
    },
  ];

  const validTabs = new Set<TabId>(tabs.map((tab) => tab.id));
  const tab: TabId = validTabs.has(requestedTab) ? requestedTab : "overview";

  const detailItems = flattenImportantDetails(studyGuide.important_details);
  const focusSection = studyGuide.sections[focusIndex] ?? null;
  const canOpenQuiz = document.document_type === "LECTURE";

  async function handleChecklistToggle(itemId: string, completed: boolean) {
    if (!document) return;

    const previous = checklistCompleted[itemId] ?? false;
    const nextState = { ...checklistCompleted, [itemId]: completed };

    setChecklistCompleted(nextState);
    setError(null);

    try {
      await updateChecklistItem(document.id, itemId, completed);
    } catch (err) {
      setChecklistCompleted((current) => ({ ...current, [itemId]: previous }));
      setError(getErrorMessage(err, "Unable to update checklist item."));
    }
  }

  function enterDeadlineEdit() {
    if (!document) return;
    setDueDateInput(document.assignment_due_date ?? "");
    setDueTimeInput(savedDueTime ?? "");
    setIsEditingDeadline(true);
  }

  async function handleSaveDueDate(): Promise<boolean> {
    if (!document || dueDateSaving || !dueDateInput.trim()) return false;

    setDueDateSaving(true);
    setError(null);

    try {
      const result = await updateDueDate(document.id, dueDateInput.trim());
      setDetail((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          document: {
            ...prev.document,
            assignment_due_date: result.assignment_due_date,
            assignment_due_time: result.assignment_due_time,
            reminder_opt_in: result.reminder_opt_in,
            reminder_status: result.reminder_status as DocumentListItem["reminder_status"],
          },
        };
      });
      return true;
    } catch (err) {
      setError(getErrorMessage(err, "Unable to save due date."));
      return false;
    } finally {
      setDueDateSaving(false);
    }
  }

  async function handleSaveDueTime(): Promise<boolean> {
    if (!document || dueTimeSaving || !dueTimeInput.trim()) return false;

    setDueTimeSaving(true);
    setError(null);

    try {
      const result = await updateDueTime(document.id, dueTimeInput.trim());
      setSavedDueTime(result.assignment_due_time);
      setDetail((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          document: {
            ...prev.document,
            assignment_due_time: result.assignment_due_time,
            reminder_opt_in: result.reminder_opt_in,
            reminder_status: result.reminder_status as DocumentListItem["reminder_status"],
          },
        };
      });
      return true;
    } catch (err) {
      setError(getErrorMessage(err, "Unable to save due time."));
      return false;
    } finally {
      setDueTimeSaving(false);
    }
  }

  async function handleSaveDeadlineEdits(): Promise<void> {
    const dateSaved = await handleSaveDueDate();
    if (!dateSaved) {
      return;
    }

    if (dueTimeInput.trim()) {
      const timeSaved = await handleSaveDueTime();
      if (!timeSaved) {
        return;
      }
    }

    setIsEditingDeadline(false);
    setManualReminderOpen(false);
  }

  async function handleReminderOptIn(optIn: boolean) {
    if (!document || reminderOptInSaving) return;

    setReminderOptInSaving(true);
    setError(null);

    try {
      const result = await updateReminderOptIn(document.id, optIn);
      setDetail((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          document: {
            ...prev.document,
            reminder_opt_in: result.reminder_opt_in,
            reminder_status: result.reminder_status as DocumentListItem["reminder_status"],
          },
        };
      });
    } catch (err) {
      setError(getErrorMessage(err, "Unable to update reminder preference."));
    } finally {
      setReminderOptInSaving(false);
    }
  }

  async function handleDeleteDocument() {
    if (!document || isDeleting) return;

    const confirmed = window.confirm(
      "Delete this document and all generated artifacts? This action cannot be undone."
    );
    if (!confirmed) return;

    setIsDeleting(true);
    setError(null);

    try {
      await deleteDocument(document.id);
      router.replace("/dashboard");
    } catch (err) {
      setError(getErrorMessage(err, "Unable to delete document right now."));
      setIsDeleting(false);
    }
  }

  function openCitationDrawer(title: string, citations: Citation[]) {
    setCitationDrawerTitle(title);
    setActiveCitations(citations);
    setCitationDrawerOpen(true);
  }

  function renderSectionAccordionRow(section: StudyGuideSection, index: number) {
    const isOpen = openSectionId === section.id;

    return (
      <div
        key={section.id}
        className="overflow-hidden rounded-3xl border border-gray-200 bg-white"
      >
        <button
          type="button"
          onClick={() =>
            setOpenSectionId((current) => (current === section.id ? null : section.id))
          }
          className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left hover:bg-gray-50"
        >
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-500">
              {index + 1}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                Section {index + 1}
              </p>
              <p className="mt-1 truncate text-base font-semibold text-gray-950">
                {section.title}
              </p>
            </div>
          </div>

          <span className="shrink-0 text-gray-500">
            {isOpen ? (
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m6 15 6-6 6 6" />
              </svg>
            ) : (
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            )}
          </span>
        </button>

        {isOpen ? (
          <div className="border-t border-gray-200 px-6 py-5">
            <p className="whitespace-pre-line text-[15px] leading-8 text-gray-700">{section.content}</p>

            <button
              type="button"
              onClick={() => openCitationDrawer(section.title, section.citations)}
              className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-gray-500 underline underline-offset-4 hover:text-gray-800"
            >
              <QuoteIcon />
              View source citations ({section.citations.length})
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <div className="mx-auto w-full max-w-7xl space-y-6 sm:space-y-8">
        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-3xl font-semibold tracking-tight text-gray-950 sm:text-4xl">
              {document.filename}
            </h1>
            <p className="mt-3 text-[15px] text-gray-500">
              Processed on {formatDate(document.uploaded_at)} • {document.page_count} pages
            </p>
          </div>

          <div className="flex w-full flex-wrap items-center gap-3 lg:w-auto lg:justify-end">
            <Link
              href={`/documents/${document.id}/focus`}
              className="inline-flex w-full items-center justify-center rounded-2xl border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-950 shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:bg-gray-50 sm:w-auto"
            >
              <span className="mr-2">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M15 3h6v6" />
                  <path d="M9 21H3v-6" />
                  <path d="m21 3-7 7" />
                  <path d="m3 21 7-7" />
                </svg>
              </span>
              {document.document_type === "HOMEWORK" ? "Problem Focus" : "Focus Mode"}
            </Link>

            {canOpenQuiz ? (
              <Link
                href={`/documents/${document.id}/quiz`}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-black px-6 py-3 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:bg-black/90 sm:w-auto"
              >
                <span className="mr-2">
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9.09 9a3 3 0 1 1 5.82 1c0 2-3 3-3 3" />
                    <path d="M12 17h.01" />
                    <path d="M4.5 8.5a8 8 0 0 1 15 0" />
                    <path d="M4.5 15.5a8 8 0 0 0 15 0" />
                  </svg>
                </span>
                Test Your Knowledge
              </Link>
            ) : (
              <span className="inline-flex w-full items-center justify-center rounded-2xl bg-gray-100 px-6 py-3 text-sm font-semibold text-gray-600 sm:w-auto">
                Quiz for lecture docs only
              </span>
            )}

            <button
              type="button"
              onClick={() => {
                void handleDeleteDocument();
              }}
              disabled={isDeleting}
              className="inline-flex w-full items-center justify-center rounded-2xl border border-rose-300 bg-white px-5 py-3 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        </header>

        <nav className="border-b border-gray-200">
          <div className="-mx-1 overflow-x-auto pb-1">
            <div className="flex min-w-max items-end gap-2 px-1 sm:gap-3">
            {tabs.map((tabItem) => {
              const active = tab === tabItem.id;

              return (
                <Link
                  key={tabItem.id}
                  href={buildTabHref(
                    document.id,
                    tabItem.id,
                    tabItem.id === "sections" && isFocusMode
                  )}
                  className={`inline-flex items-center gap-2 rounded-t-2xl border-b-[3px] px-4 py-3 text-[15px] transition ${
                    active
                      ? "border-gray-950 bg-white font-semibold text-gray-950 shadow-[inset_0_0_0_1px_rgb(229,231,235)]"
                      : "border-transparent text-gray-500 hover:text-gray-900"
                  }`}
                >
                  <span>{tabItem.label}</span>
                  {tabItem.badge ? (
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${getTabBadgeStyles(
                        active,
                        tabItem.badgeTone ?? "default"
                      )}`}
                    >
                      {tabItem.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
            </div>
          </div>
        </nav>

        {tab === "overview" ? (
          <Card className="space-y-10">
            <SectionHeading icon={<SummaryIcon />} title="Document Summary" />

            <p className="max-w-3xl text-[17px] leading-8 text-gray-700">
              {studyGuide.overview.summary}
            </p>

            {(studyGuide.overview.topic ||
              (studyGuide.overview.due_date && document.document_type !== "HOMEWORK") ||
              studyGuide.overview.estimated_time) ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {studyGuide.overview.topic ? (
                  <MetricCard label="Topic" value={studyGuide.overview.topic} />
                ) : null}
                {studyGuide.overview.due_date && document.document_type !== "HOMEWORK" ? (
                  <MetricCard label="Due Date" value={studyGuide.overview.due_date} />
                ) : null}
                {studyGuide.overview.estimated_time ? (
                  <MetricCard
                    label="Estimated Time"
                    value={studyGuide.overview.estimated_time}
                  />
                ) : null}
              </div>
            ) : null}

            {document.document_type === "HOMEWORK" ? (
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 space-y-4">
                <h3 className="text-base font-semibold text-gray-950">Assignment Deadline</h3>

                {document.assignment_due_date && !isEditingDeadline ? (
                  /* ── Display mode: due date exists (with or without time) ── */
                  <div className="space-y-3">
                    <p className="text-[17px] font-semibold text-gray-900">
                      Due: {formatDate(document.assignment_due_date)}
                      {savedDueTime ? ` — ${formatTime(savedDueTime)}` : ""}
                    </p>

                    {!savedDueTime && document.reminder_status !== "past_due" ? (
                      <div className="space-y-2">
                        <p className="text-sm text-amber-700">
                          Due time was not detected. Enter the time to enable a reminder.
                        </p>
                        <div className="flex flex-wrap items-center gap-3">
                          <input
                            type="time"
                            value={dueTimeInput}
                            onChange={(e) => setDueTimeInput(e.target.value)}
                            className="rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                          />
                          <button
                            type="button"
                            onClick={() => { void handleSaveDueTime(); }}
                            disabled={dueTimeSaving || !dueTimeInput.trim()}
                            className="inline-flex items-center justify-center rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {dueTimeSaving ? "Saving..." : "Set Due Time"}
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {document.reminder_status === "past_due" ? (
                      <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        Past due
                      </span>
                    ) : null}

                    {document.reminder_status !== "past_due" && savedDueTime && document.reminder_opt_in ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        {document.reminder_status === "sent" ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            Reminder sent
                          </span>
                        ) : document.reminder_status === "sending" || document.reminder_status === "pending" ? (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                            Reminder scheduled
                          </span>
                        ) : document.reminder_status === "failed" ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                            Reminder pending retry
                          </span>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="flex items-center gap-3 flex-wrap">
                      <button
                        type="button"
                        onClick={enterDeadlineEdit}
                        className="inline-flex items-center justify-center rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-black/90"
                      >
                        Edit
                      </button>
                      {document.reminder_status !== "past_due" && savedDueTime && !document.reminder_opt_in ? (
                        <button
                          type="button"
                          onClick={() => { void handleReminderOptIn(true); }}
                          disabled={reminderOptInSaving}
                          className="inline-flex items-center justify-center rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {reminderOptInSaving ? "Enabling..." : "Email me a reminder"}
                        </button>
                      ) : null}
                      {document.reminder_status !== "past_due" && savedDueTime && document.reminder_opt_in ? (
                        <button
                          type="button"
                          onClick={() => { void handleReminderOptIn(false); }}
                          disabled={reminderOptInSaving}
                          className="inline-flex items-center justify-center rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {reminderOptInSaving ? "Updating..." : "Cancel reminder"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : (document.assignment_due_date || manualReminderOpen) && isEditingDeadline ? (
                  /* ── Edit mode: modify existing due date and/or time ── */
                  <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
                    <p className="text-sm font-medium text-gray-700">
                      Update the due date and time for this assignment.
                    </p>
                    <div className="flex items-center gap-3 flex-wrap">
                      <input
                        type="date"
                        value={dueDateInput}
                        onChange={(e) => setDueDateInput(e.target.value)}
                        className="rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                      />
                      <input
                        type="time"
                        value={dueTimeInput}
                        onChange={(e) => setDueTimeInput(e.target.value)}
                        className="rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          void handleSaveDeadlineEdits();
                        }}
                        disabled={dueDateSaving || dueTimeSaving || !dueDateInput.trim()}
                        className="inline-flex items-center justify-center rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {dueDateSaving || dueTimeSaving ? "Saving..." : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditingDeadline(false)}
                        className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── Case 3: no due date detected ── */
                  <div className="space-y-3">
                    <p className="text-sm text-gray-500">
                      No due date was detected from this document.
                    </p>
                    {!manualReminderOpen ? (
                      <div className="flex items-center gap-3 flex-wrap">
                        <button
                          type="button"
                          onClick={() => {
                            setManualReminderOpen(true);
                            setIsEditingDeadline(true);
                          }}
                          className="inline-flex items-center justify-center rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-black/90"
                        >
                          Set a reminder
                        </button>
                      </div>
                    ) : !isEditingDeadline ? (
                      <div className="flex items-center gap-3 flex-wrap">
                        <button
                          type="button"
                          onClick={enterDeadlineEdit}
                          className="inline-flex items-center justify-center rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-black/90"
                        >
                          Set a reminder
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
                        <p className="text-sm font-medium text-gray-700">
                          Enter the due date and time to enable a reminder.
                        </p>
                        <div className="flex items-center gap-3 flex-wrap">
                          <input
                            type="date"
                            value={dueDateInput}
                            onChange={(e) => setDueDateInput(e.target.value)}
                            className="rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                          />
                          <input
                            type="time"
                            value={dueTimeInput}
                            onChange={(e) => setDueTimeInput(e.target.value)}
                            className="rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                          />
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              void handleSaveDeadlineEdits();
                            }}
                            disabled={dueDateSaving || dueTimeSaving || !dueDateInput.trim()}
                            className="inline-flex items-center justify-center rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {dueDateSaving || dueTimeSaving ? "Saving..." : "Set Due Date"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIsEditingDeadline(false);
                              setManualReminderOpen(false);
                            }}
                            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </Card>
        ) : null}

        {tab === "actions" ? (
          <Card className="space-y-6">
            <SectionHeading
              icon={<ActionsIcon />}
              title="Key Actions"
              description="The most important directives, takeaways, and requirements extracted from this document."
            />

            {studyGuide.key_actions.length === 0 ? (
              <EmptyState text="No key actions were generated for this document." />
            ) : (
              <div className="space-y-4">
                {studyGuide.key_actions.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-3xl border border-gray-200 bg-white px-6 py-6"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-600">
                        <ActionsIcon />
                      </div>
                      <div className="min-w-0">
                        <p className="text-lg font-semibold tracking-tight text-gray-950">
                          {item.label}
                        </p>
                        <p className="mt-2 text-[15px] leading-7 text-gray-500">
                          {item.supporting_quote}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ) : null}

        {tab === "checklist" ? (
          <Card className="space-y-7">
            <SectionHeading
              icon={<ChecklistIcon />}
              title={
                document.document_type === "HOMEWORK"
                  ? "Assignment Checklist"
                  : document.document_type === "LECTURE"
                  ? "Study Checklist"
                  : "Checklist"
              }
              right={
                <div className="text-sm font-medium text-gray-500">
                  {checklistDone} of {checklistTotal} completed
                </div>
              }
            />

            {checklistTotal > 0 ? (
              <div className="space-y-3">
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-emerald-600 transition-all"
                    style={{ width: `${checklistProgress}%` }}
                  />
                </div>
              </div>
            ) : null}

            {studyGuide.checklist.length === 0 ? (
              <EmptyState text="No checklist items were generated for this document." />
            ) : (() => {
              const GROUP_ORDER = ["setup", "problems", "verify", "submit"] as const;
              const GROUP_LABELS: Record<string, string> = {
                setup: "Setup",
                problems: "Problems",
                verify: "Verify",
                submit: "Submit",
              };

              const renderChecklistItem = (item: typeof studyGuide.checklist[number]) => {
                const checked = checklistCompleted[item.id] ?? false;
                return (
                  <li key={item.id}>
                    <label className="flex cursor-pointer items-start gap-4">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          void handleChecklistToggle(item.id, event.target.checked);
                        }}
                        className="mt-1 h-5 w-5 rounded border-gray-300 text-rose-600 focus:ring-rose-500"
                      />
                      <span className="min-w-0">
                        <span
                          className={`block text-lg font-semibold tracking-tight ${
                            checked ? "text-gray-500 line-through" : "text-gray-950"
                          }`}
                        >
                          {item.label}
                        </span>
                        <span className="mt-1 block text-sm leading-7 text-gray-500">
                          {item.supporting_quote}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              };

              const hasGroups =
                document.document_type === "HOMEWORK" &&
                studyGuide.checklist.some((item) => item.group != null);

              if (hasGroups) {
                const grouped = GROUP_ORDER.map((g) => ({
                  key: g,
                  label: GROUP_LABELS[g],
                  items: studyGuide.checklist.filter((item) => item.group === g),
                })).filter((g) => g.items.length > 0);

                const ungrouped = studyGuide.checklist.filter(
                  (item) => item.group == null || !GROUP_ORDER.includes(item.group as typeof GROUP_ORDER[number])
                );

                return (
                  <div className="space-y-8">
                    {grouped.map(({ key, label, items }) => (
                      <div key={key}>
                        <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-400">
                          {label}
                        </p>
                        <ul className="space-y-5">{items.map(renderChecklistItem)}</ul>
                      </div>
                    ))}
                    {ungrouped.length > 0 && (
                      <ul className="space-y-5">{ungrouped.map(renderChecklistItem)}</ul>
                    )}
                  </div>
                );
              }

              return <ul className="space-y-5">{studyGuide.checklist.map(renderChecklistItem)}</ul>;
            })()}
          </Card>
        ) : null}

        {tab === "details" ? (
          <Card className="space-y-6">
            <SectionHeading
              icon={<DetailsIcon />}
              title="Important Details"
              description="Key dates, policies, contacts, and logistics extracted from the document."
            />

            {detailItems.length === 0 ? (
              <EmptyState text="No important details were generated for this document." />
            ) : (
              <div className="space-y-4">
                {detailItems.map((item) => {
                  const highlighted = isDeadlineLike(item);

                  return (
                    <div
                      key={item.stableKey}
                      className={`rounded-3xl border px-6 py-6 ${
                        highlighted
                          ? "border-amber-200 bg-amber-50"
                          : "border-gray-200 bg-white"
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <div
                          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center ${
                            highlighted ? "text-amber-500" : "text-gray-400"
                          }`}
                        >
                          {highlighted ? <WarningIcon /> : <InfoIcon />}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-xl font-semibold tracking-tight text-gray-950">
                            {item.label}
                          </h3>
                          <p className="mt-2 text-[15px] leading-8 text-gray-700">
                            {item.supporting_quote}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        ) : null}

        {tab === "sections" ? (
          <Card className="space-y-6">
            {isFocusMode ? (
              <>
                <SectionHeading
                  icon={<SectionsIcon />}
                  title={document.document_type === "HOMEWORK" ? "Problem Focus" : "Focus Mode"}
                  description={
                    document.document_type === "HOMEWORK"
                      ? "Work through one problem at a time. Each card explains what the problem requires."
                      : "Read one section at a time in a distraction-free view."
                  }
                  right={
                    <Link
                      href={buildTabHref(document.id, "sections", false)}
                      className="text-sm font-medium text-gray-500 underline underline-offset-4 hover:text-gray-800"
                    >
                      Exit Focus Mode
                    </Link>
                  }
                />

                {studyGuide.sections.length === 0 ? (
                  <EmptyState text="No sections were generated for this document." />
                ) : focusSection ? (
                  <div className="space-y-6">
                    <div className="rounded-3xl border border-gray-200 bg-white px-6 py-6">
                      <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-500">
                          {focusIndex + 1}
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                            {document.document_type === "HOMEWORK" ? "Problem" : "Section"} {focusIndex + 1}
                          </p>
                          <h3 className="mt-1 text-xl font-semibold tracking-tight text-gray-950">
                            {focusSection.title}
                          </h3>
                        </div>
                      </div>

                      <p className="mt-6 whitespace-pre-line text-[16px] leading-8 text-gray-700">
                        {focusSection.content}
                      </p>

                      <button
                        type="button"
                        onClick={() =>
                          openCitationDrawer(focusSection.title, focusSection.citations)
                        }
                        className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-gray-500 underline underline-offset-4 hover:text-gray-800"
                      >
                        <QuoteIcon />
                        View source citations ({focusSection.citations.length})
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <button
                        type="button"
                        onClick={() => setFocusIndex((prev) => Math.max(0, prev - 1))}
                        disabled={focusIndex <= 0}
                        className="rounded-2xl border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {document.document_type === "HOMEWORK" ? "Previous Problem" : "Previous Section"}
                      </button>

                      <p className="text-sm text-gray-500">
                        {document.document_type === "HOMEWORK" ? "Problem" : "Section"} {focusIndex + 1} of {studyGuide.sections.length}
                      </p>

                      <button
                        type="button"
                        onClick={() =>
                          setFocusIndex((prev) =>
                            Math.min(studyGuide.sections.length - 1, prev + 1)
                          )
                        }
                        disabled={focusIndex >= studyGuide.sections.length - 1}
                        className="rounded-2xl border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {document.document_type === "HOMEWORK" ? "Next Problem" : "Next Section"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <SectionHeading
                  icon={<SectionsIcon />}
                  title={document.document_type === "HOMEWORK" ? "Problem Guide" : "Sections"}
                  description={
                    document.document_type === "HOMEWORK"
                      ? "Each card breaks down what a problem requires — requirements, constraints, and context — without giving answers."
                      : "Browse the main sections extracted from the document."
                  }
                  right={
                    <Link
                      href={buildTabHref(document.id, "sections", true)}
                      className="text-sm font-medium text-gray-500 underline underline-offset-4 hover:text-gray-800"
                    >
                      {document.document_type === "HOMEWORK" ? "Enter Problem Focus" : "Enter Focus Mode"}
                    </Link>
                  }
                />

                {studyGuide.sections.length === 0 ? (
                  <EmptyState text="No sections were generated for this document." />
                ) : (
                  <div className="space-y-4">
                    {studyGuide.sections.map((section, index) =>
                      renderSectionAccordionRow(section, index)
                    )}
                  </div>
                )}
              </>
            )}
          </Card>
        ) : null}

        <div className="pt-1">
          <Link
            href="/dashboard"
            className="text-base font-medium text-gray-600 hover:text-gray-900"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>

      {citationDrawerOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            aria-label="Close citations panel"
            onClick={() => setCitationDrawerOpen(false)}
            className="absolute inset-0 bg-black/10"
          />
          <aside className="relative z-10 h-full w-full max-w-md border-l border-gray-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-5">
              <div>
                <p className="text-lg font-semibold text-gray-950">Source Citations</p>
                <p className="mt-1 text-sm text-gray-500">{citationDrawerTitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setCitationDrawerOpen(false)}
                className="rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m18 6-12 12" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            <div className="h-[calc(100%-88px)] overflow-y-auto px-5 py-5">
              {activeCitations.length === 0 ? (
                <EmptyState text="No citations available." />
              ) : (
                <div className="space-y-4">
                  {activeCitations.map((citation, index) => (
                    <div
                      key={`${citation.source_type}-${index}-${formatCitationLabel(citation)}`}
                      className="rounded-2xl border border-gray-200 bg-white p-4"
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 text-gray-400">
                          <QuoteIcon />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-950">
                            {formatCitationLabel(citation)}
                          </p>
                          {formatCitationSubLabel(citation) ? (
                            <p className="mt-1 text-xs uppercase tracking-wide text-gray-400">
                              {formatCitationSubLabel(citation)}
                            </p>
                          ) : null}
                          <p className="mt-3 text-sm leading-7 text-gray-600">
                            {citation.excerpt}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
