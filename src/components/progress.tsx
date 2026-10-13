const steps = ["Info", "Clip 1", "Clip 2", "Done"];

export function Progress({ current }: { current: number }) {
  return (
    <nav aria-label="Assessment progress" className="mb-10">
      <ol className="flex items-center gap-2 text-xs sm:gap-4 sm:text-sm">
        {steps.map((step, index) => (
          <li key={step} className="flex flex-1 items-center gap-2">
            <span
              className={`grid size-7 shrink-0 place-items-center rounded-full border ${
                index <= current
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 text-slate-500"
              }`}
            >
              {index + 1}
            </span>
            <span className={index <= current ? "text-slate-900" : "text-slate-400"}>
              {step}
            </span>
            {index < steps.length - 1 && <span className="ml-auto h-px flex-1 bg-slate-200" />}
          </li>
        ))}
      </ol>
    </nav>
  );
}
