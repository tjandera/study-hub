import { NextResponse } from "next/server";
import { readFileBytes, removeFile } from "@/lib/files";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const packed = await readFileBytes(id);
  if (!packed) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { row, bytes } = packed;
  const inline =
    row.mime.startsWith("image/") || row.mime === "application/pdf";
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": row.mime,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(row.filename)}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ok = await removeFile(id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
