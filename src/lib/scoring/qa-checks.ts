import type { ReferenceUtterance } from "@/lib/types";
import { normalizeText } from "./deterministic";

export type SeededError = {
  type: "omission" | "speaker" | "timestamp" | "clean_verbatim" | "false_inaudible";
  turn: number;
  detail: string;
};

export type SeededCheck = SeededError & { fixed: boolean; reason: string; line: string | null };

export type QaChecks = {
  caught: number;
  total: number;
  score: number;
  checks: SeededCheck[];
};

type Line = { seconds: number | null; speaker: string | null; text: string; raw: string; tokens: string[] };

const TIMESTAMP_TOLERANCE_SECONDS = 3;

function tokens(text: string) {
  return normalizeText(text.replace(/\[[a-z][a-z\s-]*\]/gi, " ")).split(" ").filter(Boolean);
}

function parseLines(transcript: string): Line[] {
  return transcript
    .split("\n")
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => {
      const match = raw.match(/^\[(\d{1,2}):(\d{2})\]\s*(?:Speaker\s+([A-Z0-9_-]+)\s*:)?\s*(.*)$/i);
      const bare = match ? null : raw.match(/^Speaker\s+([A-Z0-9_-]+)\s*:\s*(.*)$/i);
      const text = match ? match[4] : bare ? bare[2] : raw;
      return {
        seconds: match ? Number(match[1]) * 60 + Number(match[2]) : null,
        speaker: (match?.[3] ?? bare?.[1] ?? null)?.toUpperCase() ?? null,
        text,
        raw,
        tokens: tokens(text),
      };
    });
}

function similarity(left: string[], right: string[]) {
  if (!left.length || !right.length) return 0;
  const counts = new Map<string, number>();
  for (const word of left) counts.set(word, (counts.get(word) ?? 0) + 1);
  let shared = 0;
  for (const word of right) {
    const remaining = counts.get(word) ?? 0;
    if (remaining > 0) {
      shared += 1;
      counts.set(word, remaining - 1);
    }
  }
  return (2 * shared) / (left.length + right.length);
}

// Candidates split, merge, and reorder lines, so a reference turn is located by its
// own text plus its neighbours' text, with a weak pull toward its expected position.
function locate(turn: number, reference: string[][], lines: Line[]) {
  let best = { index: -1, score: 0, own: 0 };
  const expected = (turn / Math.max(1, reference.length - 1)) * (lines.length - 1);
  lines.forEach((line, index) => {
    const own = similarity(reference[turn], line.tokens);
    const context =
      (turn > 0 && index > 0 ? similarity(reference[turn - 1], lines[index - 1].tokens) : 0) +
      (turn + 1 < reference.length && index + 1 < lines.length
        ? similarity(reference[turn + 1], lines[index + 1].tokens)
        : 0);
    const score = own + 0.5 * context - 0.01 * Math.abs(index - expected);
    if (score > best.score) best = { index, score, own };
  });
  return best.own >= 0.3 ? best.index : -1;
}

// Speaker letters are arbitrary, so translate the candidate's labels through the
// mapping implied by every confidently matched line other than the one under test.
function speakerMapping(reference: ReferenceUtterance[], referenceTokens: string[][], lines: Line[], skip: number) {
  const votes = new Map<string, Map<string, number>>();
  referenceTokens.forEach((words, turn) => {
    if (turn === skip || words.length < 3) return;
    const index = locate(turn, referenceTokens, lines);
    const label = index >= 0 ? lines[index].speaker : null;
    if (!label || similarity(words, lines[index].tokens) < 0.6) return;
    const tally = votes.get(label) ?? new Map<string, number>();
    tally.set(reference[turn].speaker, (tally.get(reference[turn].speaker) ?? 0) + 1);
    votes.set(label, tally);
  });
  const mapping = new Map<string, string>();
  for (const [label, tally] of votes) {
    mapping.set(label, [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  }
  return mapping;
}

function quoted(detail: string, pattern: RegExp) {
  return detail.match(pattern)?.[1]?.trim() ?? "";
}

function countWord(words: string[], word: string) {
  return words.filter((item) => item === word).length;
}

export function checkSeededErrors(
  transcript: string,
  reference: ReferenceUtterance[],
  errors: SeededError[],
): QaChecks {
  const lines = parseLines(transcript);
  const referenceTokens = reference.map((utterance) => tokens(utterance.text));
  const checks = errors.map((error): SeededCheck => {
    const turn = error.turn - 1;
    const utterance = reference[turn];
    const index = utterance ? locate(turn, referenceTokens, lines) : -1;
    if (!utterance || index < 0) return { ...error, fixed: false, reason: "Line not found in the submission", line: null };
    const line = lines[index];
    const result = (fixed: boolean, reason: string) => ({ ...error, fixed, reason, line: line.raw });

    switch (error.type) {
      case "speaker": {
        const mapping = speakerMapping(reference, referenceTokens, lines, turn);
        const mapped = line.speaker ? (mapping.get(line.speaker) ?? line.speaker) : null;
        return mapped === utterance.speaker
          ? result(true, "Speaker corrected")
          : result(false, "Speaker still wrong");
      }
      case "timestamp": {
        if (line.seconds === null) return result(false, "Timestamp missing");
        const drift = Math.abs(line.seconds - utterance.begin_time);
        return drift <= TIMESTAMP_TOLERANCE_SECONDS
          ? result(true, `Timestamp within ${Math.round(drift)}s`)
          : result(false, `Timestamp still ${Math.round(drift)}s off`);
      }
      case "clean_verbatim": {
        const filler = normalizeText(quoted(error.detail, /'([^']+)'/) || "um");
        const remaining = countWord(normalizeText(line.text).split(" "), filler);
        const allowed = countWord(normalizeText(utterance.text).split(" "), filler);
        return remaining <= allowed
          ? result(true, `Inserted “${filler}” removed`)
          : result(false, `Inserted “${filler}” left in`);
      }
      case "false_inaudible":
      case "omission": {
        const word = tokens(quoted(error.detail, /:\s*(.+)$/));
        const expected = tokens(utterance.text);
        const restored =
          word.length > 0 &&
          word.every((item) => countWord(line.tokens, item) >= countWord(expected, item));
        return restored
          ? result(true, `“${word.join(" ")}” restored`)
          : result(false, `“${word.join(" ")}” still missing`);
      }
    }
  });
  const caught = checks.filter((check) => check.fixed).length;
  return { caught, total: checks.length, score: checks.length ? (100 * caught) / checks.length : 0, checks };
}

// Reviewers should fix the planted errors without degrading the rest of the
// transcript; small divergences from the reference are tolerated as judgment calls.
export function accuracyKeptScore(wer: number, sourceWer: number) {
  const harm = Math.max(0, wer - sourceWer);
  if (harm <= 0.05) return 100;
  if (harm >= 0.25) return 0;
  return (100 * (0.25 - harm)) / 0.2;
}
