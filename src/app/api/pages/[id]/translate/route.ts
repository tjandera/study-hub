import { NextResponse } from "next/server";
import { createPage, getPage } from "@/lib/pages";
import { LANGUAGES } from "@/lib/languages";
import { translatePage } from "@/lib/translate";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json()) as { lang?: string };
  const lang = LANGUAGES.find((l) => l.code === body.lang);
  if (!lang) {
    return NextResponse.json({ error: "Unsupported language" }, { status: 400 });
  }

  const page = await getPage(id);
  if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const translated = await translatePage({
      title: page.title,
      contentMd: page.contentMd,
      targetLang: lang.code,
    });
    const created = await createPage({
      parentId: page.parentId,
      type: page.type,
      title: `${translated.title} (${lang.label})`,
      contentMd: translated.contentMd,
    });
    return NextResponse.json({ page: created });
  } catch (error) {
    if (error instanceof Error && error.message === "NO_KEY") {
      return NextResponse.json(
        { error: "Translation needs an AI key configured (GEMINI_API_KEY)" },
        { status: 400 },
      );
    }
    const message = error instanceof Error ? error.message : "Translation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
