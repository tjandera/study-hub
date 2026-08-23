import "server-only";

import { loadGraph } from "@/lib/graph";
import {
  findPageByTitle,
  getBacklinks,
  getPage,
  listChildPages,
} from "@/lib/pages";
import { parseWikiTitles } from "@/lib/wiki";

export async function getConnections(pageId: string) {
  const page = await getPage(pageId);
  if (!page) return null;
  const [graph, parentGraph, backlinks, children] = await Promise.all([
    loadGraph(pageId),
    page.parentId ? loadGraph(page.parentId) : Promise.resolve({ nodes: [], links: [] }),
    getBacklinks(pageId),
    listChildPages(pageId),
  ]);
  const wiki = parseWikiTitles(page.contentMd);
  const wikiPages = [];
  for (const title of wiki) {
    const match = await findPageByTitle(title, pageId);
    if (match) wikiPages.push(match);
  }
  const neighborTitles = new Set(
    graph.links.flatMap((link) => [link.from, link.to]).map((t) => t.toLowerCase()),
  );
  const related = graph.nodes.filter((node) =>
    neighborTitles.has(node.title.toLowerCase()),
  );
  return {
    page: { id: page.id, title: page.title, parentId: page.parentId },
    graph,
    parentGraph,
    backlinks,
    children,
    wiki,
    wikiPages,
    related,
  };
}
