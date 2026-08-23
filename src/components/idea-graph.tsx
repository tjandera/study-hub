"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Graph = {
  nodes: { title: string; summary: string; x?: number | null; y?: number | null }[];
  links: { from: string; to: string; relation: string }[];
};

type SimNode = {
  title: string;
  summary: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

const WIDTH = 920;
const HEIGHT = 560;

function seedLayout(nodes: Graph["nodes"]): SimNode[] {
  const cx = WIDTH / 2;
  const cy = HEIGHT / 2;
  const r = Math.min(WIDTH, HEIGHT) / 2 - 90;
  return nodes.map((node, i) => {
    const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2 - Math.PI / 2;
    return {
      title: node.title,
      summary: node.summary,
      x: typeof node.x === "number" ? node.x : cx + Math.cos(angle) * r,
      y: typeof node.y === "number" ? node.y : cy + Math.sin(angle) * r,
      vx: 0,
      vy: 0,
    };
  });
}

function stepPhysics(
  nodes: SimNode[],
  links: Graph["links"],
  pinned: string | null,
) {
  const n = nodes.length;
  if (!n) return;
  const rest = 150 + Math.min(40, n * 2);
  const kSpring = 0.045;
  const kRepel = 2800;
  const kDamp = 0.82;
  const kCenter = 0.008;
  const cx = nodes.reduce((s, node) => s + node.x, 0) / n;
  const cy = nodes.reduce((s, node) => s + node.y, 0) / n;

  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      let dx = nodes[j].x - nodes[i].x;
      let dy = nodes[j].y - nodes[i].y;
      let dist = Math.hypot(dx, dy) || 0.01;
      if (dist < 18) dist = 18;
      const force = kRepel / (dist * dist);
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      nodes[i].vx -= fx;
      nodes[i].vy -= fy;
      nodes[j].vx += fx;
      nodes[j].vy += fy;
    }
  }

  const byTitle = new Map(nodes.map((node) => [node.title.toLowerCase(), node]));
  for (const link of links) {
    const a = byTitle.get(link.from.toLowerCase());
    const b = byTitle.get(link.to.toLowerCase());
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 0.01;
    const pull = (dist - rest) * kSpring;
    const fx = (dx / dist) * pull;
    const fy = (dy / dist) * pull;
    a.vx += fx;
    a.vy += fy;
    b.vx -= fx;
    b.vy -= fy;
  }

  for (const node of nodes) {
    if (pinned && node.title === pinned) {
      node.vx = 0;
      node.vy = 0;
      continue;
    }
    node.vx += (WIDTH / 2 - cx) * kCenter * 0.15;
    node.vy += (HEIGHT / 2 - cy) * kCenter * 0.15;
    node.vx *= kDamp;
    node.vy *= kDamp;
    node.x += node.vx;
    node.y += node.vy;
  }
}

export function IdeaGraph({
  pageId,
  compact = false,
}: {
  pageId: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [graph, setGraph] = useState<Graph | null>(null);
  const [nodes, setNodes] = useState<SimNode[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [cam, setCam] = useState({ x: 0, y: 0, k: 1 });
  const drag = useRef<{ title: string; dx: number; dy: number } | null>(null);
  const pan = useRef<{
    sx: number;
    sy: number;
    cx: number;
    cy: number;
    k: number;
  } | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const graphRef = useRef<Graph | null>(null);
  const camRef = useRef(cam);
  const raf = useRef<number>(0);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const settling = useRef(false);
  camRef.current = cam;

  const persist = (list: SimNode[]) => {
    void fetch(`/api/pages/${pageId}/graph`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        positions: list.map((n) => ({ title: n.title, x: n.x, y: n.y })),
      }),
    });
  };

  const tick = () => {
    const current = nodesRef.current;
    const g = graphRef.current;
    if (!g) return;
    stepPhysics(current, g.links, drag.current?.title || null);
    nodesRef.current = current.map((n) => ({ ...n }));
    setNodes(nodesRef.current);
    const energy = current.reduce((s, n) => s + n.vx * n.vx + n.vy * n.vy, 0);
    if (drag.current || energy > 0.35) {
      raf.current = requestAnimationFrame(tick);
    } else if (settling.current) {
      settling.current = false;
      persist(current);
    }
  };

  const startSim = () => {
    cancelAnimationFrame(raf.current);
    settling.current = true;
    raf.current = requestAnimationFrame(tick);
  };

  const load = async () => {
    const res = await fetch(`/api/pages/${pageId}/graph`);
    const json = await res.json();
    const next = (json.graph || { nodes: [], links: [] }) as Graph;
    const seeded = seedLayout(next.nodes);
    setGraph(next);
    graphRef.current = next;
    nodesRef.current = seeded;
    setNodes(seeded);
    startSim();
  };

  useEffect(() => {
    void load();
    return () => cancelAnimationFrame(raf.current);
  }, [pageId]);

  const worldPoint = (event: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const c = camRef.current;
    const rect = svg.getBoundingClientRect();
    const vw = WIDTH / c.k;
    const vh = HEIGHT / c.k;
    return {
      x: c.x + ((event.clientX - rect.left) / rect.width) * vw,
      y: c.y + ((event.clientY - rect.top) / rect.height) * vh,
    };
  };

  const byTitle = useMemo(
    () => new Map(nodes.map((n) => [n.title.toLowerCase(), n])),
    [nodes],
  );

  const openNote = async (title: string, summary = "") => {
    const res = await fetch(`/api/pages?title=${encodeURIComponent(title)}`);
    const json = await res.json();
    if (json.page) {
      router.push(`/p/${json.page.id}`);
      return;
    }
    const created = await fetch("/api/pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId: pageId, title, contentMd: summary }),
    }).then((r) => r.json());
    if (created.page) router.push(`/p/${created.page.id}`);
  };

  if (!graph) return null;

  return (
    <section className={compact ? "" : "mb-8"}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          {!compact && <h2 className="text-sm font-medium">Idea graph</h2>}
          <p className="text-xs text-muted-foreground">
            {compact
              ? "Drag nodes. Double-click to open."
              : "Drag a node — linked ideas follow. Scroll to zoom, drag the canvas to pan."}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add idea"
            className="h-7 w-36"
            onKeyDown={async (e) => {
              if (e.key !== "Enter" || !draft.trim()) return;
              await fetch(`/api/pages/${pageId}/graph`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ add: { title: draft.trim() } }),
              });
              setDraft("");
              await load();
            }}
          />
          <Button
            size="icon-xs"
            variant="outline"
            onClick={async () => {
              if (!draft.trim()) return;
              await fetch(`/api/pages/${pageId}/graph`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ add: { title: draft.trim() } }),
              });
              setDraft("");
              await load();
            }}
            aria-label="Add node"
          >
            <Plus />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={() => {
              const next = seedLayout(
                (graph.nodes || []).map((n) => ({ ...n, x: null, y: null })),
              );
              nodesRef.current = next;
              setNodes(next);
              setCam({ x: 0, y: 0, k: 1 });
              startSim();
            }}
            aria-label="Reset layout"
          >
            <RotateCcw />
          </Button>
        </div>
      </div>

      {graph.nodes.length === 0 ? (
        <p className="rounded-xl border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
          Upload notes or prepare this week to grow the graph.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-muted/20">
          <svg
            ref={svgRef}
            viewBox={`${cam.x} ${cam.y} ${WIDTH / cam.k} ${HEIGHT / cam.k}`}
            className={
              compact
                ? "h-56 w-full touch-none"
                : "h-[22rem] w-full touch-none @[48rem]/shell:h-[34rem]"
            }
            onWheel={(e) => {
              e.preventDefault();
              const factor = e.deltaY > 0 ? 0.92 : 1.08;
              const p = worldPoint(e);
              const nextK = Math.min(2.4, Math.max(0.45, cam.k * factor));
              const vw = WIDTH / cam.k;
              const vh = HEIGHT / cam.k;
              const nw = WIDTH / nextK;
              const nh = HEIGHT / nextK;
              setCam({
                k: nextK,
                x: p.x - ((p.x - cam.x) / vw) * nw,
                y: p.y - ((p.y - cam.y) / vh) * nh,
              });
            }}
            onPointerDown={(e) => {
              if (drag.current) return;
              if ((e.target as Element).closest("[data-node]")) return;
              pan.current = {
                sx: e.clientX,
                sy: e.clientY,
                cx: camRef.current.x,
                cy: camRef.current.y,
                k: camRef.current.k,
              };
              (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (drag.current) {
                const p = worldPoint(e);
                nodesRef.current = nodesRef.current.map((n) =>
                  n.title === drag.current?.title
                    ? {
                        ...n,
                        x: p.x - drag.current.dx,
                        y: p.y - drag.current.dy,
                        vx: 0,
                        vy: 0,
                      }
                    : n,
                );
                startSim();
                return;
              }
              if (pan.current) {
                const svg = svgRef.current;
                if (!svg) return;
                const rect = svg.getBoundingClientRect();
                const vw = WIDTH / pan.current.k;
                const vh = HEIGHT / pan.current.k;
                const dx = ((e.clientX - pan.current.sx) / rect.width) * vw;
                const dy = ((e.clientY - pan.current.sy) / rect.height) * vh;
                setCam({
                  k: pan.current.k,
                  x: pan.current.cx - dx,
                  y: pan.current.cy - dy,
                });
              }
            }}
            onPointerUp={() => {
              if (drag.current) {
                drag.current = null;
                startSim();
              }
              pan.current = null;
            }}
          >
            <defs>
              <pattern id="graph-grid" width="28" height="28" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="1" className="fill-border" />
              </pattern>
            </defs>
            <rect
              x={cam.x - 2000}
              y={cam.y - 2000}
              width={WIDTH / cam.k + 4000}
              height={HEIGHT / cam.k + 4000}
              fill="url(#graph-grid)"
              className="text-border"
            />
            {graph.links.map((link, i) => {
              const a = byTitle.get(link.from.toLowerCase());
              const b = byTitle.get(link.to.toLowerCase());
              if (!a || !b) return null;
              return (
                <g key={i}>
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke="currentColor"
                    className="text-foreground/25"
                    strokeWidth="1.6"
                  />
                  <text
                    x={(a.x + b.x) / 2}
                    y={(a.y + b.y) / 2 - 8}
                    textAnchor="middle"
                    className="fill-muted-foreground"
                    fontSize="9"
                  >
                    {link.relation}
                  </text>
                </g>
              );
            })}
            {nodes.map((node) => {
              const active = selected === node.title;
              return (
                <g
                  key={node.title}
                  data-node={node.title}
                  style={{ cursor: "grab" }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    const p = worldPoint(e);
                    drag.current = { title: node.title, dx: p.x - node.x, dy: p.y - node.y };
                    setSelected(node.title);
                    svgRef.current?.setPointerCapture?.(e.pointerId);
                    startSim();
                  }}
                  onDoubleClick={() => void openNote(node.title, node.summary)}
                >
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={active ? 24 : 20}
                    className={
                      active
                        ? "fill-primary/20 stroke-primary"
                        : "fill-background stroke-foreground/40"
                    }
                    strokeWidth="1.7"
                  />
                  <text
                    x={node.x}
                    y={node.y + 36}
                    textAnchor="middle"
                    className="fill-foreground"
                    fontSize="11"
                  >
                    {node.title.slice(0, 28)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {selected && (
        <div className="mt-3 flex items-start justify-between gap-3 rounded-lg border bg-background p-3 text-sm">
          <div>
            <div className="font-medium">{selected}</div>
            <p className="text-xs text-muted-foreground">
              {nodes.find((n) => n.title === selected)?.summary || "No summary yet."}
            </p>
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={() => void openNote(selected)}>
              Open
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={async () => {
                await fetch(`/api/pages/${pageId}/graph`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ remove: selected }),
                });
                setSelected(null);
                await load();
              }}
              aria-label="Remove node"
            >
              <Trash2 />
            </Button>
          </div>
        </div>
      )}

      {!compact && (
        <ul className="mt-3 flex flex-wrap gap-2 text-sm">
          {graph.nodes.map((node) => (
            <li key={node.title}>
              <Link
                href={`/p/${pageId}`}
                className="rounded-full border px-2 py-0.5 hover:bg-muted"
                onClick={(e) => {
                  e.preventDefault();
                  void openNote(node.title, node.summary);
                }}
              >
                [[{node.title}]]
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
