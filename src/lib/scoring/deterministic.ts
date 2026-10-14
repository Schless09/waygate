const CONTRACTIONS: Record<string, string> = {
  "can't": "cannot",
  "won't": "will not",
  "n't": " not",
  "'re": " are",
  "'ve": " have",
  "'ll": " will",
  "'d": " would",
  "'m": " am",
  "it's": "it is",
  "that's": "that is",
};

const SLANG: Record<string, string> = {
  wanna: "want to",
  gonna: "going to",
  gotta: "got to",
  kinda: "kind of",
  ok: "okay",
};

// AMI references use British spelling; candidates shouldn't lose accuracy for US spelling.
const BRITISH_STEMS = ["characteris", "organis", "realis", "recognis", "apologis", "prioritis", "summaris", "minimis", "maximis", "customis", "visualis", "standardis", "categoris", "finalis"];
const BRITISH_WORDS: Record<string, string> = {
  colour: "color",
  colours: "colors",
  favourite: "favorite",
  favourites: "favorites",
  behaviour: "behavior",
  centre: "center",
  programme: "program",
  analyse: "analyze",
  analysed: "analyzed",
  travelling: "traveling",
  grey: "gray",
};

// Clean verbatim drops fillers, but the reference transcripts keep them, so they
// are ignored on both sides rather than counted as deletions.
const FILLERS = new Set(["uh", "um", "er", "ah", "eh", "hm", "hmm", "mm", "mhm", "uhm", "erm"]);

export function stripCandidateMarkup(text: string) {
  return text
    .replace(/\[\d{1,2}:\d{2}\]/g, " ")
    .replace(/\bSpeaker\s+[A-Z0-9_-]+\s*:/gi, " ")
    .replace(/\[[a-z][a-z\s-]*\]/gi, " ");
}

export function normalizeText(text: string) {
  let normalized = text.toLowerCase().replace(/[’]/g, "'");
  for (const [short, expanded] of Object.entries(CONTRACTIONS)) {
    normalized = normalized.replaceAll(short, expanded);
  }
  for (const [short, expanded] of Object.entries(SLANG)) {
    normalized = normalized.replace(new RegExp(`\\b${short}\\b`, "g"), expanded);
  }
  normalized = normalized
    .replace(new RegExp(`\\b(${BRITISH_STEMS.join("|")})(e|ed|es|ing|ation|ations)\\b`, "g"), (_, stem: string, ending: string) => `${stem.slice(0, -1)}z${ending}`)
    .replace(/\b[a-z]+\b/g, (word) => BRITISH_WORDS[word] ?? word);
  return normalized
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const scoringWords = (text: string) =>
  normalizeText(text).split(" ").filter((word) => word && !FILLERS.has(word));

export function transcriptCoverage(reference: string, candidate: string) {
  const referenceWords = scoringWords(reference).length;
  if (!referenceWords) return 1;
  return Math.min(1, scoringWords(stripCandidateMarkup(candidate)).length / referenceWords);
}

// Drops candidate lines timestamped outside the span the reference covers, so
// correctly transcribed chatter before or after it isn't counted as insertions.
export function trimToReferenceWindow(
  transcript: string,
  utterances: { begin_time: number; end_time: number }[],
) {
  if (!utterances.length) return transcript;
  const first = Math.min(...utterances.map((utterance) => utterance.begin_time)) - 3;
  const last = Math.max(...utterances.map((utterance) => utterance.end_time)) + 3;
  return transcript
    .split("\n")
    .filter((line) => {
      const match = line.match(/^\s*\[(\d{1,2}):(\d{2})\]/);
      if (!match) return true;
      const seconds = Number(match[1]) * 60 + Number(match[2]);
      return seconds >= first && seconds <= last;
    })
    .join("\n");
}

export function wordErrorRate(reference: string, candidate: string) {
  const ref = scoringWords(reference);
  const hyp = scoringWords(stripCandidateMarkup(candidate));
  if (!ref.length) return hyp.length ? 1 : 0;

  const previous = Array.from({ length: hyp.length + 1 }, (_, index) => index);
  for (let i = 1; i <= ref.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= hyp.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[hyp.length] / ref.length;
}

// Careful multi-speaker transcription typically takes four to six times the
// audio length; short crosstalk-heavy clips and a first session in an unfamiliar
// tool run slower, so the taper is long. QA review replays audio to verify each
// line, so full marks extend further.
const PACE_LIMITS = {
  annotator: { full: 6, zero: 20 },
  qa: { full: 8, zero: 20 },
} as const;

export function paceScore(activeSeconds: number, durationSeconds: number, role: "annotator" | "qa" = "annotator") {
  const { full, zero } = PACE_LIMITS[role];
  const ratio = durationSeconds > 0 ? activeSeconds / durationSeconds : zero;
  const score =
    ratio < 0.5
      ? 0
      : ratio < 1
        ? ((ratio - 0.5) / 0.5) * 100
        : ratio <= full
          ? 100
          : ratio >= zero
            ? 0
            : ((zero - ratio) / (zero - full)) * 100;
  return { ratio, score };
}
