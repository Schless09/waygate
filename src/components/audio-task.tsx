"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
}: {
  clip: ClipSummary;
  initialAttempt: Attempt;
  step: number;
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
  });
  const playStartedRef = useRef<number | null>(null);
  const storageKey = `waygate-transcript-${clip.slug}`;
  const [attempt, setAttempt] = useState(initialAttempt);
  const [transcript, setTranscript] = useState("");
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(clip.duration_seconds);
  const [speed, setSpeed] = useState(1);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        setTranscript(localStorage.getItem(storageKey) ?? "");
      } catch {
        // Storage can be disabled by browser privacy settings.
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [storageKey]);

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
      if (!event.ctrlKey) return;
      if (event.code === "Space") {
        event.preventDefault();
        togglePlay();
      } else if (event.code === "ArrowLeft") {
        event.preventDefault();
        seekBy(-5);
      } else if (event.key.toLowerCase() === "t") {
        event.preventDefault();
        insertTimestamp();
      }
    };
    window.addEventListener("keydown", hotkeys);
    return () => window.removeEventListener("keydown", hotkeys);
  }, [insertTimestamp, seekBy, togglePlay]);

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
    if (!window.confirm("Submit this transcript? You will not be able to edit it afterward.")) return;
    flushPlayTime();
    setBusy(true);
    setError("");
    const response = await fetch(`/api/clips/${clip.slug}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        transcript,
        telemetry: {
          ...telemetryRef.current,
          totalPlayTime: Math.round(telemetryRef.current.totalPlayTime * 10) / 10,
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
    router.push(body.complete ? "/done" : "/task/clip-2");
    router.refresh();
  }

  if (!attempt) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-semibold">{clip.title}</h1>
        <p className="mt-3 text-slate-600">Your server-timed attempt begins when you click start.</p>
        {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
        <button onClick={start} disabled={busy} className="mt-7 rounded-lg bg-slate-900 px-6 py-3 font-medium text-white disabled:opacity-50">
          {busy ? "Starting…" : `Start Clip ${step}`}
        </button>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">Clip {step} of 2</p>
          <h1 className="mt-1 text-2xl font-semibold">{clip.title}</h1>
        </div>
        <div className="rounded-lg bg-slate-100 px-4 py-2 text-right font-mono text-sm">
          <span className="block text-[10px] uppercase tracking-wider text-slate-500">Elapsed</span>
          {formatTime(elapsed)}
        </div>
      </div>

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
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => seekBy(-5)} className="control-button" aria-label="Skip back 5 seconds">−5s</button>
          <button onClick={togglePlay} className="min-w-24 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">
            {playing ? "Pause" : "Play"}
          </button>
          <button onClick={() => seekBy(5)} className="control-button" aria-label="Skip forward 5 seconds">+5s</button>
          <span className="font-mono text-sm text-slate-600">{formatTime(currentTime)} / {formatTime(duration)}</span>
          <select
            aria-label="Playback speed"
            value={speed}
            onChange={(event) => {
              const value = Number(event.target.value);
              setSpeed(value);
              if (audioRef.current) audioRef.current.playbackRate = value;
              if (!telemetryRef.current.playbackSpeeds.includes(value)) telemetryRef.current.playbackSpeeds.push(value);
            }}
            className="ml-auto rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {[0.75, 1, 1.25, 1.5].map((value) => <option key={value} value={value}>{value}x</option>)}
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
          className="mt-4 w-full accent-slate-900"
        />
      </div>

      <div className="mt-5">
        <div className="mb-2 flex flex-wrap justify-between gap-2 text-xs text-slate-500">
          <span>One speaker turn per line</span>
          <span>Ctrl+Space play · Ctrl+← back · Ctrl+T timestamp</span>
        </div>
        <textarea
          ref={textareaRef}
          value={transcript}
          onChange={(event) => setTranscript(event.target.value)}
          spellCheck={false}
          placeholder="[00:00] Speaker A: Begin typing here…"
          className="h-[420px] w-full resize-y rounded-xl border border-slate-300 bg-white p-5 font-mono text-sm leading-6 outline-none focus:border-slate-700"
        />
        <p className="mt-2 text-xs text-slate-500">Saved locally every 5 seconds.</p>
      </div>
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      <button onClick={submit} disabled={busy} className="mt-6 w-full rounded-lg bg-slate-900 px-5 py-3 font-medium text-white disabled:opacity-50">
        {busy ? "Submitting…" : "Submit transcript"}
      </button>
    </section>
  );
}
