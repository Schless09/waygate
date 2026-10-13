"use client";

import { ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PiiTagger } from "@/components/pii-tagger";
import { PII_RULES, type PiiDocument, type PiiSpan } from "@/lib/pii";
import { quizStorageKey } from "@/lib/quiz";

type Attempt = { id: string; started_at: string; submitted_at: string | null } | null;

const formatTime = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

export function PiiTask({
  slug,
  title,
  label,
  document,
  initialAttempt,
}: {
  slug: string;
  title: string;
  label: string;
  document: PiiDocument;
  initialAttempt: Attempt;
}) {
  const router = useRouter();
  const storageKey = `waygate-transcript-${slug}`;
  const [attempt, setAttempt] = useState<Attempt>(initialAttempt);
  const [tags, setTags] = useState<PiiSpan[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const blurCount = useRef(0);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
        if (Array.isArray(saved)) setTags(saved);
      } catch {
        // Storage can be disabled by browser privacy settings.
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [storageKey]);

  function updateTags(next: PiiSpan[]) {
    setTags(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // The task remains usable when storage is unavailable.
    }
  }

  useEffect(() => {
    const onBlur = () => {
      blurCount.current += 1;
    };
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, []);

  useEffect(() => {
    if (!attempt?.started_at) return;
    const update = () => setElapsed(Math.max(0, Math.floor((Date.now() - Date.parse(attempt.started_at)) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [attempt?.started_at]);

  async function start() {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/clips/${slug}/start`, { method: "POST" });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(body.error ?? "Unable to start.");
      return;
    }
    setAttempt(body);
  }

  async function submit() {
    const message = tags.length
      ? `Submit ${tags.length} tag${tags.length === 1 ? "" : "s"}? You won't be able to change them afterward.`
      : "You haven't tagged anything. Submit anyway?";
    if (!window.confirm(message)) return;
    setBusy(true);
    setError("");
    let quizAnswers: number[] | undefined;
    try {
      quizAnswers = JSON.parse(localStorage.getItem(quizStorageKey("annotator")) ?? "null") ?? undefined;
    } catch {}
    const response = await fetch(`/api/clips/${slug}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        piiTags: tags,
        telemetry: {
          totalPlayTime: 0,
          seekCount: 0,
          rewindCount: 0,
          playbackSpeeds: [],
          blurCount: blurCount.current,
          pasteCount: 0,
          pastedChars: 0,
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
    router.push(body.complete ? "/done?role=annotator" : `/task/${body.nextSlug}`);
    router.refresh();
  }

  const rules = (
    <ul className="space-y-1.5 text-sm text-slate-600">
      {PII_RULES.map((rule) => (
        <li key={rule} className="flex gap-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-500" /> {rule}
        </li>
      ))}
    </ul>
  );

  if (!attempt) {
    return (
      <section className="card p-10">
        <div className="text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
            <ShieldCheck className="size-7" />
          </span>
          <p className="eyebrow mt-5">{label}</p>
          <h1 className="mt-2 text-2xl font-medium tracking-tight">{title}</h1>
          <p className="mx-auto mt-3 max-w-lg text-slate-600">
            You&apos;ll get a short customer-call transcript. Tag every piece of personal information so it can be redacted. Missing PII is the most serious error, so be thorough.
          </p>
        </div>
        <div className="mx-auto mt-6 max-w-lg rounded-xl bg-brand-50/60 p-5 ring-1 ring-brand-100">{rules}</div>
        {error && <p className="mt-4 text-center text-sm text-red-700">{error}</p>}
        <div className="mt-7 text-center">
          <button onClick={start} disabled={busy} className="btn-primary px-7">
            {busy ? "Starting…" : "Start PII task"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">{label}</p>
          <h1 className="mt-1 text-2xl font-medium tracking-tight">{title}</h1>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 ring-1 ring-brand-100">
          <span className="text-right">
            <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">Elapsed</span>
            <span className="font-mono text-sm tabular-nums">{formatTime(elapsed)}</span>
          </span>
        </div>
      </div>
      <details className="mb-4 rounded-xl bg-white p-4 ring-1 ring-brand-100">
        <summary className="cursor-pointer text-sm font-medium text-brand-700">What to tag</summary>
        <div className="mt-3">{rules}</div>
      </details>
      <PiiTagger document={document} tags={tags} onChange={updateTags} />
      {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
      <div className="mt-6 flex items-center justify-between gap-4">
        <p className="text-sm text-slate-500">{tags.length} tagged</p>
        <button onClick={submit} disabled={busy} className="btn-primary px-7">
          {busy ? "Submitting…" : "Submit PII task"}
        </button>
      </div>
    </section>
  );
}
