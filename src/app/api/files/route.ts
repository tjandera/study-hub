import { NextResponse } from "next/server";
import { addFile } from "@/lib/files";
import { ingestUploadedFile } from "@/lib/ingest";
import { importZip } from "@/lib/import-export";
import { listFiles, listSubtreeFiles } from "@/lib/pages";
import { mediaKind } from "@/lib/format";

export const runtime = "nodejs";
export const maxDuration = 300;

function isZipFile(file: File) {
  return (
    /\.zip$/i.test(file.name) ||
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed"
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pageId = url.searchParams.get("pageId") || undefined;
  const deep = url.searchParams.get("deep") === "1";
  if (pageId && deep) {
    const files = await listSubtreeFiles(pageId);
    return NextResponse.json({ files, deep: true });
  }
  const files = await listFiles(pageId);
  return NextResponse.json({ files });
}

export async function POST(request: Request) {
  const form = await request.formData();
  const pageId = String(form.get("pageId") || "");
  const embedMedia = String(form.get("embedMedia") || "") !== "0";
  const formatMode = String(form.get("formatMode") || "ai") === "quick" ? "quick" : "ai";
  const incoming = form.getAll("file");
  if (!pageId) {
    return NextResponse.json({ error: "pageId required" }, { status: 400 });
  }

  const zipFiles = incoming.filter(
    (item): item is File => item instanceof File && isZipFile(item),
  );
  const regularFiles = incoming.filter(
    (item): item is File => item instanceof File && !isZipFile(item),
  );

  const imports: { filename: string; notes: number; files: number; pages: number }[] =
    [];
  for (const zip of zipFiles) {
    try {
      const result = await importZip(await zip.arrayBuffer(), pageId);
      imports.push({ filename: zip.name, ...result });
    } catch (error) {
      console.error("Zip import failed", error);
      imports.push({ filename: zip.name, notes: 0, files: 0, pages: 0 });
    }
  }

  const results = await Promise.all(
    regularFiles.map(async (item) => {
      const record = await addFile(pageId, item);
      let noteId: string | undefined;
      try {
        const ingested = await ingestUploadedFile({
          pageId,
          file: record,
          extractedText: record.extractedText,
          embedMedia:
            embedMedia &&
            ["image", "video", "audio"].includes(
              mediaKind(record.mime, record.filename),
            ),
          formatMode,
        });
        if (ingested.kind === "note" && ingested.noteId && ingested.title) {
          noteId = ingested.noteId;
          return {
            saved: {
              id: record.id,
              pageId: record.pageId,
              filename: record.filename,
              mime: record.mime,
              size: record.size,
              createdAt: record.createdAt,
              extractedChars: record.extractedChars,
              noteId,
            },
            note: { noteId: ingested.noteId, title: ingested.title },
          };
        }
      } catch (error) {
        console.error("Ingest failed", error);
      }
      return {
        saved: {
          id: record.id,
          pageId: record.pageId,
          filename: record.filename,
          mime: record.mime,
          size: record.size,
          createdAt: record.createdAt,
          extractedChars: record.extractedChars,
          noteId,
        },
        note: null as { noteId: string; title: string } | null,
      };
    }),
  );

  const saved = results.map((r) => r.saved);
  const notes = results
    .map((r) => r.note)
    .filter((n): n is { noteId: string; title: string } => Boolean(n));

  return NextResponse.json({ files: saved, notes, imports });
}
