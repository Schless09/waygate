import "server-only";

import type { ReferenceUtterance, Telemetry } from "./types";

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

export function effortFlags(
  telemetry: Partial<Telemetry> | null,
  durationSeconds: number,
  activeSeconds: number | null,
) {
  if (!telemetry) return [];
  const flags: string[] = [];
  const playTime = telemetry.totalPlayTime ?? 0;
  if (playTime < durationSeconds * 0.8) {
    flags.push(`Played only ${Math.round((100 * playTime) / durationSeconds)}% of the clip`);
  }
  if (!telemetry.rewindCount) flags.push("Never rewound the audio");
  if ((telemetry.blurCount ?? 0) >= 5) flags.push(`Left the tab ${telemetry.blurCount} times`);
  if ((telemetry.pastedChars ?? 0) >= 200) {
    flags.push(`Pasted ${telemetry.pastedChars} characters into the transcript`);
  }
  if (activeSeconds !== null && activeSeconds < durationSeconds) {
    flags.push("Submitted faster than the clip length");
  }
  return flags;
}
