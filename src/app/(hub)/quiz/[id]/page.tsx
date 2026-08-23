"use client";

import { useParams } from "next/navigation";
import { QuizRunner } from "@/components/quiz-runner";

export default function QuizPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="flex min-h-0 flex-1 overflow-y-auto">
      <QuizRunner quizId={id} />
    </div>
  );
}
