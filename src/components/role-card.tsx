"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, GraduationCap, Headphones, ShieldCheck } from "lucide-react";

const STATUS_STYLES = {
  "not started": "bg-slate-100 text-slate-600",
  "in progress": "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  completed: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
};

export function RoleCard({
  role,
  title,
  description,
  status,
  extraStep,
}: {
  role: "annotator" | "qa";
  title: string;
  description: string;
  status: "not started" | "in progress" | "completed";
  extraStep?: string;
}) {
  const router = useRouter();
  const Icon = role === "qa" ? ShieldCheck : Headphones;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function begin() {
    if (status === "completed") return;
    setBusy(true);
    const response = await fetch("/api/assessments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error ?? "Unable to open this assessment.");
      setBusy(false);
      return;
    }
    router.push(`/instructions?role=${role}`);
  }

  return (
    <article className="card flex flex-col p-7 transition duration-200 hover:-translate-y-1 hover:shadow-[0_20px_50px_-15px_rgb(91_69_224/0.35)]">
      <div className="flex items-start justify-between gap-4">
        <span className="grid size-12 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
          <Icon className="size-6" />
        </span>
        <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium capitalize ${STATUS_STYLES[status]}`}>
          {status === "completed" && <CheckCircle2 className="size-3.5" />}
          {status}
        </span>
      </div>
      <h2 className="mt-5 text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 flex-1 leading-6 text-slate-600">{description}</p>
      <ol className="mt-5 space-y-2 text-sm">
        <li className="flex items-center gap-2.5">
          <span className="grid size-6 place-items-center rounded-full bg-brand-50 text-brand-600 ring-1 ring-brand-200">
            <GraduationCap className="size-3.5" />
          </span>
          <span className="font-medium text-slate-800">Practice clip</span>
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">Optional · not scored</span>
        </li>
        {[1, 2].map((clip) => (
          <li key={clip} className="flex items-center gap-2.5">
            <span className="grid size-6 place-items-center rounded-full bg-brand-600 text-xs font-semibold text-white">{clip}</span>
            <span className="font-medium text-slate-800">Scored clip {clip}</span>
          </li>
        ))}
        {extraStep && (
          <li className="flex items-center gap-2.5">
            <span className="grid size-6 place-items-center rounded-full bg-brand-600 text-xs font-semibold text-white">3</span>
            <span className="font-medium text-slate-800">{extraStep}</span>
          </li>
        )}
      </ol>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      <button
        onClick={begin}
        disabled={busy || status === "completed"}
        className="btn-primary mt-6 w-full"
      >
        {status === "completed" ? "Completed" : busy ? "Opening…" : <>{status === "in progress" ? "Continue" : "Start assessment"} <ArrowRight className="size-4" /></>}
      </button>
    </article>
  );
}
