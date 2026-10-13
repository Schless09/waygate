"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, GraduationCap } from "lucide-react";
import { QUIZ_QUESTIONS, quizStorageKey } from "@/lib/quiz";

export function GuidelineQuiz({
  role,
  firstClipHref,
  practiceHref,
  practiceDone,
}: {
  role: string;
  firstClipHref: string;
  practiceHref: string;
  practiceDone: boolean;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<number[]>(() => QUIZ_QUESTIONS.map(() => -1));
  const [agreed, setAgreed] = useState(false);
  const complete = answers.every((answer) => answer >= 0);

  function go(href: string) {
    try {
      localStorage.setItem(quizStorageKey(role), JSON.stringify(answers));
    } catch {
      // The quiz is optional evidence; storage failures should not block the assessment.
    }
    router.push(href);
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
      <label className={`mt-8 flex cursor-pointer gap-3 rounded-xl p-4 text-sm leading-6 ring-1 transition ${agreed ? "bg-brand-50 ring-brand-300" : "ring-slate-200 hover:ring-brand-200"}`}>
        <input
          type="checkbox"
          checked={agreed}
          onChange={(event) => setAgreed(event.target.checked)}
          className="mt-1 size-4 shrink-0 accent-brand-600"
        />
        <span className="text-slate-700">
          I will complete this assessment on my own, without live captions, speech-to-text, AI tools, or help from
          anyone else. I understand that using them will disqualify my submission.
        </span>
      </label>
      {!complete || !agreed ? (
        <button disabled className="btn-primary mt-4 w-full">
          {!complete ? "Answer all questions to continue" : "Accept the agreement to continue"}
        </button>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button onClick={() => go(practiceHref)} className="btn-secondary py-3 text-base">
            <GraduationCap className="size-4" /> {practiceDone ? "View practice feedback" : "Try a practice clip first"}
          </button>
          <button onClick={() => go(firstClipHref)} className="btn-primary">
            Start the assessment <ArrowRight className="size-4" />
          </button>
        </div>
      )}
      {complete && agreed && !practiceDone && (
        <p className="mt-3 text-center text-xs text-slate-500">
          The practice clip is optional and doesn&apos;t count toward your result. You&apos;ll get feedback right after it.
        </p>
      )}
    </section>
  );
}
