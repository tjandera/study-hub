import { NextResponse } from "next/server";
import { listQuizzes } from "@/lib/quizzes";

export const runtime = "nodejs";

export async function GET() {
  const quizzes = await listQuizzes();
  return NextResponse.json({ quizzes });
}
