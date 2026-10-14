export const ANNOTATOR_SCORE_WEIGHTS = {
  transcription: 0.5,
  speaker: 0.25,
  pace: 0.15,
  format: 0.1,
} as const;

// For QA, "errors" is the share of planted errors fixed, "transcription" is whether
// the rest of the transcript was left at least as accurate, and "format" is the
// quality of the reviewer notes.
export const QA_SCORE_WEIGHTS = {
  errors: 0.45,
  transcription: 0.15,
  speaker: 0.1,
  pace: 0.1,
  format: 0.2,
} as const;

// Haiku is sufficient for this constrained JSON rubric and costs roughly half
// as much as Sonnet. Override without a code change if production evals show a
// material quality gap.
export const CLAUDE_MODEL =
  process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";
