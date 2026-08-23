export function relativeTime(value: string) {
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.round(delta / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}

export function prettyFilename(name: string) {
  try {
    return decodeURIComponent(name.replace(/\+/g, " "));
  } catch {
    return name;
  }
}

export function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function isLectureDeck(mime: string, filename = "") {
  return (
    /\.(pptx?|ppsx|pptm)$/i.test(filename) ||
    mime.includes("presentationml") ||
    mime.includes("ms-powerpoint")
  );
}

export function isPreviewable(mime: string, filename = "") {
  const kind = mediaKind(mime, filename);
  if (kind === "image" || kind === "video" || kind === "audio" || kind === "pdf") {
    return true;
  }
  return isLectureDeck(mime, filename);
}

export function mediaKind(
  mime: string,
  filename = "",
): "image" | "video" | "audio" | "pdf" | "document" | "other" {
  const lower = filename.toLowerCase();
  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(lower)) {
    return "image";
  }
  if (mime.startsWith("video/") || /\.(mp4|webm|mov|m4v|ogv)$/i.test(lower)) {
    return "video";
  }
  if (mime.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(lower)) {
    return "audio";
  }
  if (mime === "application/pdf" || lower.endsWith(".pdf")) return "pdf";
  if (
    /\.(pptx?|ppsx|docx?|xlsx?|odt|odp|md|txt|rtf|html?|ipynb|tex)$/i.test(lower) ||
    mime.includes("presentation") ||
    mime.includes("word") ||
    mime.includes("officedocument")
  ) {
    return "document";
  }
  return "other";
}

export function mimeFromName(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".pptx")) {
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  }
  if (lower.endsWith(".ppt")) return "application/vnd.ms-powerpoint";
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (lower.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "text/markdown";
  if (lower.endsWith(".txt") || lower.endsWith(".csv") || lower.endsWith(".sql")) {
    return "text/plain";
  }
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".js")) return "text/javascript";
  if (lower.endsWith(".py")) return "text/x-python";
  if (lower.endsWith(".ipynb")) return "application/x-ipynb+json";
  return "application/octet-stream";
}

export function mediaMarkdown(file: { id: string; filename: string; mime: string }) {
  const src = `/api/files/${file.id}`;
  const kind = mediaKind(file.mime, file.filename);
  if (kind === "image") return `![${file.filename}](${src})`;
  if (kind === "video") return `![video](${src})`;
  if (kind === "audio") return `![audio](${src})`;
  return `[${file.filename}](${src})`;
}
