import { NextResponse } from "next/server";
import { generateWorksheet, listWorksheetTopics } from "@/lib/worksheet";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const topics = await listWorksheetTopics(id);
  return NextResponse.json({ topics });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json()) as {
    topics?: string[];
    includeAnswers?: boolean;
  };
  try {
    const result = await generateWorksheet({
      pageId: id,
      topics: body.topics || [],
      includeAnswers: Boolean(body.includeAnswers),
    });
    return NextResponse.json({
      page: result.page,
      markdown: result.markdown,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Worksheet failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
