"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QUIZ_QUESTIONS, quizStorageKey } from "@/lib/quiz";

export function GuidelineQuiz({ role, firstClipHref }: { role: string; firstClipHref: string }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<number[]>(() => QUIZ_QUESTIONS.map(() => -1));
  const complete = answers.every((answer) => answer >= 0);

  function continueToClip() {
    try {
      localStorage.setItem(quizStorageKey(role), JSON.stringify(answers));
    } catch {
      // The quiz is optional evidence; storage failures should not block the assessment.
    }
    router.push(firstClipHref);
  }

  return (
    <section className="mt-10 border-t border-slate-200 pt-8">
      <h2 className="text-lg font-semibold">Quick guideline check</h2>
      <p className="mt-2 text-sm text-slate-600">Answer five questions about the format above before you start. This is not timed.</p>
      <ol className="mt-6 space-y-6">
        {QUIZ_QUESTIONS.map((question, questionIndex) => (
          <li key={question.prompt}>
            <fieldset>
              <legend className="font-medium">{questionIndex + 1}. {question.prompt}</legend>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {question.options.map((option, optionIndex) => (
                  <label
                    key={option}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${answers[questionIndex] === optionIndex ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}
                  >
                    <input
                      type="radio"
                      name={`q${questionIndex}`}
                      checked={answers[questionIndex] === optionIndex}
                      onChange={() =>
                        setAnswers((current) => current.map((value, index) => (index === questionIndex ? optionIndex : value)))
                      }
                      className="accent-slate-900"
                    />
                    <span className="font-mono">{option}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </li>
        ))}
      </ol>
      <button
        onClick={continueToClip}
        disabled={!complete}
        className="mt-8 w-full rounded-lg bg-slate-900 px-5 py-3 font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {complete ? "Continue to Clip 1" : "Answer all questions to continue"}
      </button>
    </section>
  );
}
