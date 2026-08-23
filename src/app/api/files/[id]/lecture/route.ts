import { NextResponse } from "next/server";
import { cleanStudyMarkdown, decodeNoteTitle } from "@/lib/clean-notes";
import {
  parsePdfPages,
  parsePptxSlides,
  slidesToMarkdown,
} from "@/lib/extract";
import { readFileBytes, getFileRow } from "@/lib/files";
import { isLectureDeck, mediaKind } from "@/lib/format";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const packed = await readFileBytes(id);
  if (!packed) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { row, bytes } = packed;
  const full = await getFileRow(id);
  const kind = mediaKind(row.mime, row.filename);
  const title = decodeNoteTitle(row.filename);
  const fileUrl = `/api/files/${row.id}`;
  const previewUrl = `/api/files/${row.id}/preview`;
  const extracted = full?.extractedText || "";

  if (isLectureDeck(row.mime, row.filename) && bytes) {
    const parsed = await parsePptxSlides(Buffer.from(bytes));
    const markdown = cleanStudyMarkdown(
      extracted.trim()
        ? extracted
        : slidesToMarkdown(title, parsed),
      title,
    );
    return NextResponse.json({
      kind: "pptx",
      id: row.id,
      filename: row.filename,
      mime: row.mime,
      size: row.size,
      fileUrl,
      previewUrl,
      slideCount: parsed.length,
      markdown,
    });
  }

  if (kind === "pdf" && bytes) {
    const parsed = extracted.trim()
      ? []
      : await parsePdfPages(Buffer.from(bytes));
    const markdown = cleanStudyMarkdown(
      extracted.trim()
        ? extracted
        : slidesToMarkdown(title, parsed),
      title,
    );
    return NextResponse.json({
      kind: "pdf",
      id: row.id,
      filename: row.filename,
      mime: row.mime,
      size: row.size,
      fileUrl,
      previewUrl: fileUrl,
      slideCount: parsed.length || undefined,
      markdown,
    });
  }

  return NextResponse.json({
    kind,
    id: row.id,
    filename: row.filename,
    mime: row.mime,
    size: row.size,
    fileUrl,
    previewUrl:
      kind === "document" || kind === "other" ? previewUrl : fileUrl,
    markdown: extracted
      ? cleanStudyMarkdown(extracted, title)
      : "",
  });
}
