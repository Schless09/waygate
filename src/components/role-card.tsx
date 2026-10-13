"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RoleCard({
  role,
  title,
  description,
  status,
}: {
  role: "annotator" | "qa";
  title: string;
  description: string;
  status: "not started" | "in progress" | "completed";
}) {
  const router = useRouter();
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
    <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">{title}</h2>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium capitalize text-slate-600">
          {status}
        </span>
      </div>
      <p className="mt-3 leading-6 text-slate-600">{description}</p>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      <button
        onClick={begin}
        disabled={busy || status === "completed"}
        className="mt-6 w-full rounded-lg bg-slate-900 px-4 py-3 font-medium text-white disabled:bg-slate-300"
      >
        {status === "completed" ? "Completed" : busy ? "Opening…" : status === "in progress" ? "Continue" : "Start assessment"}
      </button>
    </article>
  );
}
