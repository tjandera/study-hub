import "server-only";

import { spawn } from "child_process";
import { mkdir, readFile, writeFile, access } from "fs/promises";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  parsePptxSlides,
  readPptxMedia,
  type PptxSlide,
} from "@/lib/extract";
import { isLectureDeck, mediaKind } from "@/lib/format";
import { readFileBytes } from "@/lib/files";

const SOFFICE = [
  "/Applications/LibreOffice.app/Contents/MacOS/soffice",
  "/opt/homebrew/bin/soffice",
  "/usr/local/bin/soffice",
  "soffice",
];

function previewDir() {
  return path.join(process.cwd(), ".data", "blob", "previews");
}

function previewPath(fileId: string) {
  return path.join(previewDir(), `${fileId}.pdf`);
}

async function fileExists(file: string) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function findSoffice() {
  for (const candidate of SOFFICE) {
    if (candidate === "soffice") continue;
    if (await fileExists(candidate)) return candidate;
  }
  return null;
}

function run(cmd: string, args: string[], cwd: string) {
  return new Promise<number>((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: "ignore" });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function convertWithLibreOffice(bytes: Buffer, filename: string) {
  const soffice = await findSoffice();
  if (!soffice) return null;
  const tmp = path.join(previewDir(), "tmp");
  await mkdir(tmp, { recursive: true });
  const safe = filename.replace(/[^\w.-]+/g, "_") || "deck.pptx";
  const input = path.join(tmp, `${Date.now()}-${safe}`);
  await writeFile(input, bytes);
  const code = await run(
    soffice,
    ["--headless", "--norestore", "--convert-to", "pdf", "--outdir", tmp, input],
    tmp,
  );
  if (code !== 0) return null;
  const out = input.replace(/\.[^.]+$/, ".pdf");
  try {
    return await readFile(out);
  } catch {
    return null;
  }
}

async function pdfFromSlides(
  title: string,
  slides: PptxSlide[],
  sourceBytes?: Buffer,
) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 842;
  const pageHeight = 595;

  for (const slide of slides) {
    const page = doc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - 48;
    const heading = slide.lines[0] || `Slide ${slide.index}`;
    const body = slide.lines.slice(1);

    page.drawText(`Slide ${slide.index}`, {
      x: 40,
      y,
      size: 10,
      font,
      color: rgb(0.45, 0.45, 0.5),
    });
    y -= 28;
    const titleLines = wrapText(heading, bold, 22, pageWidth - 80);
    for (const line of titleLines.slice(0, 3)) {
      page.drawText(pdfSafe(line), {
        x: 40,
        y,
        size: 22,
        font: bold,
        color: rgb(0.12, 0.12, 0.14),
      });
      y -= 28;
    }
    y -= 8;
    for (const bullet of body.slice(0, 16)) {
      const lines = wrapText(`- ${bullet}`, font, 13, pageWidth - 100);
      for (const line of lines) {
        if (y < 80) break;
        page.drawText(pdfSafe(line), {
          x: 52,
          y,
          size: 13,
          font,
          color: rgb(0.2, 0.2, 0.22),
        });
        y -= 18;
      }
      if (y < 80) break;
    }

    if (sourceBytes && slide.images[0]) {
      const media = await readPptxMedia(sourceBytes, slide.images[0]);
      if (media) {
        try {
          const image =
            media.mime.includes("png")
              ? await doc.embedPng(media.bytes)
              : await doc.embedJpg(media.bytes);
          const maxW = 280;
          const maxH = 160;
          const scale = Math.min(maxW / image.width, maxH / image.height, 1);
          const w = image.width * scale;
          const h = image.height * scale;
          page.drawImage(image, {
            x: pageWidth - w - 40,
            y: 48,
            width: w,
            height: h,
          });
        } catch {
          // skip unreadable image
        }
      }
    }

    page.drawText(pdfSafe(title).slice(0, 60), {
      x: 40,
      y: 28,
      size: 9,
      font,
      color: rgb(0.55, 0.55, 0.58),
    });
  }

  if (!slides.length) {
    const page = doc.addPage([pageWidth, pageHeight]);
    page.drawText(pdfSafe(title || "Preview"), {
      x: 40,
      y: pageHeight - 72,
      size: 20,
      font: bold,
    });
    page.drawText("No slide text could be extracted for a preview PDF.", {
      x: 40,
      y: pageHeight - 110,
      size: 12,
      font,
    });
  }

  return Buffer.from(await doc.save());
}

/** Helvetica/WinAnsi can't encode zero-width spaces and many Unicode glyphs. */
function pdfSafe(text: string) {
  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/…/g, "...")
    .replace(/•/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, (ch) => {
      const bare = ch.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
      return /[\x20-\x7E\xA0-\xFF]/.test(bare) ? bare : "";
    });
}

function wrapText(
  text: string,
  font: { widthOfTextAtSize: (t: string, s: number) => number },
  size: number,
  maxWidth: number,
) {
  const words = pdfSafe(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

export async function ensurePreviewPdf(fileId: string): Promise<{
  bytes: Buffer;
  mime: string;
  filename: string;
  cached: boolean;
  converter: "original" | "libreoffice" | "slides";
}> {
  const packed = await readFileBytes(fileId);
  if (!packed?.bytes) throw new Error("File not found");
  const { row, bytes } = packed;
  const kind = mediaKind(row.mime, row.filename);
  const source = Buffer.from(bytes);

  if (kind === "pdf") {
    return {
      bytes: source,
      mime: "application/pdf",
      filename: row.filename.replace(/\.pdf$/i, "") + ".pdf",
      cached: false,
      converter: "original",
    };
  }

  await mkdir(previewDir(), { recursive: true });
  const cachedPath = previewPath(fileId);
  if (await fileExists(cachedPath)) {
    return {
      bytes: await readFile(cachedPath),
      mime: "application/pdf",
      filename: `${row.filename.replace(/\.[^.]+$/, "")}.pdf`,
      cached: true,
      converter: "slides",
    };
  }

  if (
    isLectureDeck(row.mime, row.filename) ||
    /\.docx?$/i.test(row.filename) ||
    row.mime.includes("word")
  ) {
    const viaOffice = await convertWithLibreOffice(source, row.filename);
    if (viaOffice?.length) {
      await writeFile(cachedPath, viaOffice);
      return {
        bytes: viaOffice,
        mime: "application/pdf",
        filename: `${row.filename.replace(/\.[^.]+$/, "")}.pdf`,
        cached: false,
        converter: "libreoffice",
      };
    }
  }

  let slides: PptxSlide[] = [];
  if (isLectureDeck(row.mime, row.filename)) {
    slides = await parsePptxSlides(source);
  } else {
    const { getFileRow } = await import("@/lib/files");
    const full = await getFileRow(fileId);
    const text = full?.extractedText || "";
    const lines = text
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 200);
    if (lines.length) {
      // Paginate long docs into ~12-line "slides" for PDF paging
      for (let i = 0; i < lines.length; i += 12) {
        slides.push({
          index: slides.length + 1,
          lines: lines.slice(i, i + 12),
          notes: "",
          images: [],
        });
      }
    }
  }

  const pdf = await pdfFromSlides(
    row.filename.replace(/\.[^.]+$/, ""),
    slides,
    isLectureDeck(row.mime, row.filename) ? source : undefined,
  );
  await writeFile(cachedPath, pdf);
  return {
    bytes: pdf,
    mime: "application/pdf",
    filename: `${row.filename.replace(/\.[^.]+$/, "")}.pdf`,
    cached: false,
    converter: "slides",
  };
}
