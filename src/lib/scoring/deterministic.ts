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

export function stripCandidateMarkup(text: string) {
  return text
    .replace(/\[\d{1,2}:\d{2}\]/g, " ")
    .replace(/\bSpeaker\s+[A-Z0-9_-]+\s*:/gi, " ")
    .replace(/\[(?:inaudible|crosstalk)\]/gi, " ");
}

export function normalizeText(text: string) {
  let normalized = text.toLowerCase().replace(/[’]/g, "'");
  for (const [short, expanded] of Object.entries(CONTRACTIONS)) {
    normalized = normalized.replaceAll(short, expanded);
  }
  return normalized
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function wordErrorRate(reference: string, candidate: string) {
  const ref = normalizeText(reference).split(" ").filter(Boolean);
  const hyp = normalizeText(stripCandidateMarkup(candidate)).split(" ").filter(Boolean);
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

export function paceScore(activeSeconds: number, durationSeconds: number) {
  const ratio = durationSeconds > 0 ? activeSeconds / durationSeconds : 8;
  const score =
    ratio < 0.5
      ? 0
      : ratio < 1
        ? ((ratio - 0.5) / 0.5) * 100
        : ratio <= 3
          ? 100
          : ratio >= 8
            ? 0
            : ((8 - ratio) / 5) * 100;
  return { ratio, score };
}
