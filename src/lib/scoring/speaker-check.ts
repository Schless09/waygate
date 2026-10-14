import type { ReferenceUtterance } from "@/lib/types";
import { scoringWords, stripCandidateMarkup } from "./deterministic";

export type SpeakerCheck = {
  score: number;
  attribution: number;
  turnRecall: number;
  turnPrecision: number;
  referenceTurns: number;
  candidateTurns: number;
  matchedTurns: number;
  mapping: Record<string, string | null>;
  referenceSpeakers: number;
  candidateSpeakers: number;
  summary: string;
};

type Word = { word: string; speaker: string };

const ATTRIBUTION_WEIGHT = 0.7;
const TURN_TOLERANCE_WORDS = 2;
const MIN_SPEAKER_WORDS = 10;

function candidateWords(transcript: string): Word[] {
  const words: Word[] = [];
  let speaker = "?";
  for (const raw of transcript.split("\n")) {
    const label = raw.match(/\bSpeaker\s+([A-Z0-9_-]+)\s*:/i);
    if (label) speaker = label[1].toUpperCase();
    for (const word of scoringWords(stripCandidateMarkup(raw))) words.push({ word, speaker });
  }
  return words;
}

function referenceWords(utterances: ReferenceUtterance[]): Word[] {
  return [...utterances]
    .sort((a, b) => a.begin_time - b.begin_time)
    .flatMap((utterance) => scoringWords(utterance.text).map((word) => ({ word, speaker: utterance.speaker })));
}

/** Levenshtein alignment; returns the reference index paired with each aligned candidate word. */
function align(reference: Word[], candidate: Word[]) {
  const n = reference.length;
  const m = candidate.length;
  const width = m + 1;
  const cost = new Uint32Array((n + 1) * width);
  for (let j = 0; j <= m; j += 1) cost[j] = j;
  for (let i = 1; i <= n; i += 1) {
    cost[i * width] = i;
    for (let j = 1; j <= m; j += 1) {
      const substitution = cost[(i - 1) * width + j - 1] + (reference[i - 1].word === candidate[j - 1].word ? 0 : 1);
      cost[i * width + j] = Math.min(cost[(i - 1) * width + j] + 1, cost[i * width + j - 1] + 1, substitution);
    }
  }
  const pairs: [number, number][] = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    const here = cost[i * width + j];
    const same = reference[i - 1].word === candidate[j - 1].word;
    if (here === cost[(i - 1) * width + j - 1] + (same ? 0 : 1)) {
      pairs.push([i - 1, j - 1]);
      i -= 1;
      j -= 1;
    } else if (here === cost[(i - 1) * width + j] + 1) {
      i -= 1;
    } else {
      j -= 1;
    }
  }
  return pairs.reverse();
}

// Candidate letters are arbitrary, so pick the one-to-one label mapping that
// agrees with the most aligned words. Label counts are tiny, so search exhaustively.
function bestMapping(counts: Map<string, Map<string, number>>, referenceLabels: string[]) {
  const labels = [...counts.keys()];
  let best = { total: -1, mapping: new Map<string, string | null>() };
  const search = (index: number, used: Set<string>, total: number, mapping: Map<string, string | null>) => {
    if (index === labels.length) {
      if (total > best.total) best = { total, mapping: new Map(mapping) };
      return;
    }
    const label = labels[index];
    mapping.set(label, null);
    search(index + 1, used, total, mapping);
    for (const target of referenceLabels) {
      if (used.has(target)) continue;
      used.add(target);
      mapping.set(label, target);
      search(index + 1, used, total + (counts.get(label)?.get(target) ?? 0), mapping);
      used.delete(target);
    }
    mapping.delete(label);
  };
  search(0, new Set(), 0, new Map());
  return best;
}

function boundaries(words: Word[]) {
  const positions: number[] = [];
  for (let index = 1; index < words.length; index += 1) {
    if (words[index].speaker !== words[index - 1].speaker) positions.push(index);
  }
  return positions;
}

export function checkSpeakers(transcript: string, utterances: ReferenceUtterance[]): SpeakerCheck {
  const reference = referenceWords(utterances);
  const candidate = candidateWords(transcript);
  const pairs = align(reference, candidate);
  const referenceLabels = [...new Set(reference.map((word) => word.speaker))];

  const counts = new Map<string, Map<string, number>>();
  for (const [r, c] of pairs) {
    const tally = counts.get(candidate[c].speaker) ?? new Map<string, number>();
    tally.set(reference[r].speaker, (tally.get(reference[r].speaker) ?? 0) + 1);
    counts.set(candidate[c].speaker, tally);
  }
  const { total: correct, mapping } = bestMapping(counts, referenceLabels);
  const attribution = pairs.length ? Math.max(0, correct) / pairs.length : 0;
  // Averaging accuracy per reference speaker keeps a dominant talker from carrying
  // the score: labelling everyone as one speaker earns only that speaker's share.
  const perSpeaker = new Map<string, { aligned: number; correct: number }>();
  for (const [r, c] of pairs) {
    const entry = perSpeaker.get(reference[r].speaker) ?? { aligned: 0, correct: 0 };
    entry.aligned += 1;
    if (mapping.get(candidate[c].speaker) === reference[r].speaker) entry.correct += 1;
    perSpeaker.set(reference[r].speaker, entry);
  }
  const counted = [...perSpeaker.values()].filter((entry) => entry.aligned >= MIN_SPEAKER_WORDS);
  const attributionCredit = counted.length
    ? counted.reduce((sum, entry) => sum + entry.correct / entry.aligned, 0) / counted.length
    : attribution;

  // Place each candidate speaker change at the reference position its word aligned to.
  const referenceIndexFor = new Map<number, number>();
  for (const [r, c] of pairs) referenceIndexFor.set(c, r);
  const referenceTurns = boundaries(reference);
  const candidateTurns = boundaries(candidate)
    .map((position) => {
      for (let c = position; c < candidate.length; c += 1) {
        const r = referenceIndexFor.get(c);
        if (r !== undefined) return r;
      }
      return undefined;
    })
    .filter((value): value is number => value !== undefined);
  const unmatched = new Set(referenceTurns);
  let matchedTurns = 0;
  for (const position of candidateTurns) {
    let nearest: number | null = null;
    for (const turn of unmatched) {
      if (Math.abs(turn - position) <= TURN_TOLERANCE_WORDS && (nearest === null || Math.abs(turn - position) < Math.abs(nearest - position))) {
        nearest = turn;
      }
    }
    if (nearest !== null) {
      unmatched.delete(nearest);
      matchedTurns += 1;
    }
  }
  const turnRecall = referenceTurns.length ? matchedTurns / referenceTurns.length : 1;
  const turnPrecision = candidateTurns.length ? matchedTurns / candidateTurns.length : referenceTurns.length ? 0 : 1;
  const turnF1 = turnRecall + turnPrecision ? (2 * turnRecall * turnPrecision) / (turnRecall + turnPrecision) : 0;
  const score = 100 * (ATTRIBUTION_WEIGHT * attributionCredit + (1 - ATTRIBUTION_WEIGHT) * turnF1);

  const candidateSpeakers = counts.size;
  const mappingText = [...mapping.entries()]
    .map(([from, to]) => `${from}→${to ?? "none"}`)
    .join(", ");
  const summary =
    `${Math.round(attribution * 100)}% of matched words are attributed to the right speaker (mapping ${mappingText || "none"}). ` +
    `Caught ${matchedTurns} of ${referenceTurns.length} speaker changes, with ${candidateTurns.length - matchedTurns} extra. ` +
    `Used ${candidateSpeakers} speaker label${candidateSpeakers === 1 ? "" : "s"}; the clip has ${referenceLabels.length}.`;

  return {
    score,
    attribution,
    turnRecall,
    turnPrecision,
    referenceTurns: referenceTurns.length,
    candidateTurns: candidateTurns.length,
    matchedTurns,
    mapping: Object.fromEntries(mapping),
    referenceSpeakers: referenceLabels.length,
    candidateSpeakers,
    summary,
  };
}
