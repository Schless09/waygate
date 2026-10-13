"use client";

import { RotateCcw } from "lucide-react";
import { useState } from "react";

export function RestartButton({ role, slug }: { role: "annotator" | "qa"; slug: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function restart() {
    const confirmed = window.confirm(
      "You can restart a clip only once during this assessment.\n\nYour transcript and time on this clip will be discarded and the clip will start fresh. Clips you've already submitted are kept.\n\nRestart this clip?",
    );
    if (!confirmed) return;
    setBusy(true);
    setError("");
    const response = await fetch("/api/assessments/restart", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role, slug }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setBusy(false);
      setError(body.error ?? "Couldn't restart. Please try again.");
      return;
    }
    try {
      localStorage.removeItem(`waygate-transcript-${slug}`);
    } catch {
      // Storage can be disabled by browser privacy settings.
    }
    window.location.assign(body.next);
  }

  return (
    <span className="inline-flex flex-col items-center gap-1">
      <button onClick={restart} disabled={busy} className="btn-secondary">
        <RotateCcw className="size-4" /> {busy ? "Restarting…" : "Restart this clip"}
      </button>
      <span className="text-xs text-slate-500">You can restart one clip, once.</span>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
