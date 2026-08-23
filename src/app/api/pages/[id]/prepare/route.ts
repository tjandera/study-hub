import { NextResponse } from "next/server";
import { prepareWeek } from "@/lib/quizzes";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await request.json().catch(() => ({}));
  try {
    const result = await prepareWeek(id);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Prepare failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
