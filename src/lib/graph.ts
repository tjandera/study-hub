import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { conceptLinks, concepts } from "@/db/schema";
import { cosine, embedText } from "@/lib/gemini";
import { parseWikiTitles } from "@/lib/wiki";
import { newId } from "@/lib/ids";
import { getPage, listChildPages, listPagesByIds, listSubtreeIds } from "@/lib/pages";

export type IdeaNode = {
  title: string;
  summary: string;
  x?: number | null;
  y?: number | null;
};

export type IdeaGraph = {
  nodes: IdeaNode[];
  links: { from: string; to: string; relation: string }[];
};

const MAX_NODES = 48;
const MAX_LINKS = 96;

export async function saveGraph(pageId: string, graph: IdeaGraph) {
  const db = await getDb();
  const prev = await loadGraph(pageId);
  const prevByTitle = new Map(
    prev.nodes.map((node) => [node.title.toLowerCase(), node]),
  );
  await db.delete(conceptLinks).where(eq(conceptLinks.pageId, pageId));
  await db.delete(concepts).where(eq(concepts.pageId, pageId));
  const now = new Date();
  const seen = new Set<string>();
  for (const node of graph.nodes.slice(0, MAX_NODES)) {
    const title = node.title.trim();
    if (!title || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    const prior = prevByTitle.get(title.toLowerCase());
    await db.insert(concepts).values({
      id: newId(),
      pageId,
      title,
      summary: (node.summary || prior?.summary || "").slice(0, 400),
      posX: node.x ?? prior?.x ?? null,
      posY: node.y ?? prior?.y ?? null,
      createdAt: now,
    });
  }
  for (const link of graph.links.slice(0, MAX_LINKS)) {
    if (!link.from || !link.to) continue;
    await db.insert(conceptLinks).values({
      id: newId(),
      pageId,
      fromTitle: link.from.trim(),
      toTitle: link.to.trim(),
      relation: link.relation.trim() || "related",
      createdAt: now,
    });
  }
}

export async function loadGraph(pageId: string): Promise<IdeaGraph> {
  const db = await getDb();
  const nodes = await db.select().from(concepts).where(eq(concepts.pageId, pageId));
  const links = await db
    .select()
    .from(conceptLinks)
    .where(eq(conceptLinks.pageId, pageId));
  return {
    nodes: nodes.map((n) => ({
      title: n.title,
      summary: n.summary || "",
      x: n.posX,
      y: n.posY,
    })),
    links: links.map((l) => ({
      from: l.fromTitle,
      to: l.toTitle,
      relation: l.relation,
    })),
  };
}

export async function updateGraphPositions(
  pageId: string,
  positions: { title: string; x: number; y: number }[],
) {
  const graph = await loadGraph(pageId);
  const byTitle = new Map(positions.map((p) => [p.title.toLowerCase(), p]));
  graph.nodes = graph.nodes.map((node) => {
    const hit = byTitle.get(node.title.toLowerCase());
    return hit ? { ...node, x: hit.x, y: hit.y } : node;
  });
  await saveGraph(pageId, graph);
  return graph;
}

export async function addGraphNode(
  pageId: string,
  node: { title: string; summary?: string; x?: number; y?: number },
) {
  const graph = await loadGraph(pageId);
  if (!graph.nodes.some((n) => n.title.toLowerCase() === node.title.toLowerCase())) {
    graph.nodes.push({
      title: node.title.trim(),
      summary: node.summary || "",
      x: node.x ?? null,
      y: node.y ?? null,
    });
  }
  await saveGraph(pageId, graph);
  return loadGraph(pageId);
}

export async function removeGraphNode(pageId: string, title: string) {
  const graph = await loadGraph(pageId);
  const key = title.toLowerCase();
  graph.nodes = graph.nodes.filter((n) => n.title.toLowerCase() !== key);
  graph.links = graph.links.filter(
    (l) => l.from.toLowerCase() !== key && l.to.toLowerCase() !== key,
  );
  await saveGraph(pageId, graph);
  return graph;
}

function titleTokens(title: string) {
  return new Set(
    title
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 3),
  );
}

function tokenOverlap(a: string, b: string) {
  const left = titleTokens(a);
  const right = titleTokens(b);
  if (!left.size || !right.size) return 0;
  let hit = 0;
  for (const t of left) if (right.has(t)) hit += 1;
  return hit / Math.min(left.size, right.size);
}

export function graphFromText(markdown: string): IdeaGraph {
  const titles = parseWikiTitles(markdown);
  const headings = [...markdown.matchAll(/^#{1,3}\s+(.+)$/gm)].map((m) =>
    m[1].replace(/\[\[|\]\]/g, "").replace(/Slide\s+\d+/i, "").trim(),
  );
  const nodes = [...new Set([...titles, ...headings])]
    .filter((t) => t.length > 1 && t.length < 80)
    .slice(0, MAX_NODES)
    .map((title) => ({ title, summary: "" }));
  const links: IdeaGraph["links"] = [];
  const seen = new Set<string>();
  const addLink = (from: string, to: string, relation: string) => {
    if (from.toLowerCase() === to.toLowerCase()) return;
    const key = `${from.toLowerCase()}->${to.toLowerCase()}:${relation}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ from, to, relation });
  };
  for (let i = 0; i < nodes.length - 1; i += 1) {
    addLink(nodes[i].title, nodes[i + 1].title, "follows");
  }
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      if (tokenOverlap(nodes[i].title, nodes[j].title) >= 0.5) {
        addLink(nodes[i].title, nodes[j].title, "related");
      }
    }
  }
  return { nodes, links: links.slice(0, MAX_LINKS) };
}

export async function mergeGraph(pageId: string, incoming: IdeaGraph) {
  const existing = await loadGraph(pageId);
  const nodes = [...existing.nodes];
  const seen = new Set(nodes.map((n) => n.title.toLowerCase()));
  for (const node of incoming.nodes) {
    const key = node.title.trim().toLowerCase();
    if (!key || seen.has(key)) {
      if (node.summary) {
        const idx = nodes.findIndex((n) => n.title.toLowerCase() === key);
        if (idx >= 0 && !nodes[idx].summary) nodes[idx].summary = node.summary;
      }
      continue;
    }
    seen.add(key);
    nodes.push(node);
  }
  const links = [...existing.links];
  const linkKey = (link: IdeaGraph["links"][number]) =>
    `${link.from.toLowerCase()}->${link.to.toLowerCase()}:${link.relation}`;
  const seenLinks = new Set(links.map(linkKey));
  for (const link of incoming.links) {
    const key = linkKey(link);
    if (seenLinks.has(key)) continue;
    seenLinks.add(key);
    links.push(link);
  }
  await saveGraph(pageId, {
    nodes: nodes.slice(0, MAX_NODES),
    links: links.slice(0, MAX_LINKS),
  });
}

export async function connectFromMarkdown(pageId: string, markdown: string) {
  const incoming = graphFromText(markdown);
  await mergeGraph(pageId, incoming);
  const page = await getPage(pageId);
  if (page?.parentId) await mergeGraph(page.parentId, incoming);
}

export function injectWikiLinks(markdown: string, titles: string[]) {
  let out = markdown;
  const sorted = [...titles].sort((a, b) => b.length - a.length);
  for (const title of sorted) {
    if (title.length < 3) continue;
    const re = new RegExp(`(^|[^\\[])\\b(${escapeReg(title)})\\b(?!\\])`, "i");
    out = out.replace(re, `$1[[${title}]]`);
  }
  return out;
}

function escapeReg(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Merge topic nodes across a page and its notes, linking related ideas. */
export async function connectTopics(pageId: string) {
  const page = await getPage(pageId);
  if (!page) return { nodes: 0, links: 0 };
  const ids = await listSubtreeIds(pageId);
  const notes = await listPagesByIds(ids);
  const children = await listChildPages(pageId);

  const nodes: IdeaNode[] = [];
  const seen = new Set<string>();
  const addNode = (title: string, summary: string) => {
    const key = title.trim().toLowerCase();
    if (!key || key.length < 2 || key.length > 80 || seen.has(key)) return;
    seen.add(key);
    nodes.push({ title: title.trim(), summary: summary.slice(0, 220) });
  };

  for (const note of notes) {
    const local = graphFromText(note.contentMd || "");
    for (const node of local.nodes) addNode(node.title, node.summary || note.title);
    addNode(
      note.title,
      (note.contentMd || "").replace(/[#*_`]/g, " ").replace(/\s+/g, " ").slice(0, 180),
    );
  }

  const capped = nodes.slice(0, MAX_NODES);
  const links: IdeaGraph["links"] = [];
  const linkSeen = new Set<string>();
  const addLink = (from: string, to: string, relation: string) => {
    if (!from || !to || from.toLowerCase() === to.toLowerCase()) return;
    const key = `${from.toLowerCase()}->${to.toLowerCase()}`;
    if (linkSeen.has(key)) return;
    linkSeen.add(key);
    links.push({ from, to, relation });
  };

  for (const note of notes) {
    for (const title of parseWikiTitles(note.contentMd || "")) {
      addLink(note.title, title, "mentions");
    }
    const local = graphFromText(note.contentMd || "");
    for (const link of local.links) addLink(link.from, link.to, link.relation);
  }

  const vecs = await Promise.all(
    capped.map((node) =>
      embedText(`${node.title} ${node.summary}`, "SEMANTIC_SIMILARITY"),
    ),
  );
  for (let i = 0; i < capped.length; i += 1) {
    for (let j = i + 1; j < capped.length; j += 1) {
      const sim = cosine(vecs[i], vecs[j]);
      const overlap = tokenOverlap(capped[i].title, capped[j].title);
      if (sim >= 0.78 || overlap >= 0.45) {
        addLink(capped[i].title, capped[j].title, "related");
      }
    }
  }

  const graph: IdeaGraph = {
    nodes: capped,
    links: links.slice(0, MAX_LINKS),
  };
  await mergeGraph(pageId, graph);
  for (const child of children.slice(0, 16)) {
    await mergeGraph(child.id, graph);
  }
  return { nodes: graph.nodes.length, links: graph.links.length };
}
