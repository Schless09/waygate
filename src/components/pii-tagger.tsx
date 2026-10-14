"use client";

import { Eraser, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  PII_CATEGORIES,
  piiCategory,
  tokenText,
  type PiiCategory,
  type PiiDocument,
  type PiiEntityResult,
  type PiiSpan,
} from "@/lib/pii";

type Selection = { start: number; end: number } | null;

const tokenIndex = (node: Node | null) => {
  const element = node instanceof Element ? node : node?.parentElement;
  const value = element?.closest("[data-i]")?.getAttribute("data-i");
  return value === undefined || value === null ? null : Number(value);
};

export function PiiTagger({
  document,
  tags,
  onChange,
  review,
  disabled = false,
}: {
  document: PiiDocument;
  tags: PiiSpan[];
  onChange: (tags: PiiSpan[]) => void;
  review?: PiiEntityResult[];
  disabled?: boolean;
}) {
  const [selection, setSelection] = useState<Selection>(null);
  const anchorRef = useRef<number | null>(null);
  const textRef = useRef<HTMLDivElement>(null);

  const tagFor = (index: number) => tags.find((tag) => index >= tag.start && index <= tag.end);
  const reviewFor = (index: number) => review?.find((entity) => index >= entity.start && index <= entity.end);

  const apply = useCallback(
    (category: PiiCategory) => {
      if (!selection) return;
      const kept = tags.filter((tag) => tag.end < selection.start || tag.start > selection.end);
      onChange([...kept, { ...selection, category }].sort((a, b) => a.start - b.start));
      setSelection(null);
    },
    [onChange, selection, tags],
  );

  const remove = useCallback(() => {
    if (!selection) return;
    onChange(tags.filter((tag) => tag.end < selection.start || tag.start > selection.end));
    setSelection(null);
  }, [onChange, selection, tags]);

  useEffect(() => {
    if (disabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (!selection || event.metaKey || event.ctrlKey || event.altKey) return;
      const category = PII_CATEGORIES.find((item) => item.key === event.key);
      if (category) {
        event.preventDefault();
        apply(category.id);
      } else if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        remove();
      } else if (event.key === "Escape") {
        setSelection(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [apply, disabled, remove, selection]);

  function onMouseUp(event: React.MouseEvent) {
    if (disabled) return;
    const native = window.getSelection();
    if (native && !native.isCollapsed && native.rangeCount) {
      const range = native.getRangeAt(0);
      const touched = [...(textRef.current?.querySelectorAll("[data-i]") ?? [])]
        .filter((element) => range.intersectsNode(element))
        .map((element) => Number(element.getAttribute("data-i")));
      native.removeAllRanges();
      if (touched.length) {
        anchorRef.current = Math.min(...touched);
        setSelection({ start: Math.min(...touched), end: Math.max(...touched) });
      }
      return;
    }
    const clicked = tokenIndex(event.target as Node);
    if (clicked === null) return;
    if (event.shiftKey && anchorRef.current !== null) {
      setSelection({ start: Math.min(anchorRef.current, clicked), end: Math.max(anchorRef.current, clicked) });
      return;
    }
    const existing = tagFor(clicked);
    anchorRef.current = clicked;
    setSelection(existing ? { start: existing.start, end: existing.end } : { start: clicked, end: clicked });
  }

  const selectedTag = selection ? tags.find((tag) => tag.start <= selection.end && tag.end >= selection.start) : undefined;

  return (
    <div>
      {!disabled && (
        <div className="sticky top-3 z-10 mb-4 rounded-2xl bg-white/95 p-3 shadow-lg shadow-brand-900/5 ring-1 ring-brand-100 backdrop-blur">
          <p className="px-1 text-xs text-slate-500">
            {selection ? (
              <>
                Selected: <span className="font-medium text-slate-800">“{tokenText(document, selection.start, selection.end)}”</span>
              </>
            ) : (
              "Click a word, drag across words, or Shift+click to extend a selection. Then choose a category."
            )}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {PII_CATEGORIES.map((category) => (
              <button
                key={category.id}
                onClick={() => apply(category.id)}
                disabled={!selection}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium ring-1 transition disabled:opacity-40 ${category.chip}`}
              >
                <kbd className="rounded bg-white/70 px-1 font-mono text-[11px]">{category.key}</kbd> {category.label}
              </button>
            ))}
            <button
              onClick={remove}
              disabled={!selectedTag}
              className="ml-auto inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:opacity-40"
            >
              <Eraser className="size-4" /> Remove tag
            </button>
          </div>
        </div>
      )}
      <div
        ref={textRef}
        onMouseUp={onMouseUp}
        className={`space-y-2.5 rounded-2xl bg-white p-5 text-[15px] leading-8 ring-1 ring-slate-200 ${disabled ? "" : "cursor-text"}`}
      >
        {document.lines.map((line) => (
          <p key={line.offset} className="flex gap-3">
            {line.prefix && <span className="shrink-0 select-none font-mono text-xs leading-8 text-slate-400">{line.prefix}</span>}
            <span>
              {line.tokens.map((token, position) => {
                const index = line.offset + position;
                const tag = tagFor(index);
                const selected = selection && index >= selection.start && index <= selection.end;
                const entity = reviewFor(index);
                const reviewStyle = !review
                  ? ""
                  : entity?.status === "missed" || entity?.status === "partial"
                    ? "outline outline-2 outline-red-400 outline-dashed"
                    : !entity && tag
                      ? "line-through decoration-red-500 decoration-2"
                      : "";
                return (
                  <span key={index}>
                    <span
                      data-i={index}
                      className={`rounded px-0.5 py-0.5 transition ${tag ? `ring-1 ${piiCategory(tag.category)?.chip}` : disabled ? "" : "hover:bg-brand-50"} ${selected ? "bg-brand-200 ring-2 ring-brand-500" : ""} ${reviewStyle}`}
                    >
                      {token}
                    </span>{" "}
                  </span>
                );
              })}
            </span>
          </p>
        ))}
      </div>
      {tags.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5 text-xs">
          {tags.map((tag) => (
            <li key={`${tag.start}-${tag.end}`} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ring-1 ${piiCategory(tag.category)?.chip}`}>
              <span className="font-semibold">{piiCategory(tag.category)?.label}:</span> {tokenText(document, tag.start, tag.end)}
              {!disabled && (
                <button
                  onClick={() => onChange(tags.filter((item) => item !== tag))}
                  aria-label="Remove tag"
                  className="-mr-1 rounded-full p-0.5 hover:bg-white/60"
                >
                  <X className="size-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
