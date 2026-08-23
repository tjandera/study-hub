import { NextResponse } from "next/server";
import { regenerateQuiz } from "@/lib/quizzes";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const quiz = await regenerateQuiz(id);
    return NextResponse.json(quiz);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not regenerate quiz";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
