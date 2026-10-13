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
    <section className="mt-10 border-t border-brand-100 pt-8">
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
                    className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition ${answers[questionIndex] === optionIndex ? "border-brand-400 bg-brand-50 text-brand-800 ring-2 ring-brand-100" : "border-slate-200 hover:border-brand-200 hover:bg-brand-50/40"}`}
                  >
                    <input
                      type="radio"
                      name={`q${questionIndex}`}
                      checked={answers[questionIndex] === optionIndex}
                      onChange={() =>
                        setAnswers((current) => current.map((value, index) => (index === questionIndex ? optionIndex : value)))
                      }
                      className="accent-brand-600"
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
        className="btn-primary mt-8 w-full"
      >
        {complete ? "Continue to Clip 1" : "Answer all questions to continue"}
      </button>
    </section>
  );
}
