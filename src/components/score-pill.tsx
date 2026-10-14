export function ScorePill({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <span className="text-slate-400">—</span>;
  const tone =
    value >= 75
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : value >= 50
        ? "bg-amber-50 text-amber-700 ring-amber-200"
        : "bg-rose-50 text-rose-700 ring-rose-200";
  return (
    <span className={`inline-flex min-w-12 justify-center rounded-full px-2.5 py-0.5 text-sm font-semibold tabular-nums ring-1 ${tone}`}>
      {value.toFixed(1)}
    </span>
  );
}
