import { NextResponse } from "next/server";
import { submitAttempt } from "@/lib/quizzes";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json()) as { answers?: Record<string, string> };
  try {
    const result = await submitAttempt(id, body.answers || {});
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Attempt failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
