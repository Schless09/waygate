"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

export function CandidateForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/candidates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: form.get("name"), email: form.get("email") }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error ?? "Unable to continue.");
      setLoading(false);
      return;
    }
    router.push("/assessments");
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-5">
      <label className="block">
        <span className="mb-2 block text-sm font-medium">Full name</span>
        <input
          name="name"
          autoComplete="name"
          required
          minLength={2}
          className="field"
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-medium">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="field"
        />
      </label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button
        disabled={loading}
        className="btn-primary w-full"
      >
        {loading ? "Starting…" : <>Continue <ArrowRight className="size-4" /></>}
      </button>
    </form>
  );
}
