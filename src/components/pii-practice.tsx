"use client";

import { CheckCircle2, RotateCcw, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { PiiTagger } from "@/components/pii-tagger";
import { parsePiiSource, PII_PRACTICE_SOURCE, PII_RULES, piiCategory, scorePii, type PiiResult, type PiiSpan } from "@/lib/pii";

const STATUS_LABELS = {
  found: "Found",
  wrong_category: "Wrong category",
  partial: "Partly tagged",
  missed: "Missed",
} as const;

export function PiiPractice() {
  const { document, entities } = useMemo(() => parsePiiSource(PII_PRACTICE_SOURCE), []);
  const [tags, setTags] = useState<PiiSpan[]>([]);
  const [result, setResult] = useState<PiiResult | null>(null);

  return (
    <section className="card mt-6 p-8">
      <div className="flex items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
          <ShieldCheck className="size-5" />
        </span>
        <div>
          <p className="eyebrow">Practice · PII redaction</p>
          <h2 className="mt-1 text-xl font-medium tracking-tight">Try the PII tagging tool</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            The scored assessment ends with a PII task. Tag every piece of personal information in this short example, then check your answers. Nothing here is saved or scored.
          </p>
        </div>
      </div>
      <ul className="mt-5 space-y-1.5 rounded-xl bg-brand-50/60 p-4 text-sm text-slate-600 ring-1 ring-brand-100">
        {PII_RULES.map((rule) => (
          <li key={rule} className="flex gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-500" /> {rule}
          </li>
        ))}
      </ul>
      <div className="mt-5">
        <PiiTagger
          document={document}
          tags={tags}
          onChange={setTags}
          review={result?.entities}
          disabled={Boolean(result)}
        />
      </div>
      {result ? (
        <div className="mt-5 rounded-xl p-5 ring-1 ring-brand-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-medium">
              You caught {result.entities.filter((entity) => entity.status === "found").length} of {result.entities.length} items correctly
              {result.falsePositives.length > 0 && `, with ${result.falsePositives.length} extra tag${result.falsePositives.length === 1 ? "" : "s"}`}.
            </p>
            <button
              onClick={() => {
                setResult(null);
                setTags([]);
              }}
              className="btn-secondary"
            >
              <RotateCcw className="size-4" /> Try again
            </button>
          </div>
          <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            {result.entities.map((entity) => (
              <li key={`${entity.start}-${entity.end}`} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                <span>
                  <span className="font-medium">{entity.text}</span>
                  <span className="ml-2 text-slate-500">{piiCategory(entity.category)?.label}</span>
                </span>
                <span className={`shrink-0 text-xs font-semibold ${entity.status === "found" ? "text-brand-700" : "text-red-700"}`}>
                  {STATUS_LABELS[entity.status]}
                </span>
              </li>
            ))}
          </ul>
          {result.falsePositives.length > 0 && (
            <p className="mt-3 text-sm text-red-700">Not PII, shouldn&apos;t be tagged: {result.falsePositives.map((text) => `“${text}”`).join(", ")}</p>
          )}
          <p className="mt-3 text-xs text-slate-500">Dashed red outlines mark PII you missed or only partly tagged; struck-through words were tagged but aren&apos;t PII.</p>
        </div>
      ) : (
        <div className="mt-5 flex justify-end">
          <button onClick={() => setResult(scorePii(document, entities, tags))} className="btn-primary">
            <CheckCircle2 className="size-4" /> Check my tags
          </button>
        </div>
      )}
    </section>
  );
}
