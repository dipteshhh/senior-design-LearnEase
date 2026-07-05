"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, RotateCw } from "lucide-react";

const SPEED_OPTIONS = [
  { label: "0.75x", value: 0.75 },
  { label: "1x", value: 1 },
  { label: "1.25x", value: 1.25 },
  { label: "1.5x", value: 1.5 },
] as const;

const SKIP_SECONDS = 15;
const ESTIMATED_WORDS_PER_MINUTE = 165;

type NarrationRate = (typeof SPEED_OPTIONS)[number]["value"];
type NarrationStatus = "checking" | "unsupported" | "stopped" | "narrating" | "paused";
type NarrationWord = {
  start: number;
  end: number;
};

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

function getReadableOffset(text: string, offset: number): number {
  const clampedOffset = Math.min(Math.max(Math.floor(offset), 0), text.length);
  const nextReadableIndex = text.slice(clampedOffset).search(/\S/);
  if (nextReadableIndex === -1) {
    return text.length;
  }

  return clampedOffset + nextReadableIndex;
}

function getNarrationWords(text: string): NarrationWord[] {
  return Array.from(text.matchAll(/\S+/g), (match) => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
}

function getEstimatedDurationSeconds(text: string): number {
  const words = getNarrationWords(text).length;
  if (words === 0) return 0;

  return Math.max(1, Math.ceil((words / ESTIMATED_WORDS_PER_MINUTE) * 60));
}

function getEstimatedElapsedSeconds(text: string, offset: number): number {
  const words = getNarrationWords(text);
  if (words.length === 0) return 0;
  if (offset >= text.length) return getEstimatedDurationSeconds(text);

  const spokenWords = words.filter((word) => word.start < offset).length;
  return Math.min(
    getEstimatedDurationSeconds(text),
    Math.round((spokenWords / ESTIMATED_WORDS_PER_MINUTE) * 60)
  );
}

function formatNarrationTime(seconds: number): string {
  const clampedSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(clampedSeconds / 60);
  const remainingSeconds = clampedSeconds % 60;

  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function getOffsetForTimeSkip(text: string, offset: number, seconds: number): number {
  const words = getNarrationWords(text);
  if (words.length === 0) return 0;

  const foundCurrentWordIndex = words.findIndex((word) => word.end > offset);
  const currentWordIndex =
    foundCurrentWordIndex === -1 ? words.length - 1 : foundCurrentWordIndex;
  const wordsToMove = Math.max(
    1,
    Math.round((Math.abs(seconds) / 60) * ESTIMATED_WORDS_PER_MINUTE)
  );

  if (seconds > 0 && currentWordIndex + wordsToMove >= words.length) {
    return text.length;
  }

  const nextWordIndex =
    seconds < 0 ? Math.max(0, currentWordIndex - wordsToMove) : currentWordIndex + wordsToMove;

  return getReadableOffset(text, words[nextWordIndex]?.start ?? 0);
}

function getOffsetForElapsedSeconds(text: string, seconds: number): number {
  const words = getNarrationWords(text);
  if (words.length === 0 || seconds <= 0) return 0;

  const durationSeconds = getEstimatedDurationSeconds(text);
  if (seconds >= durationSeconds) return text.length;

  const targetWordIndex = Math.min(
    words.length - 1,
    Math.max(0, Math.round((seconds / 60) * ESTIMATED_WORDS_PER_MINUTE))
  );

  return getReadableOffset(text, words[targetWordIndex]?.start ?? 0);
}

export function StudyBriefNarrationControls({
  narrationText,
}: {
  narrationText: string;
}) {
  const [status, setStatus] = useState<NarrationStatus>("checking");
  const [rate, setRate] = useState<NarrationRate>(1);
  const [playbackOffset, setPlaybackOffset] = useState(0);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const narrationOffsetRef = useRef(0);
  const isScrubbingRef = useRef(false);
  const scrubSecondsRef = useRef(0);
  const shouldResumeAfterScrubRef = useRef(false);
  const text = narrationText.trim();
  const estimatedDurationSeconds = getEstimatedDurationSeconds(text);
  const estimatedElapsedSeconds = getEstimatedElapsedSeconds(text, playbackOffset);
  const hasNarrationText = text.length > 0;
  const isSupported = status !== "checking" && status !== "unsupported";
  const canStart = isSupported && hasNarrationText;
  const isNarrating = status === "narrating";
  const isPaused = status === "paused";
  const canSeek = canStart;
  const canSeekBackward = canSeek && playbackOffset > 0;
  const canSeekForward = canSeek && playbackOffset < text.length;

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setStatus(canUseSpeechSynthesis() ? "stopped" : "unsupported");
    }, 0);

    return () => window.clearTimeout(timerId);
  }, []);

  useEffect(() => {
    narrationOffsetRef.current = 0;
    scrubSecondsRef.current = 0;
    const timerId = window.setTimeout(() => setPlaybackOffset(0), 0);

    return () => {
      window.clearTimeout(timerId);
      getSpeechSynthesis()?.cancel();
      utteranceRef.current = null;
      narrationOffsetRef.current = 0;
      scrubSecondsRef.current = 0;
    };
  }, [text]);

  function stopCurrentNarration() {
    getSpeechSynthesis()?.cancel();
    utteranceRef.current = null;
    narrationOffsetRef.current = 0;
    scrubSecondsRef.current = 0;
    setPlaybackOffset(0);
    setStatus((current) =>
      current === "checking" || current === "unsupported" ? current : "stopped"
    );
  }

  function startNarration(nextRate: NarrationRate, offset: number) {
    if (!canStart || typeof window === "undefined") return;

    const speechSynthesis = getSpeechSynthesis();
    if (!speechSynthesis) return;

    const startOffset = getReadableOffset(text, offset);
    if (startOffset >= text.length) {
      stopCurrentNarration();
      return;
    }

    const utteranceText = text.slice(startOffset);
    utteranceRef.current = null;
    speechSynthesis.cancel();

    const utterance = new window.SpeechSynthesisUtterance(utteranceText);
    utterance.rate = nextRate;
    utterance.onstart = () => setStatus("narrating");
    utterance.onboundary = (event) => {
      if (utteranceRef.current !== utterance || typeof event.charIndex !== "number") {
        return;
      }

      const nextOffset = getReadableOffset(text, startOffset + event.charIndex);
      narrationOffsetRef.current = nextOffset;
      setPlaybackOffset(nextOffset);
    };
    utterance.onend = () => {
      if (utteranceRef.current === utterance) {
        utteranceRef.current = null;
        narrationOffsetRef.current = 0;
        setPlaybackOffset(0);
        setStatus("stopped");
      }
    };
    utterance.onerror = () => {
      if (utteranceRef.current === utterance) {
        utteranceRef.current = null;
        narrationOffsetRef.current = 0;
        setPlaybackOffset(0);
        setStatus("stopped");
      }
    };

    utteranceRef.current = utterance;
    narrationOffsetRef.current = startOffset;
    setPlaybackOffset(startOffset);
    setStatus("narrating");
    speechSynthesis.speak(utterance);
  }

  function handlePlay() {
    startNarration(rate, playbackOffset);
  }

  function handlePause() {
    if (status !== "narrating") return;

    getSpeechSynthesis()?.pause();
    setStatus("paused");
  }

  function handleResume() {
    if (status !== "paused") return;

    if (utteranceRef.current) {
      getSpeechSynthesis()?.resume();
    } else {
      startNarration(rate, narrationOffsetRef.current);
    }
    setStatus("narrating");
  }

  function handlePlayPauseToggle() {
    if (isNarrating) {
      handlePause();
      return;
    }

    if (isPaused) {
      handleResume();
      return;
    }

    handlePlay();
  }

  function handleRateChange(nextRate: NarrationRate) {
    setRate(nextRate);

    if (status === "narrating") {
      startNarration(nextRate, narrationOffsetRef.current);
      return;
    }

    if (status === "paused") {
      utteranceRef.current = null;
      getSpeechSynthesis()?.cancel();
    }
  }

  function handleSeek(seconds: number) {
    if (!canSeek) return;

    const nextOffset = getOffsetForTimeSkip(text, narrationOffsetRef.current, seconds);
    if (seconds > 0 && nextOffset >= text.length - 1) {
      stopCurrentNarration();
      return;
    }

    narrationOffsetRef.current = nextOffset;
    setPlaybackOffset(nextOffset);

    if (status === "narrating") {
      startNarration(rate, nextOffset);
      return;
    }

    if (status === "paused") {
      utteranceRef.current = null;
      getSpeechSynthesis()?.cancel();
    }
  }

  function previewScrub(seconds: number): number {
    scrubSecondsRef.current = seconds;
    const nextOffset = getOffsetForElapsedSeconds(text, seconds);
    narrationOffsetRef.current = nextOffset;
    setPlaybackOffset(nextOffset);
    return nextOffset;
  }

  function commitScrub(seconds: number, shouldResume: boolean) {
    if (!canSeek) return;

    const nextOffset = previewScrub(seconds);
    if (nextOffset >= text.length) {
      stopCurrentNarration();
      return;
    }

    if (shouldResume) {
      startNarration(rate, nextOffset);
      return;
    }

    if (status === "paused") {
      utteranceRef.current = null;
      getSpeechSynthesis()?.cancel();
    }
  }

  function handleScrubStart() {
    isScrubbingRef.current = true;
    shouldResumeAfterScrubRef.current = status === "narrating";

    if (status === "narrating" || status === "paused") {
      utteranceRef.current = null;
      getSpeechSynthesis()?.cancel();
      if (status === "narrating") {
        setStatus("paused");
      }
    }
  }

  function handleScrubChange(seconds: number) {
    previewScrub(seconds);

    if (!isScrubbingRef.current) {
      commitScrub(seconds, status === "narrating");
    }
  }

  function handleScrubEnd() {
    if (!isScrubbingRef.current) return;

    isScrubbingRef.current = false;
    const shouldResume = shouldResumeAfterScrubRef.current;
    shouldResumeAfterScrubRef.current = false;
    commitScrub(scrubSecondsRef.current, shouldResume);
  }

  return (
    <div className="mt-5 rounded-full border border-gray-200 bg-white px-3 py-2 shadow-sm">
      <p role="status" aria-live="polite" className="sr-only">
        {getStatusText(status, hasNarrationText)}
      </p>

      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:flex-nowrap">
        <button
          type="button"
          onClick={() => handleSeek(-SKIP_SECONDS)}
          disabled={!canSeekBackward}
          aria-label="Skip back 15 seconds"
          title="Back 15 seconds"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-950 disabled:cursor-not-allowed disabled:opacity-35"
        >
          <span className="relative inline-flex h-7 w-7 items-center justify-center">
            <RotateCcw aria-hidden="true" className="h-6 w-6" strokeWidth={2.25} />
            <span className="absolute mt-1 text-[8px] font-bold leading-none">15</span>
          </span>
        </button>
        <button
          type="button"
          onClick={handlePlayPauseToggle}
          disabled={!canStart}
          aria-label={isNarrating ? "Pause Study Brief audio" : "Play Study Brief audio"}
          title={isNarrating ? "Pause" : "Play"}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#6f63ff] text-white shadow-[0_8px_18px_rgba(111,99,255,0.28)] transition hover:scale-[1.03] hover:bg-[#5f52ea] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isNarrating ? (
            <Pause aria-hidden="true" className="h-5 w-5 fill-current" strokeWidth={2.75} />
          ) : (
            <Play
              aria-hidden="true"
              className="ml-0.5 h-5 w-5 fill-current"
              strokeWidth={2.75}
            />
          )}
        </button>
        <button
          type="button"
          onClick={() => handleSeek(SKIP_SECONDS)}
          disabled={!canSeekForward}
          aria-label="Skip forward 15 seconds"
          title="Forward 15 seconds"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-950 disabled:cursor-not-allowed disabled:opacity-35"
        >
          <span className="relative inline-flex h-7 w-7 items-center justify-center">
            <RotateCw aria-hidden="true" className="h-6 w-6" strokeWidth={2.25} />
            <span className="absolute mt-1 text-[8px] font-bold leading-none">15</span>
          </span>
        </button>

        <div className="flex min-w-[220px] flex-1 items-center gap-2">
          <input
            type="range"
            min={0}
            max={Math.max(estimatedDurationSeconds, 0)}
            step={1}
            value={estimatedElapsedSeconds}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              handleScrubStart();
            }}
            onPointerUp={handleScrubEnd}
            onPointerCancel={handleScrubEnd}
            onBlur={handleScrubEnd}
            onChange={(event) => handleScrubChange(Number(event.target.value))}
            disabled={!canSeek}
            aria-label="Study Brief audio progress"
            title="Drag to seek"
            className="h-2 min-w-[80px] flex-1 cursor-pointer accent-[#6f63ff] disabled:cursor-not-allowed disabled:opacity-50"
            style={{ accentColor: "#6f63ff" }}
          />
          <span className="whitespace-nowrap text-xs font-semibold tabular-nums text-gray-950">
            {formatNarrationTime(estimatedElapsedSeconds)} /{" "}
            {formatNarrationTime(estimatedDurationSeconds)}
          </span>
          <select
            id="study-brief-narration-speed"
            value={rate}
            onChange={(event) =>
              handleRateChange(Number(event.target.value) as NarrationRate)
            }
            disabled={!isSupported}
            aria-label="Narration speed"
            title="Speed"
            className="h-8 shrink-0 rounded-full border border-gray-200 bg-gray-50 px-2 text-xs font-semibold text-gray-950 outline-none transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
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
