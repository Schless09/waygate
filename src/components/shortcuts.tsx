const MOD = "Ctrl/⌘";
const ALT = "Alt/⌥";

const SHORTCUTS = [
  { keys: [MOD, "Space"], label: "Play / pause" },
  { keys: [MOD, "B"], alt: "←", label: "Back 5 seconds" },
  { keys: [MOD, "T"], label: "Insert timestamp" },
  { keys: [ALT, "1–4"], label: "New turn for Speaker A–D" },
  { keys: [ALT, "I"], label: "Insert [inaudible]" },
  { keys: [ALT, "C"], label: "Insert [crosstalk]" },
];

export function Shortcuts({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {SHORTCUTS.map((shortcut) => (
          <span key={shortcut.label} className="inline-flex items-center gap-1">
            {shortcut.keys.map((key) => <kbd key={key}>{key}</kbd>)}
            <span className="ml-0.5">{shortcut.label}</span>
          </span>
        ))}
      </span>
    );
  }
  return (
    <dl className="grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-3 text-sm text-slate-700">
      {SHORTCUTS.map((shortcut) => (
        <div key={shortcut.label} className="contents">
          <dt className="flex items-center gap-1">
            <kbd>{shortcut.keys[0]}</kbd>+<kbd>{shortcut.keys[1]}</kbd>
            {shortcut.alt && <><span className="text-slate-400">or</span><kbd>{shortcut.alt}</kbd></>}
          </dt>
          <dd>{shortcut.label}</dd>
        </div>
      ))}
    </dl>
  );
}
