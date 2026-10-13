import { Check, X } from "lucide-react";

const EXAMPLES = [
  {
    ok: true,
    title: "Overlap you can't make out: tag it inline, where it happens",
    lines: ["[01:05] Speaker B: The budget should go to marketing [crosstalk] next quarter."],
  },
  {
    ok: true,
    title: "Overlap you can make out: give each speaker their own line",
    lines: ["[01:12] Speaker A: I think we should wait until—", "[01:13] Speaker C: No, we need it now."],
  },
  {
    ok: false,
    title: "Don't put the tag on a line by itself",
    lines: ["[01:05] Speaker B: The budget should go to marketing", "[crosstalk]"],
  },
];

export function CrosstalkExample({ compact = false }: { compact?: boolean }) {
  return (
    <div className="space-y-3">
      {EXAMPLES.map((example) => (
        <div key={example.title}>
          <p className={`flex items-center gap-1.5 font-medium ${compact ? "text-xs" : "text-sm"} ${example.ok ? "text-emerald-700" : "text-rose-700"}`}>
            {example.ok ? <Check className="size-4 shrink-0" /> : <X className="size-4 shrink-0" />}
            {example.title}
          </p>
          <div
            className={`mt-1.5 rounded-xl p-3 font-mono leading-6 ring-1 ${compact ? "text-xs" : "text-sm"} ${example.ok ? "bg-[#14122b] text-brand-100 ring-brand-900" : "bg-rose-50 text-rose-900 ring-rose-200"}`}
          >
            {example.lines.map((line) => <p key={line}>{line}</p>)}
          </div>
        </div>
      ))}
    </div>
  );
}
