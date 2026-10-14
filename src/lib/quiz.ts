export const QUIZ_QUESTIONS = [
  {
    prompt: "You can't make out a word after replaying it three times. What do you type?",
    options: ["Your best guess", "[inaudible]", "[crosstalk]", "Leave it out"],
    answer: 1,
  },
  {
    prompt: "Two people talk over each other and neither is clear. What do you type?",
    options: ["[inaudible]", "Only the louder speaker", "[crosstalk]", "Nothing"],
    answer: 2,
  },
  {
    prompt: "In clean verbatim, how do you write: “Um, I think we should, uh, ship it”?",
    options: [
      "Um, I think we should, uh, ship it",
      "I think we should ship it",
      "We should ship it",
      "I think, uh, we should ship it",
    ],
    answer: 1,
  },
  {
    prompt: "A third new voice joins the meeting. How do you label them?",
    options: ["Speaker 3", "Speaker C", "Unknown", "The speaker's name if mentioned"],
    answer: 1,
  },
  {
    prompt: "Which timestamp format is correct for 1 minute 5 seconds?",
    options: ["(1:05)", "[1:5]", "[01:05]", "01m05s"],
    answer: 2,
  },
] as const;

// Shown to candidates as they answer: the quiz gates the assessment rather than scoring it,
// and admins see first-try accuracy from the stored first picks.
export const QUIZ_ANSWERS: readonly number[] = QUIZ_QUESTIONS.map((question) => question.answer);

export const quizStorageKey = (role: string) => `waygate-quiz-${role}`;
