"use client";

import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AudioLines, BookOpen, CloudCheck, Pause, Play, RotateCcw, RotateCw, Send, X } from "lucide-react";
import { Shortcuts } from "@/components/shortcuts";
import { quizStorageKey } from "@/lib/quiz";
import type { ClipSummary, Telemetry } from "@/lib/types";

type Attempt = { id: string; started_at: string; submitted_at: string | null } | null;

const formatTime = (seconds: number) => {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return `${Math.floor(safe / 60).toString().padStart(2, "0")}:${Math.floor(safe % 60)
    .toString()
    .padStart(2, "0")}`;
};

export function AudioTask({
  clip,
  initialAttempt,
  step,
  mode,
  initialTranscript,
}: {
  clip: ClipSummary;
  initialAttempt: Attempt;
  step: number;
  mode: "annotator" | "qa";
  initialTranscript: string;
}) {
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const telemetryRef = useRef<Telemetry>({
    totalPlayTime: 0,
    seekCount: 0,
    rewindCount: 0,
    playbackSpeeds: [1],
    blurCount: 0,
    pasteCount: 0,
    pastedChars: 0,
  });
  const playStartedRef = useRef<number | null>(null);
  const storageKey = `waygate-transcript-${clip.slug}`;
  const [attempt, setAttempt] = useState(initialAttempt);
  const [transcript, setTranscript] = useState(initialTranscript);
  const [reviewNotes, setReviewNotes] = useState("");
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(clip.duration_seconds);
  const [speed, setSpeed] = useState(1);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        setTranscript(localStorage.getItem(storageKey) ?? initialTranscript);
      } catch {
        // Storage can be disabled by browser privacy settings.
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [initialTranscript, storageKey]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      try {
        localStorage.setItem(storageKey, transcript);
      } catch {
        // The assessment remains usable when storage is unavailable.
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [storageKey, transcript]);

  useEffect(() => {
    const onBlur = () => {
      telemetryRef.current.blurCount += 1;
    };
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, []);

  useEffect(() => {
    if (!attempt?.started_at) return;
    const update = () =>
      setElapsed(Math.max(0, Math.floor((Date.now() - Date.parse(attempt.started_at)) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [attempt?.started_at]);

  const flushPlayTime = useCallback(() => {
    if (playStartedRef.current !== null) {
      telemetryRef.current.totalPlayTime += (performance.now() - playStartedRef.current) / 1000;
      playStartedRef.current = null;
    }
  }, []);

  useEffect(() => () => flushPlayTime(), [flushPlayTime]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }, []);

  const seekBy = useCallback((amount: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration || clip.duration_seconds, audio.currentTime + amount));
    telemetryRef.current.seekCount += 1;
    if (amount < 0) telemetryRef.current.rewindCount += 1;
  }, [clip.duration_seconds]);

  const insertTimestamp = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const timestamp = `[${formatTime(audioRef.current?.currentTime ?? 0)}] `;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    setTranscript((value) => `${value.slice(0, start)}${timestamp}${value.slice(end)}`);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + timestamp.length, start + timestamp.length);
    });
  }, []);

  useEffect(() => {
    const hotkeys = (event: KeyboardEvent) => {
      if (event.key === "Escape" && instructionsOpen) {
        setInstructionsOpen(false);
        return;
      }
      if (!event.ctrlKey && !event.metaKey) return;
      if (event.code === "Space") {
        event.preventDefault();
        togglePlay();
      } else if (event.key === "ArrowLeft" || event.key.toLowerCase() === "b") {
        event.preventDefault();
        seekBy(-5);
      } else if (event.key.toLowerCase() === "t") {
        event.preventDefault();
        insertTimestamp();
      }
    };
    window.addEventListener("keydown", hotkeys, { capture: true });
    return () => window.removeEventListener("keydown", hotkeys, { capture: true });
  }, [insertTimestamp, instructionsOpen, seekBy, togglePlay]);

  async function start() {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/clips/${clip.slug}/start`, { method: "POST" });
    const body = await response.json();
    if (!response.ok) setError(body.error ?? "Unable to start.");
    else setAttempt(body);
    setBusy(false);
  }

  async function submit() {
    if (!transcript.trim()) {
      setError("Enter your transcript before submitting.");
      return;
    }
    if (mode === "qa" && reviewNotes.trim().length < 20) {
      setError("Add reviewer notes describing the important errors you found.");
      return;
    }
    if (!window.confirm("Submit this transcript? You will not be able to edit it afterward.")) return;
    flushPlayTime();
    setBusy(true);
    setError("");
    let quizAnswers: number[] | undefined;
    try {
      quizAnswers = JSON.parse(localStorage.getItem(quizStorageKey(mode)) ?? "null") ?? undefined;
    } catch {}
    const response = await fetch(`/api/clips/${clip.slug}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        transcript,
        reviewNotes: mode === "qa" ? reviewNotes : undefined,
        telemetry: {
          ...telemetryRef.current,
          totalPlayTime: Math.round(telemetryRef.current.totalPlayTime * 10) / 10,
          quizAnswers,
        },
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error ?? "Unable to submit.");
      setBusy(false);
      return;
    }
    try {
      localStorage.removeItem(storageKey);
    } catch {}
    router.push(body.complete ? `/done?role=${mode}` : `/task/${body.nextSlug}`);
    router.refresh();
  }

  if (!attempt) {
    return (
      <section className="card p-10 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
          <AudioLines className="size-7" />
        </span>
        <p className="eyebrow mt-5">Clip {step} of 3</p>
        <h1 className="mt-2 text-2xl font-medium tracking-tight">{clip.title}</h1>
        <p className="mt-3 text-slate-600">Your server-timed attempt begins when you click start.</p>
        {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
        <button onClick={start} disabled={busy} className="btn-primary mt-7 px-7">
          {busy ? "Starting…" : <><Play className="size-4 fill-current" /> Start Clip {step}</>}
        </button>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Clip {step} of 3</p>
          <h1 className="mt-1 text-2xl font-medium tracking-tight">{clip.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInstructionsOpen(true)} className="btn-secondary">
            <BookOpen className="size-4" /> Instructions
          </button>
          <div className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 ring-1 ring-brand-100">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-brand-600" />
            </span>
            <span className="text-right">
              <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">Elapsed</span>
              <span className="font-mono text-sm tabular-nums">{formatTime(elapsed)}</span>
            </span>
          </div>
        </div>
      </div>

      {instructionsOpen && (
        <div className="fixed inset-0 z-50">
          <button
            aria-label="Close instructions"
            className="absolute inset-0 cursor-default bg-[#14122b]/30 backdrop-blur-[2px]"
            onClick={() => setInstructionsOpen(false)}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="instructions-title"
            className="absolute inset-y-0 right-0 w-full max-w-md overflow-y-auto bg-white p-7 shadow-2xl sm:p-9"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">{mode === "qa" ? "QA reviewer" : "Annotator"}</p>
                <h2 id="instructions-title" className="mt-2 text-2xl font-medium tracking-tight">
                  Instructions
                </h2>
              </div>
              <button onClick={() => setInstructionsOpen(false)} className="control-button" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>
            <p className="mt-6 leading-7 text-slate-600">
              {mode === "qa"
                ? "Listen to the clip, correct the provided transcript, and summarize the important errors and their severity in your reviewer notes."
                : "Create an accurate transcript of the clip using the required format below."}
            </p>
            <h3 className="mt-7 font-semibold">Required format</h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700 marker:text-brand-400 [&_code]:rounded [&_code]:bg-brand-50 [&_code]:px-1 [&_code]:text-brand-700">
              <li>Use one speaker turn per line.</li>
              <li>Label speakers A, B, C, D in order of first appearance.</li>
              <li>Use <code>[inaudible]</code> for unclear words and <code>[crosstalk]</code> for overlapping speech.</li>
              <li>Use clean verbatim: remove “um” and “uh”, but keep everything else.</li>
              <li>Do not use live captions, speech-to-text, or AI tools.</li>
            </ul>
            <div className="mt-6 rounded-xl bg-[#14122b] p-4 font-mono text-xs leading-6 text-brand-100">
              <p>[00:03] Speaker A: Should we review the launch plan?</p>
              <p>[00:07] Speaker B: Yes, the first item is [inaudible].</p>
            </div>
            <h3 className="mt-7 font-semibold">Keyboard shortcuts</h3>
            <div className="mt-3"><Shortcuts /></div>
            <p className="mt-8 text-xs leading-5 text-slate-500">
              Opening these instructions does not pause the server-side assessment timer.
            </p>
          </aside>
        </div>
      )}

      <audio
        ref={audioRef}
        src={clip.audioUrl}
        preload="metadata"
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => {
          setPlaying(true);
          playStartedRef.current = performance.now();
        }}
        onPause={() => {
          setPlaying(false);
          flushPlayTime();
        }}
        onEnded={() => {
          setPlaying(false);
          flushPlayTime();
        }}
      />
      <div className="card sticky top-3 z-30 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => seekBy(-5)} className="control-button" aria-label="Skip back 5 seconds" title="Back 5s">
            <RotateCcw className="size-[18px]" />
          </button>
          <button
            onClick={togglePlay}
            aria-label={playing ? "Pause" : "Play"}
            className="grid size-12 place-items-center rounded-full bg-brand-600 text-white shadow-md shadow-brand-600/30 transition hover:bg-brand-700 active:scale-95"
          >
            {playing ? <Pause className="size-5 fill-current" /> : <Play className="ml-0.5 size-5 fill-current" />}
          </button>
          <button onClick={() => seekBy(5)} className="control-button" aria-label="Skip forward 5 seconds" title="Forward 5s">
            <RotateCw className="size-[18px]" />
          </button>
          <span className="ml-1 font-mono text-sm tabular-nums text-slate-600">
            <span className="text-foreground">{formatTime(currentTime)}</span> / {formatTime(duration)}
          </span>
          <select
            aria-label="Playback speed"
            value={speed}
            onChange={(event) => {
              const value = Number(event.target.value);
              setSpeed(value);
              if (audioRef.current) audioRef.current.playbackRate = value;
              if (!telemetryRef.current.playbackSpeeds.includes(value)) telemetryRef.current.playbackSpeeds.push(value);
            }}
            className="ml-auto rounded-full bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 outline-none ring-1 ring-brand-100 focus:ring-brand-300"
          >
            {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((value) => (
              <option key={value} value={value}>{value}x</option>
            ))}
          </select>
        </div>
        <input
          aria-label="Audio position"
          type="range"
          min={0}
          max={duration || clip.duration_seconds}
          step={0.1}
          value={currentTime}
          onChange={(event) => {
            if (audioRef.current) audioRef.current.currentTime = Number(event.target.value);
            telemetryRef.current.seekCount += 1;
          }}
          style={{ "--progress": `${(100 * currentTime) / (duration || clip.duration_seconds)}%` } as CSSProperties}
          className="scrubber mt-4 w-full cursor-pointer"
        />
      </div>

      <div className="mt-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span className="font-medium text-slate-700">{mode === "qa" ? "Correct the provided transcript" : "One speaker turn per line"}</span>
          <Shortcuts compact />
        </div>
        <textarea
          ref={textareaRef}
          value={transcript}
          onChange={(event) => setTranscript(event.target.value)}
          onPaste={(event) => {
            telemetryRef.current.pasteCount += 1;
            telemetryRef.current.pastedChars += event.clipboardData.getData("text").length;
          }}
          spellCheck={false}
          placeholder="[00:00] Speaker A: Begin typing here…"
          className="field h-[420px] resize-y rounded-2xl p-5 font-mono text-sm leading-6 shadow-sm"
        />
        <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
          <CloudCheck className="size-3.5 text-brand-500" /> Saved locally every 5 seconds.
        </p>
      </div>
      {mode === "qa" && (
        <label className="mt-5 block">
          <span className="mb-2 block text-sm font-semibold">Reviewer notes</span>
          <span className="mb-2 block text-xs text-slate-500">
            Summarize the most important errors, their severity, and useful feedback for the annotator.
          </span>
          <textarea
            value={reviewNotes}
            onChange={(event) => setReviewNotes(event.target.value)}
            required
            className="field h-36 resize-y rounded-2xl p-4 text-sm leading-6 shadow-sm"
          />
        </label>
      )}
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      <button onClick={submit} disabled={busy} className="btn-primary mt-6 w-full">
        {busy ? "Submitting…" : <><Send className="size-4" /> Submit transcript</>}
      </button>
    </section>
  );
}
