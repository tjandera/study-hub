import { NextResponse } from "next/server";
import {
  dumpPaste,
  dumpStatus,
  ingestDumpFiles,
  organizeDump,
} from "@/lib/dump";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const status = await dumpStatus(id);
  return NextResponse.json(status);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const contentType = request.headers.get("content-type") || "";

  try {
    let files = 0;
    let notes = 0;
    let quizzes = true;
    let organize = true;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      quizzes = String(form.get("quizzes") || "1") !== "0";
      organize = String(form.get("organize") || "1") !== "0";
      const incoming = form.getAll("file").filter((item): item is File => item instanceof File);
      if (incoming.length) {
        const ingested = await ingestDumpFiles(id, incoming);
        files += ingested.files;
        notes += ingested.notes;
      }
      const pasteBody = String(form.get("pasteBody") || "").trim();
      if (pasteBody) {
        await dumpPaste(id, String(form.get("pasteTitle") || ""), pasteBody);
        notes += 1;
      }
    } else {
      const body = (await request.json().catch(() => ({}))) as {
        quizzes?: boolean;
        organize?: boolean;
        pasteTitle?: string;
        pasteBody?: string;
      };
      quizzes = body.quizzes !== false;
      organize = body.organize !== false;
      if (body.pasteBody?.trim()) {
        await dumpPaste(id, body.pasteTitle || "", body.pasteBody);
        notes += 1;
      }
    }

    if (!organize) {
      return NextResponse.json({ files, notes, organized: false });
    }

    const result = await organizeDump(id, { quizzes });
    return NextResponse.json({ ...result, files: result.files + files, notes: result.notes + notes });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dump failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
