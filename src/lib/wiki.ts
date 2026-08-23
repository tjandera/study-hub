export const WIKI_RE = /\[\[([^[\]]+)\]\]/g;

export function parseWikiTitles(markdown: string): string[] {
  const titles = new Set<string>();
  for (const match of markdown.matchAll(WIKI_RE)) {
    const title = match[1].split("|")[0]?.trim();
    if (title) titles.add(title);
  }
  return [...titles];
}

export function displayWikiTitle(raw: string) {
  const [title, alias] = raw.split("|");
  return (alias ?? title).trim();
}
