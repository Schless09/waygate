"use client";

import { RotateCcw } from "lucide-react";
import { useState } from "react";

export function RestartButton({ role }: { role: "annotator" | "qa" }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function restart() {
    const confirmed = window.confirm(
      "You can restart this assessment only once.\n\nEverything you've done on the scored clips will be discarded and you'll start again from Clip 1. Your practice round is kept.\n\nRestart now?",
    );
    if (!confirmed) return;
    setBusy(true);
    setError("");
    const response = await fetch("/api/assessments/restart", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setBusy(false);
      setError(body.error ?? "Couldn't restart. Please try again.");
      return;
    }
    try {
      for (const slug of body.slugs ?? []) localStorage.removeItem(`waygate-transcript-${slug}`);
    } catch {
      // Storage can be disabled by browser privacy settings.
    }
    window.location.assign(body.next);
  }

  return (
    <span className="inline-flex flex-col items-center gap-1">
      <button onClick={restart} disabled={busy} className="btn-secondary">
        <RotateCcw className="size-4" /> {busy ? "Restarting…" : "Restart assessment"}
      </button>
      <span className="text-xs text-slate-500">You can restart once.</span>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
