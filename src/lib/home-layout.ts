export const HOME_BLOCKS = ["welcome", "courses", "recent"] as const;

export type HomeBlockId = (typeof HOME_BLOCKS)[number];

export type HomeLayout = {
  order: HomeBlockId[];
};

const STORAGE = "sh-home-layout";

export const DEFAULT_HOME_LAYOUT: HomeLayout = {
  order: ["welcome", "courses", "recent"],
};

export function blockLabel(id: HomeBlockId) {
  switch (id) {
    case "welcome":
      return "Welcome & shortcuts";
    case "courses":
      return "Courses";
    case "recent":
      return "Recent";
  }
}

export function normalizeHomeLayout(raw: unknown): HomeLayout {
  const order: HomeBlockId[] = [];
  const seen = new Set<string>();
  const list =
    raw && typeof raw === "object" && Array.isArray((raw as HomeLayout).order)
      ? (raw as HomeLayout).order
      : DEFAULT_HOME_LAYOUT.order;
  for (const id of list) {
    if ((HOME_BLOCKS as readonly string[]).includes(id) && !seen.has(id)) {
      seen.add(id);
      order.push(id as HomeBlockId);
    }
  }
  for (const id of HOME_BLOCKS) {
    if (!seen.has(id)) order.push(id);
  }
  return { order };
}

export function readHomeLayout(): HomeLayout {
  if (typeof window === "undefined") return DEFAULT_HOME_LAYOUT;
  try {
    const raw = window.localStorage.getItem(STORAGE);
    if (!raw) return DEFAULT_HOME_LAYOUT;
    return normalizeHomeLayout(JSON.parse(raw));
  } catch {
    return DEFAULT_HOME_LAYOUT;
  }
}

export function writeHomeLayout(layout: HomeLayout) {
  window.localStorage.setItem(
    STORAGE,
    JSON.stringify(normalizeHomeLayout(layout)),
  );
}

export function moveBlock(
  order: HomeBlockId[],
  fromId: HomeBlockId,
  toId: HomeBlockId,
): HomeBlockId[] {
  if (fromId === toId) return order;
  const next = order.filter((id) => id !== fromId);
  const at = next.indexOf(toId);
  if (at < 0) return order;
  next.splice(at, 0, fromId);
  return next;
}
