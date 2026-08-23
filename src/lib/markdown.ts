import type { JSONContent } from "@tiptap/core";

type Mark = { type: string; attrs?: Record<string, string> };

function marksWrap(text: string, marks?: Mark[]) {
  if (!marks?.length) return text;
  let out = text;
  const types = new Set(marks.map((m) => m.type));
  if (types.has("code")) out = `\`${out}\``;
  if (types.has("bold")) out = `**${out}**`;
  if (types.has("italic")) out = `*${out}*`;
  if (types.has("strike")) out = `~~${out}~~`;
  if (types.has("highlight")) out = `==${out}==`;
  if (types.has("underline")) out = `<u>${out}</u>`;
  const link = marks.find((m) => m.type === "link");
  if (link?.attrs?.href) out = `[${out}](${link.attrs.href})`;
  return out;
}

function inline(nodes?: JSONContent[]): string {
  if (!nodes) return "";
  return nodes
    .map((node) => {
      if (node.type === "text") return marksWrap(node.text || "", node.marks as Mark[]);
      if (node.type === "wikiLink") return `[[${node.attrs?.title || ""}]]`;
      if (node.type === "hardBreak") return "\n";
      if (node.type === "image") {
        const alt = node.attrs?.alt || "";
        const src = node.attrs?.src || "";
        return `![${alt}](${src})`;
      }
      return inline(node.content);
    })
    .join("");
}

function cellText(cell: JSONContent) {
  const parts: string[] = [];
  const walk = (node: JSONContent) => {
    if (node.type === "text") {
      parts.push(marksWrap(node.text || "", node.marks as Mark[]));
      return;
    }
    if (node.type === "hardBreak") {
      parts.push(" ");
      return;
    }
    if (node.content) node.content.forEach(walk);
  };
  walk(cell);
  return parts.join(" ").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

function tableToMarkdown(node: JSONContent) {
  const rows = node.content || [];
  const cellsOf = (row: JSONContent) => (row.content || []).map(cellText);
  if (!rows.length) return "";
  const header = cellsOf(rows[0]);
  const width = Math.max(header.length, ...rows.map((row) => (row.content || []).length), 1);
  const pad = (cells: string[]) =>
    Array.from({ length: width }, (_, i) => cells[i] || "");
  const lined = (cells: string[]) => `| ${pad(cells).join(" | ")} |`;
  const lines = [
    lined(header),
    `| ${Array.from({ length: width }, () => "---").join(" | ")} |`,
  ];
  for (const row of rows.slice(1)) {
    lines.push(lined(cellsOf(row)));
  }
  return `${lines.join("\n")}\n`;
}

export function jsonToMarkdown(doc: JSONContent | null | undefined): string {
  if (!doc) return "";
  const blocks = doc.type === "doc" ? doc.content || [] : [doc];
  const lines: string[] = [];

  const walk = (node: JSONContent, listPrefix = "") => {
    switch (node.type) {
      case "heading": {
        const level = Math.min(node.attrs?.level || 1, 6);
        lines.push(`${"#".repeat(level)} ${inline(node.content)}`);
        lines.push("");
        break;
      }
      case "paragraph":
        lines.push(inline(node.content));
        lines.push("");
        break;
      case "blockquote":
        for (const child of node.content || []) {
          const inner = jsonToMarkdown({ type: "doc", content: [child] }).trim();
          inner.split("\n").forEach((l) => lines.push(l ? `> ${l}` : ">"));
        }
        lines.push("");
        break;
      case "callout": {
        const kind = String(node.attrs?.kind || "NOTE").toUpperCase();
        lines.push(`> [!${kind}]`);
        const inner = jsonToMarkdown({ type: "doc", content: node.content }).trim();
        inner.split("\n").forEach((l) => lines.push(l ? `> ${l}` : ">"));
        lines.push("");
        break;
      }
      case "codeBlock":
        lines.push("```" + (node.attrs?.language || ""));
        lines.push(inline(node.content));
        lines.push("```");
        lines.push("");
        break;
      case "horizontalRule":
        lines.push("---");
        lines.push("");
        break;
      case "bulletList":
        for (const item of node.content || []) {
          const text = inline(item.content?.[0]?.content);
          lines.push(`${listPrefix}- ${text}`);
          const rest = item.content?.slice(1) || [];
          rest.forEach((child) => walk(child, listPrefix + "  "));
        }
        lines.push("");
        break;
      case "orderedList": {
        let i = node.attrs?.start || 1;
        for (const item of node.content || []) {
          const text = inline(item.content?.[0]?.content);
          lines.push(`${listPrefix}${i}. ${text}`);
          i += 1;
          const rest = item.content?.slice(1) || [];
          rest.forEach((child) => walk(child, listPrefix + "  "));
        }
        lines.push("");
        break;
      }
      case "taskList":
        for (const item of node.content || []) {
          const box = item.attrs?.checked ? "x" : " ";
          const text = inline(item.content?.[0]?.content);
          lines.push(`${listPrefix}- [${box}] ${text}`);
        }
        lines.push("");
        break;
      case "table":
        lines.push(tableToMarkdown(node).trimEnd());
        lines.push("");
        break;
      case "image":
        lines.push(`![${node.attrs?.alt || ""}](${node.attrs?.src || ""})`);
        lines.push("");
        break;
      case "videoBlock":
        lines.push(`![video](${node.attrs?.src || ""})`);
        lines.push("");
        break;
      case "audioBlock":
        lines.push(`![audio](${node.attrs?.src || ""})`);
        lines.push("");
        break;
      case "youtube":
        lines.push(`![youtube](${node.attrs?.src || ""})`);
        lines.push("");
        break;
      default:
        if (node.content) node.content.forEach((child) => walk(child, listPrefix));
    }
  };

  blocks.forEach((b) => walk(b));
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + (blocks.length ? "\n" : "");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function youtubeEmbed(url: string) {
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{6,})/,
  );
  const id = match?.[1];
  const src = id ? `https://www.youtube-nocookie.com/embed/${id}` : url;
  return `<div data-youtube-video><iframe src="${escapeHtml(src)}" allowfullscreen></iframe></div>`;
}

function preprocess(markdown: string) {
  let out = markdown;
  out = out.replace(
    /^> \[!(\w+)\]\s*\n((?:>.*\n?)*)/gm,
    (_, kind: string, body: string) => {
      const text = body
        .split("\n")
        .map((line) => line.replace(/^>\s?/, ""))
        .join("\n")
        .trim();
      return `<aside data-callout data-kind="${escapeHtml(kind.toLowerCase())}"><p>${escapeHtml(text)}</p></aside>\n`;
    },
  );
  out = out.replace(/!\[video\]\(([^)]+)\)/g, '<video data-media-video src="$1" controls></video>');
  out = out.replace(/!\[audio\]\(([^)]+)\)/g, '<audio data-media-audio src="$1" controls></audio>');
  out = out.replace(/!\[youtube\]\(([^)]+)\)/g, (_, src) => youtubeEmbed(src));
  return out;
}

function linkifyWiki(markdown: string) {
  const fences = markdown.split(/(```[\s\S]*?```)/g);
  return fences
    .map((chunk) => {
      if (chunk.startsWith("```")) return chunk;
      const parts = chunk.split(/(`[^`]*`)/g);
      return parts
        .map((part) => {
          if (part.startsWith("`")) return part;
          return part.replace(/\[\[([^[\]]+)\]\]/g, (_, raw) => {
            const title = String(raw).split("|")[0].trim();
            return `<span data-wiki-link data-title="${escapeHtml(title)}">${escapeHtml(title)}</span>`;
          });
        })
        .join("");
    })
    .join("");
}

export async function markdownToHtml(markdown: string) {
  const { marked } = await import("marked");
  marked.setOptions({ gfm: true, breaks: false });
  return marked.parse(linkifyWiki(preprocess(markdown)), { async: false }) as string;
}
