const FOOTER =
  /^(IS\d{3}\s*[-–:].+|Singapore Management University|School of Computing.*|AY\d{4}.*|BPAS\s*[–-]\s*Module.*)$/i;

export function decodeNoteTitle(title: string) {
  let value = title.trim();
  try {
    value = decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    // keep raw
  }
  value = value.replace(/\.(pdf|pptx?|docx?|xlsx?)$/i, "");
  value = value.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  return value || title;
}

export function looksLikeSlides(markdown: string) {
  return (markdown.match(/^## Slide \d+/gm) || []).length >= 3;
}

export function isSlideJunk(line: string) {
  if (!line.trim()) return false;
  const trimmed = line.replace(/^[-*]\s+/, "").trim();
  if (/^\d{1,3}$/.test(trimmed)) return true;
  return FOOTER.test(trimmed);
}

export function cleanStudyMarkdown(markdown: string, title = "") {
  let text = markdown.replace(/\r\n/g, "\n");
  text = text.replace(/%[0-9A-Fa-f]{2}/g, (match) => {
    try {
      return decodeURIComponent(match);
    } catch {
      return match;
    }
  });
  text = text.replace(/^[○●•]\s*/gm, "- ");
  text = text.replace(/^=>\s*/gm, "## ");
  text = text.replace(/^\d{1,3}\s*$/gm, "");
  if (looksLikeSlides(text) || /^## Slide \d+/m.test(text)) {
    text = tidySlides(text, title);
  }
  text = text
    .split("\n")
    .filter((line) => !isSlideJunk(line) || /^#+\s/.test(line.trim()))
    .join("\n");
  text = text.replace(/^# (.+)\.(pdf|pptx?|docx?|xlsx?)\s*$/gim, "# $1");
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  if (title) {
    if (/^# /m.test(text)) text = text.replace(/^# .+$/m, `# ${title}`);
    else text = `# ${title}\n\n${text}`;
    const lines = text.split("\n");
    const rest = lines.slice(1);
    const first = rest.findIndex((line) => line.trim());
    if (first >= 0 && rest[first].trim().toLowerCase() === title.toLowerCase()) {
      rest.splice(first, 1);
      text = [lines[0], ...rest].join("\n").trim();
    }
  }
  return `${text}\n`;
}

function tidySlides(text: string, title: string) {
  const re = /^## Slide \d+(?:\s*[:.–—-]\s*(.*))?\s*$/gm;
  const hits: { index: number; len: number; heading: string }[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    hits.push({
      index: match.index,
      len: match[0].length,
      heading: (match[1] || "").trim(),
    });
  }
  if (!hits.length) return text;

  const out: string[] = [];
  const intro = text.slice(0, hits[0].index).trim();
  if (intro) {
    out.push(intro.replace(/^# .+$/m, title ? `# ${title}` : intro.split("\n")[0]));
  } else if (title) {
    out.push(`# ${title}`);
  }

  for (let i = 0; i < hits.length; i += 1) {
    const start = hits[i].index + hits[i].len;
    const end = i + 1 < hits.length ? hits[i + 1].index : text.length;
    let lines = text
      .slice(start, end)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const noteAt = lines.findIndex((line) => /speaker notes/i.test(line));
    let notes: string[] = [];
    if (noteAt >= 0) {
      notes = lines
        .slice(noteAt + 1)
        .filter((line) => !/^\d+$/.test(line) && !FOOTER.test(line));
      lines = lines.slice(0, noteAt);
    }
    lines = lines.filter((line) => !FOOTER.test(line) && !/^\d+$/.test(line));
    if (!lines.length && !hits[i].heading) continue;
    const heading = hits[i].heading || lines[0]?.replace(/^#+\s*/, "") || `Section ${i + 1}`;
    const rest = lines.filter(
      (line, idx) =>
        !(idx === 0 && !hits[i].heading) &&
        line.toLowerCase() !== heading.toLowerCase(),
    );
    out.push(`## ${heading}`);
    for (const line of rest) {
      if (
        line.length < 90 &&
        !line.startsWith("-") &&
        !line.startsWith("|") &&
        !line.startsWith("```") &&
        !line.startsWith(">")
      ) {
        out.push(`- ${line}`);
      } else {
        out.push(line);
      }
    }
    if (notes.length) {
      out.push("");
      out.push(`> ${notes.join(" ")}`);
    }
    out.push("");
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}
