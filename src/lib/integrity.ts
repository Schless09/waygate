import "server-only";

import { normalizeText, stripCandidateMarkup } from "./scoring/deterministic";
import type { ReferenceUtterance, Telemetry } from "./types";

export type IntegrityReason = { label: string; penalty: number };
export type IntegrityReport = { score: number; reasons: IntegrityReason[] };

// Phrases are matched as word trigrams that occur exactly once in the reference,
// so common filler like "i think that" cannot produce false positives.
function uniqueReferenceTrigrams(utterances: ReferenceUtterance[]) {
  const words = utterances.flatMap((utterance) => {
    const tokens = normalizeText(utterance.text).split(" ").filter(Boolean);
    const span = Math.max(0, utterance.end_time - utterance.begin_time);
    return tokens.map((word, index) => ({
      word,
      time: utterance.begin_time + (span * (index + 0.5)) / tokens.length,
    }));
  });
  const counts = new Map<string, number>();
  const times = new Map<string, number>();
  for (let i = 0; i + 2 < words.length; i += 1) {
    const key = `${words[i].word} ${words[i + 1].word} ${words[i + 2].word}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    times.set(key, words[i].time);
  }
  return new Map([...times].filter(([key]) => counts.get(key) === 1));
}

function candidateTrigrams(text: string) {
  const words = normalizeText(stripCandidateMarkup(text)).split(" ").filter(Boolean);
  const trigrams = new Set<string>();
  for (let i = 0; i + 2 < words.length; i += 1) trigrams.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  return trigrams;
}

const mmss = (seconds: number) =>
  `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;

export function integrityReport({
  telemetry,
  transcript,
  utterances,
  durationSeconds,
  activeSeconds,
  role,
}: {
  telemetry: Partial<Telemetry> | null;
  transcript: string;
  utterances: ReferenceUtterance[];
  durationSeconds: number;
  activeSeconds: number | null;
  role: string;
}): IntegrityReport | null {
  if (!telemetry) return null;
  const reasons: IntegrityReason[] = [];
  const flag = (label: string, penalty: number) => reasons.push({ label, penalty });
  // QA candidates start from a prefilled transcript, so text-provenance checks only apply to annotators.
  const isAnnotator = role !== "qa";
  const reference = uniqueReferenceTrigrams(utterances);

  if (isAnnotator && telemetry.snapshots?.length) {
    for (const snapshot of telemetry.snapshots) {
      const ahead = [...candidateTrigrams(snapshot.tail)]
        .map((trigram) => reference.get(trigram))
        .filter((time): time is number => time !== undefined && time > snapshot.heardTo + 20);
      if (ahead.length >= 3) {
        flag(
          `Typed words from ${mmss(Math.min(...ahead))} when only ${mmss(snapshot.heardTo)} had been played`,
          40,
        );
        break;
      }
    }
  }

  if (isAnnotator && telemetry.heard && reference.size) {
    const heard = new Set<number>();
    for (const [start, end] of telemetry.heard) {
      for (let second = start - 2; second <= end + 2; second += 1) heard.add(second);
    }
    const typed = candidateTrigrams(transcript);
    const unheardMatches = [...reference].filter(
      ([trigram, time]) => !heard.has(Math.floor(time)) && typed.has(trigram),
    ).length;
    const ratio = unheardMatches / reference.size;
    if (unheardMatches >= 8 && ratio >= 0.05) {
      flag(`${unheardMatches} phrases transcribed from parts of the audio that were never played`, Math.min(35, Math.round(10 + ratio * 100)));
    }
  }

  const insertedChars = (telemetry.pastedChars ?? 0) + (telemetry.largeInsertChars ?? 0);
  if (insertedChars >= 200) flag(`${insertedChars} characters pasted or inserted without typing`, 25);
  else if (insertedChars >= 50) flag(`${insertedChars} characters pasted or inserted without typing`, 10);

  const transcriptChars = transcript.replace(/\s/g, "").length;
  if (isAnnotator && telemetry.keystrokes !== undefined && transcriptChars >= 300) {
    const ratio = telemetry.keystrokes / transcriptChars;
    if (ratio < 0.5) flag(`Only ${telemetry.keystrokes} keystrokes for ${transcriptChars} transcript characters`, 25);
    else if (ratio < 0.8) flag(`Low keystroke count (${telemetry.keystrokes}) for ${transcriptChars} transcript characters`, 10);
  }

  const playTime = telemetry.totalPlayTime ?? 0;
  if (telemetry.longestPlayRun !== undefined && telemetry.longestPlayRun >= durationSeconds * 0.75) {
    flag(`Played ${Math.round(telemetry.longestPlayRun)}s straight without pausing, as if copying live captions`, 15);
  }
  if (telemetry.pauseCount !== undefined && playTime >= 60 && telemetry.pauseCount / (playTime / 60) < 0.5) {
    flag(`Rarely paused (${telemetry.pauseCount} pauses in ${Math.round(playTime / 60)} minutes of playback)`, 10);
  }
  if (playTime < durationSeconds * 0.8) {
    flag(`Played only ${Math.round((100 * playTime) / durationSeconds)}% of the clip`, 15);
  }
  if (!telemetry.rewindCount) flag("Never rewound the audio", 5);
  if ((telemetry.blurCount ?? 0) >= 5) flag(`Left the tab ${telemetry.blurCount} times`, 10);
  if (activeSeconds !== null && activeSeconds < durationSeconds) flag("Submitted faster than the clip length", 15);

  return {
    score: Math.max(0, 100 - reasons.reduce((sum, reason) => sum + reason.penalty, 0)),
    reasons,
  };
}
