import { NextResponse } from "next/server";
import { deleteQuiz, getQuiz } from "@/lib/quizzes";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const review = new URL(request.url).searchParams.get("review") === "1";
  const loaded = await getQuiz(id, review);
  if (!loaded) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(loaded);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await deleteQuiz(id);
  return NextResponse.json({ ok: true });
}
