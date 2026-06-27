"use client";

import { useEffect, useRef, useState } from "react";

const SPEED_OPTIONS = [
  { label: "0.75x", value: 0.75 },
  { label: "1x", value: 1 },
  { label: "1.25x", value: 1.25 },
  { label: "1.5x", value: 1.5 },
] as const;

type NarrationRate = (typeof SPEED_OPTIONS)[number]["value"];
type NarrationStatus = "checking" | "unsupported" | "stopped" | "narrating" | "paused";

function getSpeechSynthesis(): SpeechSynthesis | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return null;
  }

  return window.speechSynthesis;
}

function canUseSpeechSynthesis(): boolean {
  return (
    getSpeechSynthesis() !== null &&
    typeof window !== "undefined" &&
    typeof window.SpeechSynthesisUtterance === "function"
  );
}

function getStatusText(status: NarrationStatus, hasNarrationText: boolean): string {
  if (status === "checking") return "Checking narration support.";
  if (status === "unsupported") return "Narration is not supported in this browser.";
  if (!hasNarrationText) return "Study Brief narration is unavailable.";
  if (status === "narrating") return "Narrating Study Brief.";
  if (status === "paused") return "Paused.";
  return "Stopped.";
}

export function StudyBriefNarrationControls({
  narrationText,
}: {
  narrationText: string;
}) {
  const [status, setStatus] = useState<NarrationStatus>("checking");
  const [rate, setRate] = useState<NarrationRate>(1);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const text = narrationText.trim();
  const hasNarrationText = text.length > 0;
  const isSupported = status !== "checking" && status !== "unsupported";
  const canStart = isSupported && hasNarrationText;

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setStatus(canUseSpeechSynthesis() ? "stopped" : "unsupported");
    }, 0);

    return () => window.clearTimeout(timerId);
  }, []);

  useEffect(() => {
    return () => {
      getSpeechSynthesis()?.cancel();
      utteranceRef.current = null;
    };
  }, [text]);

  function stopCurrentNarration() {
    getSpeechSynthesis()?.cancel();
    utteranceRef.current = null;
    setStatus((current) =>
      current === "checking" || current === "unsupported" ? current : "stopped"
    );
  }

  function handlePlay() {
    if (!canStart || typeof window === "undefined") return;

    const speechSynthesis = getSpeechSynthesis();
    if (!speechSynthesis) return;

    speechSynthesis.cancel();

    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    utterance.onstart = () => setStatus("narrating");
    utterance.onend = () => {
      if (utteranceRef.current === utterance) {
        utteranceRef.current = null;
        setStatus("stopped");
      }
    };
    utterance.onerror = () => {
      if (utteranceRef.current === utterance) {
        utteranceRef.current = null;
        setStatus("stopped");
      }
    };

    utteranceRef.current = utterance;
    setStatus("narrating");
    speechSynthesis.speak(utterance);
  }

  function handlePause() {
    if (status !== "narrating") return;

    getSpeechSynthesis()?.pause();
    setStatus("paused");
  }

  function handleResume() {
    if (status !== "paused") return;

    getSpeechSynthesis()?.resume();
    setStatus("narrating");
  }

  return (
    <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-950">Listen to Study Brief</p>
          <p
            role="status"
            aria-live="polite"
            className="mt-1 text-sm leading-6 text-gray-500"
          >
            {getStatusText(status, hasNarrationText)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handlePlay}
            disabled={!canStart}
            className="inline-flex min-h-10 items-center justify-center rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Play
          </button>
          <button
            type="button"
            onClick={handlePause}
            disabled={!canStart || status !== "narrating"}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Pause
          </button>
          <button
            type="button"
            onClick={handleResume}
            disabled={!canStart || status !== "paused"}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Resume
          </button>
          <button
            type="button"
            onClick={stopCurrentNarration}
            disabled={!canStart || status === "stopped"}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Stop
          </button>

          <label
            htmlFor="study-brief-narration-speed"
            className="ml-0 text-sm font-medium text-gray-500 sm:ml-2"
          >
            Speed
          </label>
          <select
            id="study-brief-narration-speed"
            value={rate}
            onChange={(event) => setRate(Number(event.target.value) as NarrationRate)}
            disabled={!isSupported}
            aria-label="Narration speed"
            className="min-h-10 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {SPEED_OPTIONS.map((option) => (
              <option key={option.label} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
