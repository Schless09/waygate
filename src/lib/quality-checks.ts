import "server-only";

import type { ReferenceUtterance } from "./types";

const QUIZ_ANSWERS = [1, 2, 1, 1, 2];

export function quizScore(answers: unknown) {
  if (!Array.isArray(answers) || answers.length !== QUIZ_ANSWERS.length) return null;
  const correct = QUIZ_ANSWERS.filter((answer, index) => answers[index] === answer).length;
  return { correct, total: QUIZ_ANSWERS.length };
}

// Each typed timestamp is matched to the nearest reference turn start, so the
// drift measures timing accuracy without requiring turns to line up exactly.
export function timestampAccuracy(transcript: string, utterances: ReferenceUtterance[]) {
  const starts = utterances.map((utterance) => utterance.begin_time);
  const drifts = [...transcript.matchAll(/\[(\d{1,2}):(\d{2})\]/g)].map((match) => {
    const seconds = Number(match[1]) * 60 + Number(match[2]);
    return Math.min(...starts.map((start) => Math.abs(start - seconds)));
  });
  if (!drifts.length || !starts.length) return { count: drifts.length, medianDrift: null };
  drifts.sort((a, b) => a - b);
  return { count: drifts.length, medianDrift: drifts[Math.floor(drifts.length / 2)] };
}

export function tagUsage(transcript: string, utterances: ReferenceUtterance[]) {
  const overlaps = utterances.filter(
    (utterance, index) =>
      index > 0 &&
      utterance.speaker !== utterances[index - 1].speaker &&
      utterance.begin_time < utterances[index - 1].end_time - 0.5,
  ).length;
  return {
    inaudible: transcript.match(/\[inaudible\]/gi)?.length ?? 0,
    crosstalk: transcript.match(/\[crosstalk\]/gi)?.length ?? 0,
    overlapsInAudio: overlaps,
  };
}
