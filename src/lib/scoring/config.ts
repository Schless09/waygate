export const SCORE_WEIGHTS = {
  transcription: 0.5,
  speaker: 0.25,
  pace: 0.15,
  format: 0.1,
} as const;

// Haiku is sufficient for this constrained JSON rubric and costs roughly half
// as much as Sonnet. Override without a code change if production evals show a
// material quality gap.
export const CLAUDE_MODEL =
  process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";
