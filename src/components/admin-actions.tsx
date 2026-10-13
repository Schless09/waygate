"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function AdminLogin() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: form.get("password") }),
    });
    if (!response.ok) {
      const body = await response.json();
      setError(body.error ?? "Unable to sign in.");
      setBusy(false);
      return;
    }
    router.refresh();
  }
  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <input name="password" type="password" required autoFocus placeholder="Admin password" className="w-full rounded-lg border border-slate-300 px-4 py-3" />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button disabled={busy} className="w-full rounded-lg bg-slate-900 px-5 py-3 font-medium text-white disabled:opacity-50">
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export function RescoreButton({ attemptId }: { attemptId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function rescore() {
    setBusy(true);
    const response = await fetch(`/api/admin/rescore/${attemptId}`, { method: "POST" });
    setBusy(false);
    if (response.ok) router.refresh();
  }
  return (
    <button onClick={rescore} disabled={busy} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">
      {busy ? "Queued…" : "Re-score"}
    </button>
  );
}
