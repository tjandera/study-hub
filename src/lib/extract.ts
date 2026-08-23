import "server-only";

import JSZip from "jszip";
import { isSlideJunk } from "@/lib/clean-notes";

const CODE_EXT =
  /\.(py|ipynb|js|jsx|ts|tsx|mjs|cjs|java|kt|c|cc|cpp|h|hpp|cs|go|rs|rb|php|swift|sql|r|m|scala|sh|bash|zsh|ps1|lua|jl|hs|ex|exs|clj|dart|vue|svelte|html|css|scss|json|yml|yaml|toml|xml|md|markdown|txt|csv|tex)$/i;

export function isCodeFilename(name: string) {
  return /\.(py|ipynb|js|jsx|ts|tsx|java|kt|c|cc|cpp|h|hpp|cs|go|rs|rb|php|swift|sql|r|scala|lua|jl)$/i.test(
    name,
  );
}

export function isMathFilename(name: string) {
  return /\.(tex|r|m|ipynb)$/i.test(name) || /problem|tutorial|ps\d|hw\d/i.test(name);
}

export function isOfficeFilename(name: string) {
  return /\.(pptx|ppsx|pptm|docx|docm|xlsx|xlsm|odt|odp)$/i.test(name);
}

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)));
}

function taggedPlain(xml: string, localName: string) {
  const re = new RegExp(
    `<(?:[\\w.-]+:)?${localName}(?:\\s[^>]*)?>([^<]*)</(?:[\\w.-]+:)?${localName}>`,
    "g",
  );
  const out: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) {
    const text = decodeXml(match[1]);
    if (text) out.push(text);
  }
  return out;
}

function officeParagraphs(xml: string, closeTag: RegExp) {
  const parts = xml.split(closeTag);
  const lines: string[] = [];
  for (const part of parts) {
    const line = taggedPlain(part, "t").join("");
    if (line.trim()) lines.push(line.trim());
  }
  return lines;
}

function numericNameSort(a: string, b: string, re: RegExp) {
  const na = Number(a.match(re)?.[1] || 0);
  const nb = Number(b.match(re)?.[1] || 0);
  return na - nb;
}

export type PptxSlide = {
  index: number;
  lines: string[];
  notes: string;
  images: string[];
};

export async function parsePptxSlides(bytes: Buffer): Promise<PptxSlide[]> {
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files);
  const slides = names
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => numericNameSort(a, b, /slide(\d+)/i));
  const notesFiles = names
    .filter((name) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(name))
    .sort((a, b) => numericNameSort(a, b, /notesSlide(\d+)/i));

  const notesByIndex = new Map<number, string>();
  for (const name of notesFiles) {
    const idx = Number(name.match(/notesSlide(\d+)/i)?.[1] || 0);
    const xml = await zip.files[name].async("string");
    const lines = officeParagraphs(xml, /<\/(?:a:)?p>/).filter(
      (line) => !/^slide\s+\d+$/i.test(line) && line.toLowerCase() !== "notes",
    );
    if (lines.length) notesByIndex.set(idx, lines.join("\n"));
  }

  const out: PptxSlide[] = [];
  for (const name of slides) {
    const idx = Number(name.match(/slide(\d+)/i)?.[1] || 0);
    const xml = await zip.files[name].async("string");
    const lines = officeParagraphs(xml, /<\/(?:a:)?p>/);
    const images: string[] = [];
    const rels = zip.file(`ppt/slides/_rels/slide${idx}.xml.rels`);
    if (rels) {
      const relXml = await rels.async("string");
      for (const match of relXml.matchAll(
        /Type="[^"]*\/image"[^>]*Target="([^"]+)"/gi,
      )) {
        const target = match[1].replace(/\\/g, "/");
        const resolved = pathFromSlideRel(target);
        if (resolved && zip.file(resolved)) images.push(resolved);
      }
    }
    if (!lines.length && !images.length) continue;
    out.push({
      index: idx,
      lines,
      notes: notesByIndex.get(idx) || "",
      images,
    });
  }
  return out;
}

function pathFromSlideRel(target: string) {
  const clean = target.replace(/^\.\.\//, "ppt/").replace(/^\/+/, "");
  if (clean.startsWith("ppt/media/")) return clean;
  if (clean.startsWith("media/")) return `ppt/${clean}`;
  return "";
}

export async function readPptxMedia(bytes: Buffer, mediaPath: string) {
  const safe = mediaPath.replace(/\\/g, "/");
  if (!/^ppt\/media\/[\w.-]+$/i.test(safe)) return null;
  const zip = await JSZip.loadAsync(bytes);
  const file = zip.file(safe);
  if (!file) return null;
  const data = await file.async("nodebuffer");
  const ext = safe.split(".").pop()?.toLowerCase() || "";
  const mime =
    ext === "png"
      ? "image/png"
      : ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : ext === "gif"
          ? "image/gif"
          : ext === "webp"
            ? "image/webp"
            : "application/octet-stream";
  return { bytes: data, mime, filename: safe.split("/").pop() || "image" };
}

export function slidesToMarkdown(title: string, slides: PptxSlide[]) {
  const parts = slides.map((slide) => {
    const useful = slide.lines.filter((line) => !isSlideJunk(line));
    const heading = useful[0] || `Slide ${slide.index}`;
    const rest = useful.slice(1).filter(
      (line) => line.toLowerCase() !== heading.toLowerCase(),
    );
    const bullets = rest.map((line) =>
      line.length < 90 && !line.startsWith("-") && !line.startsWith("|")
        ? `- ${line}`
        : line,
    );
    let block = `## ${heading}\n${bullets.join("\n")}`;
    if (slide.notes.trim() && !/^\d+$/.test(slide.notes.trim())) {
      block += `\n\n> ${slide.notes.trim().replace(/\n+/g, " ")}`;
    }
    return block;
  });
  const body = parts.join("\n\n").trim();
  if (!body) return title ? `# ${title}\n` : "";
  return title && !body.startsWith("#") ? `# ${title}\n\n${body}` : body;
}

export async function parsePdfPages(bytes: Buffer): Promise<PptxSlide[]> {
  try {
    const { extractText } = await import("unpdf");
    const result = await extractText(new Uint8Array(bytes), {
      mergePages: false,
    });
    const pages = Array.isArray(result.text)
      ? result.text
      : [result.text || ""];
    return pages
      .map((text, i) => {
        const lines = String(text || "")
          .split(/\n+/)
          .map((line) => line.replace(/\s+/g, " ").trim())
          .filter(Boolean);
        return {
          index: i + 1,
          lines,
          notes: "",
          images: [] as string[],
        };
      })
      .filter((slide) => slide.lines.length > 0);
  } catch {
    return [];
  }
}

async function extractPptx(bytes: Buffer) {
  const slides = await parsePptxSlides(bytes);
  return slidesToMarkdown("", slides);
}

function docxHeadingLevel(styleVal: string) {
  const heading = styleVal.match(/^Heading(\d)$/i);
  if (heading) return Math.min(Number(heading[1]), 6);
  if (/^Title$/i.test(styleVal)) return 1;
  if (/^Subtitle$/i.test(styleVal)) return 2;
  return 0;
}

// Deterministic, non-AI docx → Markdown conversion: reads Word's own
// paragraph styles (Heading1..6, Title, list numbering) straight out of the
// document XML so uploads can skip the Gemini formatting pass entirely.
async function extractDocx(bytes: Buffer) {
  const zip = await JSZip.loadAsync(bytes);
  const file = zip.file("word/document.xml");
  if (!file) return "";
  const xml = await file.async("string");
  const paragraphs = xml.split(/(?=<w:p[ >])/g).filter((p) => p.includes("</w:p>"));
  const lines: string[] = [];
  for (const para of paragraphs) {
    const text = taggedPlain(para, "t").join("").trim();
    if (!text) continue;
    const styleMatch = para.match(/<w:pStyle\s+w:val="([^"]+)"/);
    const level = styleMatch ? docxHeadingLevel(styleMatch[1]) : 0;
    if (level) {
      lines.push(`${"#".repeat(level)} ${text}`);
      continue;
    }
    if (/<w:numPr>/.test(para)) {
      const ilvl = para.match(/<w:ilvl\s+w:val="(\d+)"/);
      const indent = "  ".repeat(ilvl ? Number(ilvl[1]) : 0);
      lines.push(`${indent}- ${text}`);
      continue;
    }
    lines.push(text);
  }
  return lines.join("\n\n");
}

async function extractXlsx(bytes: Buffer) {
  const zip = await JSZip.loadAsync(bytes);
  const shared = zip.file("xl/sharedStrings.xml");
  if (!shared) return "";
  const xml = await shared.async("string");
  return taggedPlain(xml, "t").join("\n");
}

async function extractOpenDocument(bytes: Buffer) {
  const zip = await JSZip.loadAsync(bytes);
  const file = zip.file("content.xml");
  if (!file) return "";
  const xml = await file.async("string");
  const chunks = xml.split(/<\/text:(?:h|p)>/);
  const lines: string[] = [];
  for (const chunk of chunks) {
    const heading = /<text:h\b[^>]*outline-level="(\d+)"/.exec(chunk);
    const text = chunk
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    if (heading) {
      lines.push(`${"#".repeat(Math.min(Number(heading[1]) || 1, 6))} ${text}`);
    } else {
      lines.push(text);
    }
  }
  return lines.join("\n");
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractFileText(
  mime: string,
  bytes: Buffer,
  filename = "",
) {
  const lower = filename.toLowerCase();
  if (mime.includes("pdf") || lower.endsWith(".pdf")) {
    try {
      const { extractText } = await import("unpdf");
      const result = await extractText(new Uint8Array(bytes), {
        mergePages: true,
      });
      const text = result.text;
      return (Array.isArray(text) ? text.join("\n") : text || "").slice(
        0,
        200_000,
      );
    } catch {
      return "";
    }
  }
  if (/\.(pptx|ppsx|pptm)$/i.test(lower) || mime.includes("presentationml")) {
    try {
      return (await extractPptx(bytes)).slice(0, 200_000);
    } catch {
      return "";
    }
  }
  if (/\.(docx|docm)$/i.test(lower) || mime.includes("wordprocessingml")) {
    try {
      return (await extractDocx(bytes)).slice(0, 200_000);
    } catch {
      return "";
    }
  }
  if (/\.(xlsx|xlsm)$/i.test(lower) || mime.includes("spreadsheetml")) {
    try {
      return (await extractXlsx(bytes)).slice(0, 200_000);
    } catch {
      return "";
    }
  }
  if (/\.(odt|odp)$/i.test(lower) || mime.includes("opendocument")) {
    try {
      return (await extractOpenDocument(bytes)).slice(0, 200_000);
    } catch {
      return "";
    }
  }
  if (lower.endsWith(".ipynb")) {
    return extractNotebook(bytes);
  }
  if (
    mime.includes("html") ||
    lower.endsWith(".html") ||
    lower.endsWith(".htm")
  ) {
    return stripHtml(bytes.toString("utf8")).slice(0, 200_000);
  }
  if (
    mime.startsWith("text/") ||
    mime.includes("markdown") ||
    mime.includes("json") ||
    mime.includes("javascript") ||
    mime.includes("python") ||
    CODE_EXT.test(filename)
  ) {
    return bytes.toString("utf8").slice(0, 200_000);
  }
  return "";
}

function extractNotebook(bytes: Buffer) {
  try {
    const nb = JSON.parse(bytes.toString("utf8")) as {
      cells?: { cell_type?: string; source?: string | string[] }[];
    };
    return (nb.cells || [])
      .map((cell) => {
        const src = Array.isArray(cell.source)
          ? cell.source.join("")
          : cell.source || "";
        return `## ${cell.cell_type || "cell"}\n${src}`;
      })
      .join("\n\n")
      .slice(0, 200_000);
  } catch {
    return bytes.toString("utf8").slice(0, 20_000);
  }
}
