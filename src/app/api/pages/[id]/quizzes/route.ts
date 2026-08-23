import { NextResponse } from "next/server";
import {
  createManualQuiz,
  generateKindQuizForPage,
  generateQuizForPage,
  listQuizzes,
} from "@/lib/quizzes";
import { isMaterialKind } from "@/lib/kinds";
import type { QuestionDraft } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const quizzes = await listQuizzes(id);
  return NextResponse.json({ quizzes });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json()) as {
    mode?: "generate" | "manual" | "theory" | "math" | "code";
    title?: string;
    count?: number;
    questions?: QuestionDraft[];
  };
  try {
    if (body.mode === "manual") {
      const quiz = await createManualQuiz(
        id,
        body.title || "Custom quiz",
        body.questions || [],
      );
      return NextResponse.json(quiz);
    }
    if (body.mode && isMaterialKind(body.mode)) {
      const quiz = await generateKindQuizForPage(id, body.mode);
      return NextResponse.json(quiz);
    }
    const quiz = await generateQuizForPage(id);
    return NextResponse.json(quiz);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Quiz failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
