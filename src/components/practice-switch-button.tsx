"use client";

import { GraduationCap } from "lucide-react";
import { useState } from "react";

export function PracticeSwitchButton({ role }: { role: "annotator" | "qa" }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function switchToPractice() {
    const confirmed = window.confirm(
      "Go to the practice clip?\n\nAny progress on Clip 1 will be cleared and its timer reset, so you can start it fresh after practice. This doesn't use your restart.",
    );
    if (!confirmed) return;
    setBusy(true);
    setError("");
    const response = await fetch("/api/assessments/switch-to-practice", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setBusy(false);
      setError(body.error ?? "Couldn't open the practice clip. Please try again.");
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
      <button onClick={switchToPractice} disabled={busy} className="btn-secondary">
        <GraduationCap className="size-4" /> {busy ? "Opening…" : "Do the practice clip first"}
      </button>
      <span className="text-xs text-slate-500">Optional and unscored.</span>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
