"use client";

import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AudioLines, BookOpen, CloudCheck, Pause, Play, RotateCcw, RotateCw, Send, X } from "lucide-react";
import { CrosstalkExample } from "@/components/crosstalk-example";
import { Shortcuts } from "@/components/shortcuts";
import { REAL_CLIP_COUNT } from "@/lib/practice";
import { quizStorageKey } from "@/lib/quiz";
import type { ClipSummary, Telemetry, TranscriptSnapshot } from "@/lib/types";

type Attempt = { id: string; started_at: string; submitted_at: string | null } | null;

const formatTime = (seconds: number) => {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return `${Math.floor(safe / 60).toString().padStart(2, "0")}:${Math.floor(safe % 60)
    .toString()
    .padStart(2, "0")}`;
};

const heardRanges = (seconds: Set<number>) => {
  const ranges: [number, number][] = [];
  for (const second of [...seconds].sort((a, b) => a - b)) {
    const last = ranges.at(-1);
    if (last && second <= last[1] + 1) last[1] = second;
    else ranges.push([second, second]);
  }
  return ranges;
};

export function AudioTask({
  clip,
  initialAttempt,
  step,
  practice = false,
  mode,
  initialTranscript,
}: {
  clip: ClipSummary;
  initialAttempt: Attempt;
  step: number;
  practice?: boolean;
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
    pauseCount: 0,
    longestPlayRun: 0,
    keystrokes: 0,
    largeInserts: 0,
    largeInsertChars: 0,
  });
  const playStartedRef = useRef<number | null>(null);
  const playRunStartedRef = useRef<number | null>(null);
  const heardRef = useRef(new Set<number>());
  const snapshotsRef = useRef<TranscriptSnapshot[]>([]);
  const transcriptRef = useRef(initialTranscript);
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

  // Telemetry lives in memory, so it is mirrored to storage to survive reloads;
  // otherwise a restored draft looks like text that was never typed or heard.
  const telemetryKey = attempt?.started_at ? `waygate-telemetry-${clip.slug}-${attempt.started_at}` : null;
  const restoredTelemetryRef = useRef(false);
  const saveTelemetry = useCallback(() => {
    if (!telemetryKey || !restoredTelemetryRef.current) return;
    const playing = playStartedRef.current !== null ? (performance.now() - playStartedRef.current) / 1000 : 0;
    try {
      localStorage.setItem(
        telemetryKey,
        JSON.stringify({
          telemetry: { ...telemetryRef.current, totalPlayTime: telemetryRef.current.totalPlayTime + playing },
          heard: [...heardRef.current],
          snapshots: snapshotsRef.current,
        }),
      );
    } catch {}
  }, [telemetryKey]);

  useEffect(() => {
    if (!telemetryKey || restoredTelemetryRef.current) return;
    restoredTelemetryRef.current = true;
    try {
      const saved = JSON.parse(localStorage.getItem(telemetryKey) ?? "null") as {
        telemetry: Telemetry;
        heard: number[];
        snapshots: TranscriptSnapshot[];
      } | null;
      if (saved) {
        telemetryRef.current = { ...saved.telemetry, reloads: (saved.telemetry.reloads ?? 0) + 1 };
        heardRef.current = new Set(saved.heard);
        snapshotsRef.current = saved.snapshots;
      }
    } catch {}
  }, [telemetryKey]);

  useEffect(() => {
    const timer = window.setInterval(saveTelemetry, 5000);
    window.addEventListener("pagehide", saveTelemetry);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", saveTelemetry);
    };
  }, [saveTelemetry]);

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

  const endPlayRun = useCallback((restart: boolean) => {
    const telemetry = telemetryRef.current;
    if (playRunStartedRef.current !== null) {
      const run = (performance.now() - playRunStartedRef.current) / 1000;
      telemetry.longestPlayRun = Math.max(telemetry.longestPlayRun ?? 0, run);
    }
    playRunStartedRef.current = restart ? performance.now() : null;
  }, []);

  const label = practice ? "Practice round · not scored" : `Clip ${step} of ${REAL_CLIP_COUNT}`;
  const startedAt = attempt?.started_at;
  const takeSnapshot = useCallback(() => {
    if (!startedAt) return;
    const snapshots = snapshotsRef.current;
    const tail = transcriptRef.current.slice(-400);
    if (snapshots.length >= 150 || snapshots.at(-1)?.tail === tail) return;
    snapshots.push({
      t: Math.round((Date.now() - Date.parse(startedAt)) / 1000),
      heardTo: Math.max(0, ...heardRef.current),
      tail,
    });
  }, [startedAt]);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    const timer = window.setInterval(takeSnapshot, 20000);
    return () => window.clearInterval(timer);
  }, [takeSnapshot]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const onBeforeInput = (event: InputEvent) => {
      if (event.inputType === "insertFromPaste") return;
      const inserted = event.data ?? event.dataTransfer?.getData("text") ?? "";
      if (inserted.length >= 20) {
        telemetryRef.current.largeInserts = (telemetryRef.current.largeInserts ?? 0) + 1;
        telemetryRef.current.largeInsertChars = (telemetryRef.current.largeInsertChars ?? 0) + inserted.length;
      }
    };
    textarea.addEventListener("beforeinput", onBeforeInput);
    return () => textarea.removeEventListener("beforeinput", onBeforeInput);
  }, [attempt]);

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
    if (!audio.paused) endPlayRun(true);
  }, [clip.duration_seconds, endPlayRun]);

  const insertText = useCallback((text: string, onNewLine = false) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = textarea.value.slice(0, start);
    const insert = onNewLine && before && !before.endsWith("\n") ? `\n${text}` : text;
    telemetryRef.current.keystrokes = (telemetryRef.current.keystrokes ?? 0) + insert.length;
    setTranscript((value) => `${value.slice(0, start)}${insert}${value.slice(end)}`);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + insert.length, start + insert.length);
    });
  }, []);

  const insertTimestamp = useCallback(
    () => insertText(`[${formatTime(audioRef.current?.currentTime ?? 0)}] `),
    [insertText],
  );

  useEffect(() => {
    const hotkeys = (event: KeyboardEvent) => {
      if (event.key === "Escape" && instructionsOpen) {
        setInstructionsOpen(false);
        return;
      }
      if (event.altKey && !event.ctrlKey && !event.metaKey) {
        const speaker = { Digit1: "A", Digit2: "B", Digit3: "C", Digit4: "D" }[event.code];
        const tag = { KeyI: "[inaudible] ", KeyC: "[crosstalk] " }[event.code];
        if (speaker) {
          event.preventDefault();
          insertText(`[${formatTime(audioRef.current?.currentTime ?? 0)}] Speaker ${speaker}: `, true);
        } else if (tag) {
          event.preventDefault();
          insertText(tag);
        }
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
  }, [insertText, insertTimestamp, instructionsOpen, seekBy, togglePlay]);

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
    const confirmation = practice
      ? "Submit your practice transcript and see your feedback?"
      : "Submit this transcript? You will not be able to edit it afterward.";
    if (!window.confirm(confirmation)) return;
    flushPlayTime();
    endPlayRun(!audioRef.current?.paused);
    takeSnapshot();
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
          longestPlayRun: Math.round(telemetryRef.current.longestPlayRun ?? 0),
          heard: heardRanges(heardRef.current),
          snapshots: snapshotsRef.current,
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
      if (telemetryKey) localStorage.removeItem(telemetryKey);
    } catch {}
    router.push(body.practice ? `/practice?role=${mode}` : body.complete ? `/done?role=${mode}` : `/task/${body.nextSlug}`);
    router.refresh();
  }

  if (!attempt) {
    return (
      <section className="card p-10 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
          <AudioLines className="size-7" />
        </span>
        <p className="eyebrow mt-5">{label}</p>
        <h1 className="mt-2 text-2xl font-medium tracking-tight">{clip.title}</h1>
        <p className="mt-3 text-slate-600">
          {practice
            ? "Get comfortable with the player, shortcuts, and format. This round doesn't count toward your result, and you'll see feedback right after you submit."
            : "Your server-timed attempt begins when you click start."}
        </p>
        {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
        <button onClick={start} disabled={busy} className="btn-primary mt-7 px-7">
          {busy ? "Starting…" : <><Play className="size-4 fill-current" /> {practice ? "Start practice" : `Start Clip ${step}`}</>}
        </button>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">{label}</p>
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
              <li>Use <code>[inaudible]</code> for unclear words and <code>[crosstalk]</code> for overlapping speech you can&apos;t make out.</li>
              <li>Place <code>[crosstalk]</code> inline, where the overlap happens. If you can make out the overlapping words, give each speaker their own line instead.</li>
              <li>Use clean verbatim: remove “um” and “uh”, but keep everything else.</li>
              <li>Do not use live captions, speech-to-text, or AI tools.</li>
            </ul>
            <div className="mt-6 rounded-xl bg-[#14122b] p-4 font-mono text-xs leading-6 text-brand-100">
              <p>[00:03] Speaker A: Should we review the launch plan?</p>
              <p>[00:07] Speaker B: Yes, the first item is [inaudible].</p>
            </div>
            <h3 className="mt-7 font-semibold">Using [crosstalk]</h3>
            <div className="mt-3"><CrosstalkExample compact /></div>
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
        onTimeUpdate={(event) => {
          const audio = event.currentTarget;
          setCurrentTime(audio.currentTime);
          if (!audio.paused) heardRef.current.add(Math.floor(audio.currentTime));
        }}
        onPlay={() => {
          setPlaying(true);
          playStartedRef.current = performance.now();
          playRunStartedRef.current = performance.now();
        }}
        onPause={(event) => {
          setPlaying(false);
          flushPlayTime();
          endPlayRun(false);
          if (!event.currentTarget.ended) {
            telemetryRef.current.pauseCount = (telemetryRef.current.pauseCount ?? 0) + 1;
          }
        }}
        onEnded={() => {
          setPlaying(false);
          flushPlayTime();
          endPlayRun(false);
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
            if (audioRef.current && !audioRef.current.paused) endPlayRun(true);
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
          onKeyDown={(event) => {
            if (event.ctrlKey || event.metaKey || event.altKey) return;
            if (event.key.length === 1 || ["Backspace", "Delete", "Enter"].includes(event.key)) {
              telemetryRef.current.keystrokes = (telemetryRef.current.keystrokes ?? 0) + 1;
            }
          }}
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
            List each error you found with its timestamp, what was wrong, and how you fixed it, then any feedback for the annotator.
          </span>
          <textarea
            value={reviewNotes}
            onChange={(event) => setReviewNotes(event.target.value)}
            placeholder={"[00:42] Speaker B line belongs to Speaker C — relabeled.\n[01:10] “um” left in — removed for clean verbatim."}
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
