import { Check } from "lucide-react";

const steps = ["Info", "Clip 1", "Clip 2", "Clip 3", "Done"];

export function Progress({ current }: { current: number }) {
  return (
    <nav aria-label="Assessment progress" className="mb-10">
      <ol className="flex items-center gap-2">
        {steps.map((step, index) => {
          const done = index < current;
          const active = index === current;
          return (
            <li key={step} className="flex flex-1 flex-col gap-2">
              <span
                className={`h-1.5 rounded-full transition-colors ${done ? "bg-brand-600" : active ? "bg-brand-300" : "bg-brand-100"}`}
              />
              <span
                className={`flex items-center gap-1 text-xs font-medium ${done || active ? "text-brand-700" : "text-slate-400"}`}
                aria-current={active ? "step" : undefined}
              >
                {done && <Check className="size-3.5" strokeWidth={3} />}
                {step}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
