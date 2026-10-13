const SHORTCUTS = [
  { keys: ["Space"], label: "Play / pause" },
  { keys: ["B"], label: "Back 5 seconds", alt: "←" },
  { keys: ["T"], label: "Insert timestamp" },
];

export function Shortcuts({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {SHORTCUTS.map((shortcut) => (
          <span key={shortcut.label} className="inline-flex items-center gap-1">
            <kbd>Ctrl/⌘</kbd><kbd>{shortcut.keys[0]}</kbd>
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
            <kbd>Ctrl/⌘</kbd>+<kbd>{shortcut.keys[0]}</kbd>
            {shortcut.alt && <><span className="text-slate-400">or</span><kbd>{shortcut.alt}</kbd></>}
          </dt>
          <dd>{shortcut.label}</dd>
        </div>
      ))}
    </dl>
  );
}
