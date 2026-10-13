export const PII_CATEGORIES = [
  { id: "NAME", label: "Name", key: "1", chip: "bg-violet-100 text-violet-800 ring-violet-300" },
  { id: "PHONE", label: "Phone", key: "2", chip: "bg-sky-100 text-sky-800 ring-sky-300" },
  { id: "EMAIL", label: "Email", key: "3", chip: "bg-teal-100 text-teal-800 ring-teal-300" },
  { id: "ADDRESS", label: "Address", key: "4", chip: "bg-amber-100 text-amber-800 ring-amber-300" },
  { id: "ORDER", label: "Order #", key: "5", chip: "bg-fuchsia-100 text-fuchsia-800 ring-fuchsia-300" },
  { id: "CARD", label: "Card digits", key: "6", chip: "bg-rose-100 text-rose-800 ring-rose-300" },
] as const;

export type PiiCategory = (typeof PII_CATEGORIES)[number]["id"];

export const PII_CATEGORY_IDS = PII_CATEGORIES.map((category) => category.id) as [PiiCategory, ...PiiCategory[]];

export const piiCategory = (id: string) => PII_CATEGORIES.find((category) => category.id === id);

/** Inclusive token range. */
export type PiiSpan = { start: number; end: number; category: PiiCategory };

export type PiiLine = { prefix: string; offset: number; tokens: string[] };

export type PiiDocument = { lines: PiiLine[]; tokenCount: number };

export type PiiEntity = PiiSpan & { text: string };

const MARKUP = /\{\{([A-Z]+)\|([^}]+)\}\}/g;
const LINE_PREFIX = /^(\[\d{1,2}:\d{2}\]\s+[^:]+:)\s*(.*)$/;

/**
 * Parses a transcript where PII is marked up as {{CATEGORY|text}}. Each line's
 * "[mm:ss] Speaker:" prefix is kept out of the selectable tokens.
 */
export function parsePiiSource(source: string): { document: PiiDocument; entities: PiiEntity[] } {
  const lines: PiiLine[] = [];
  const entities: PiiEntity[] = [];
  let offset = 0;
  for (const rawLine of source.trim().split("\n")) {
    const match = rawLine.trim().match(LINE_PREFIX);
    const prefix = match ? match[1] : "";
    const markedBody = match ? match[2] : rawLine.trim();

    let body = "";
    const ranges: { from: number; to: number; category: PiiCategory }[] = [];
    let cursor = 0;
    for (const found of markedBody.matchAll(MARKUP)) {
      body += markedBody.slice(cursor, found.index);
      const from = body.length;
      body += found[2];
      ranges.push({ from, to: body.length, category: found[1] as PiiCategory });
      cursor = found.index + found[0].length;
    }
    body += markedBody.slice(cursor);

    const tokens: string[] = [];
    const tokenRanges: { from: number; to: number }[] = [];
    for (const token of body.matchAll(/\S+/g)) {
      tokens.push(token[0]);
      tokenRanges.push({ from: token.index, to: token.index + token[0].length });
    }
    for (const range of ranges) {
      const covered = tokenRanges
        .map((token, index) => ({ ...token, index }))
        .filter((token) => token.from < range.to && token.to > range.from);
      if (!covered.length) continue;
      const start = offset + covered[0].index;
      const end = offset + covered.at(-1)!.index;
      entities.push({ start, end, category: range.category, text: body.slice(range.from, range.to) });
    }
    lines.push({ prefix, offset, tokens });
    offset += tokens.length;
  }
  return { document: { lines, tokenCount: offset }, entities };
}

export function tokenText(document: PiiDocument, start: number, end: number) {
  const words: string[] = [];
  for (const line of document.lines) {
    line.tokens.forEach((token, index) => {
      const position = line.offset + index;
      if (position >= start && position <= end) words.push(token);
    });
  }
  return words.join(" ");
}

export type PiiEntityResult = PiiEntity & { status: "found" | "wrong_category" | "partial" | "missed" };

export type PiiResult = {
  score: number;
  recall: number;
  precision: number;
  entities: PiiEntityResult[];
  falsePositives: string[];
};

// Missing PII is the costly error for clients, so recall carries most of the weight.
const RECALL_WEIGHT = 0.75;

export function scorePii(document: PiiDocument, entities: PiiEntity[], tags: PiiSpan[]): PiiResult {
  const tagAt = new Map<number, PiiCategory>();
  for (const tag of tags) {
    for (let index = tag.start; index <= tag.end; index += 1) tagAt.set(index, tag.category);
  }
  const goldTokens = new Set<number>();
  let credit = 0;
  const results = entities.map((entity): PiiEntityResult => {
    let covered = 0;
    let categoryMatch = false;
    for (let index = entity.start; index <= entity.end; index += 1) {
      goldTokens.add(index);
      const category = tagAt.get(index);
      if (category) covered += 1;
      if (category === entity.category) categoryMatch = true;
    }
    const length = entity.end - entity.start + 1;
    if (covered === length) {
      credit += categoryMatch ? 1 : 0.5;
      return { ...entity, status: categoryMatch ? "found" : "wrong_category" };
    }
    if (covered > 0) {
      credit += categoryMatch ? 0.5 : 0.25;
      return { ...entity, status: "partial" };
    }
    return { ...entity, status: "missed" };
  });

  const tagged = [...tagAt.keys()].sort((a, b) => a - b);
  const correctTokens = tagged.filter((index) => goldTokens.has(index)).length;
  const falsePositives: string[] = [];
  let runStart: number | null = null;
  tagged.forEach((index, position) => {
    if (goldTokens.has(index)) return;
    if (runStart === null) runStart = index;
    const next = tagged[position + 1];
    if (next !== index + 1 || goldTokens.has(next)) {
      falsePositives.push(tokenText(document, runStart, index));
      runStart = null;
    }
  });

  const recall = entities.length ? credit / entities.length : 1;
  const precision = tagged.length ? correctTokens / tagged.length : 0;
  return {
    score: 100 * (RECALL_WEIGHT * recall + (1 - RECALL_WEIGHT) * precision),
    recall,
    precision,
    entities: results,
    falsePositives,
  };
}

export const PII_PRACTICE_SOURCE = `[00:00] Agent: Hi, you're through to {{NAME|Sam}} at Northwind Support.
[00:03] Customer: Hi {{NAME|Sam}}, I'm {{NAME|Lena Ortiz}}. My order {{ORDER|NW-30917}} never arrived.
[00:09] Agent: Sorry to hear that. Can I get a phone number in case we get cut off?
[00:12] Customer: Sure, it's {{PHONE|212-555-0147}}.
[00:15] Agent: Thanks. I'll send the tracking link to {{EMAIL|lena.ortiz@example.com}}.`;

export const PII_RULES = [
  "Tag every person's name, including the agent's and anyone mentioned in passing.",
  "Tag phone numbers, email addresses, order numbers, and card digits.",
  "Tag the whole street address in one selection, including apartment and city.",
  "Don't tag company names, products, card brands (like Visa), dates, or times.",
];
