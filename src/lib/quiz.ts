export const QUIZ_QUESTIONS = [
  {
    prompt: "You can't make out a word after replaying it three times. What do you type?",
    options: ["Your best guess", "[inaudible]", "[crosstalk]", "Leave it out"],
  },
  {
    prompt: "Two people talk over each other and neither is clear. What do you type?",
    options: ["[inaudible]", "Only the louder speaker", "[crosstalk]", "Nothing"],
  },
  {
    prompt: "In clean verbatim, how do you write: “Um, I think we should, uh, ship it”?",
    options: [
      "Um, I think we should, uh, ship it",
      "I think we should ship it",
      "We should ship it",
      "I think, uh, we should ship it",
    ],
  },
  {
    prompt: "A third new voice joins the meeting. How do you label them?",
    options: ["Speaker 3", "Speaker C", "Unknown", "The speaker's name if mentioned"],
  },
  {
    prompt: "Which timestamp format is correct for 1 minute 5 seconds?",
    options: ["(1:05)", "[1:5]", "[01:05]", "01m05s"],
  },
] as const;

export const quizStorageKey = (role: string) => `waygate-quiz-${role}`;
