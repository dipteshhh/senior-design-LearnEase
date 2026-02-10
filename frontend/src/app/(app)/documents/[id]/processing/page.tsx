// src/app/(app)/documents/[id]/processing/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

const STEPS = [
  "Extracting text from document",
  "Analyzing structure and sections",
  "Identifying key concepts",
  "Generating action items",
  "Creating study materials",
] as const;

type StepState = "done" | "active" | "pending";

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <div
      className="animate-spin rounded-full border-2 border-white border-t-transparent"
      style={{ height: size, width: size }}
    />
  );
}

function CheckIcon() {
  return <span className="text-sm">✓</span>;
}

export default function ProcessingPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  // Step 1 done, Step 2 active (Figma start state)
  const [activeIndex, setActiveIndex] = useState(1);

  const milestones = useMemo(() => [20, 40, 60, 80, 100], []);
  const [progress, setProgress] = useState(40);

  const [isFinalizing, setIsFinalizing] = useState(false);

  // Prevent double-redirect / multiple finalizations
  const finalizedRef = useRef(false);

  function getState(i: number): StepState {
    const active0 = Math.max(activeIndex - 1, 0);
    if (i < active0) return "done";
    if (i === active0) return "active";
    return "pending";
  }

  // Connector overlay sizing (matches your spacing visually)
  const STEP_PITCH_PX = 60;
  const doneCount = Math.min(Math.max(activeIndex - 1, 0), STEPS.length);
  const greenHeightPx = Math.max(0, doneCount * STEP_PITCH_PX);

  const finalizeAndRedirect = () => {
    if (!id) return;
    if (finalizedRef.current) return;
    finalizedRef.current = true;

    setIsFinalizing(true);
    setProgress(100);

    // short calm pause, then open document
    setTimeout(() => {
      router.push(`/documents/${id}`);
    }, 650);
  };

  useEffect(() => {
    if (!id) return;

    const tickMs = 900;

    const t = setInterval(() => {
      setActiveIndex((prev) => {
        const next = prev + 1;

        const idxForProgress = Math.min(next, STEPS.length) - 1;
        const nextProgress =
          milestones[Math.max(0, Math.min(idxForProgress, milestones.length - 1))];

        setProgress(nextProgress);

        // ✅ If we just hit 100%, finalize immediately (fixes your screenshot issue)
        if (nextProgress >= 100) {
          clearInterval(t);
          finalizeAndRedirect();
          return prev; // stop advancing active step visuals
        }

        return next;
      });
    }, tickMs);

    // safety
    const safety = setTimeout(() => {
      clearInterval(t);
      finalizeAndRedirect();
    }, 12000);

    return () => {
      clearInterval(t);
      clearTimeout(safety);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Hero copy
  const heroTitle = isFinalizing ? "Finalizing your study guide" : "Creating your study guide";
  const heroSubtitle = isFinalizing
    ? "Almost done — opening your document…"
    : "This usually takes 30–60 seconds";

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10 md:py-14">
      {/* Hero */}
      <div className="mb-10 flex flex-col items-center text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-black">
          {isFinalizing ? <CheckIcon /> : <Spinner size={20} />}
        </div>

        <h1 className="text-3xl font-semibold tracking-tight">{heroTitle}</h1>

        <p className="mt-2 text-sm text-black/50">{heroSubtitle}</p>

        <p className="mt-1 text-sm text-black/40 transition-opacity duration-300">
          {progress}% complete
        </p>
      </div>

      {/* Steps card */}
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-black/10 bg-white p-8 md:p-10">
        <div className="relative">
          {/* Base connector */}
          <div className="absolute left-[16px] top-4 h-[calc(100%-16px)] w-px bg-black/5" />

          {/* Green overlay connector */}
          <div
            className="absolute left-[16px] top-4 w-px bg-green-500/80"
            style={{ height: `${greenHeightPx}px` }}
          />

          <div className="space-y-7">
            {STEPS.map((label, i) => {
              // ✅ when finalizing, everything becomes done (no active spinner step)
              const state: StepState = isFinalizing ? "done" : getState(i);

              return (
                <div key={label} className="relative flex items-start gap-4">
                  <div className="relative z-10 mt-0.5">
                    {state === "done" && (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500 text-white">
                        <CheckIcon />
                      </div>
                    )}

                    {state === "active" && (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black">
                        <Spinner />
                      </div>
                    )}

                    {state === "pending" && (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black/10">
                        <span className="h-1.5 w-1.5 rounded-full bg-black/25" />
                      </div>
                    )}
                  </div>

                  <div className="pt-1">
                    <p
                      className={[
                        "text-sm",
                        state === "active"
                          ? "font-semibold text-black"
                          : state === "done"
                          ? "text-black/50"
                          : "text-black/35",
                      ].join(" ")}
                    >
                      {label}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Skeleton preview */}
      <div className="mx-auto mt-8 w-full max-w-3xl rounded-2xl border border-black/10 bg-white p-7 md:p-10">
        <div className="space-y-4">
          <div className="h-4 w-48 animate-pulse rounded-full bg-black/5" />
          <div className="h-4 w-full animate-pulse rounded-full bg-black/5" />
          <div className="h-4 w-5/6 animate-pulse rounded-full bg-black/5" />
          <div className="h-4 w-2/3 animate-pulse rounded-full bg-black/5" />
          <div className="mt-6 h-28 w-full animate-pulse rounded-2xl bg-black/5" />
        </div>
      </div>
    </div>
  );
}
