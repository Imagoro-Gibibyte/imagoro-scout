/**
 * sidebar.ts — the registry-derived sidebar model (L2).
 *
 * The sidebar is DATA, not markup: a declaration of groups/entries that map 1:1
 * to a harness tool id or a block id, pinned to a concrete capability from the
 * L3 capability matrix. Iconography is a single icon set keyed by concept id so
 * CLI, GUI and docs render the same glyph. Anything new that maps to a tool or
 * block surfaces by adding a row here — no bespoke wiring in an app.
 *
 * Contract honoured by the caller:
 *   - rendering an entry never executes anything (dispatch is upstream in the app)
 *   - tool entries are gated by the L3 broker on activation (confirmed only)
 *   - audit is enterprise-only via capability, everything else is capability-pinned
 */
import { roleCanCapability } from "./broker.js";

export type SidebarGroupId = "ask" | "crew" | "data" | "explore" | "system";

export type SidebarIconName =
  | "spark" | "chat-bubbles" | "pulse" | "people" | "stack" | "wrench"
  | "flow" | "layers" | "pencil-layers" | "funnel" | "chart" | "id-badge"
  | "shield-list" | "nodes" | "route" | "map" | "cube" | "terminal" | "cloud-sun";

export interface SidebarEntry {
  id: string;
  label: string;
  icon: SidebarIconName;
  /** Harness tool id this entry invokes (L3-gated on activation). */
  tool?: string;
  /** Block id this entry opens. */
  block?: string;
  /** Capability required to use the entry; absent = usable by any role. */
  requiredCapability?: string;
  /** Writes/system: renders a lock affordance; never fires unconfirmed. */
  dangerous?: boolean;
}

export interface SidebarGroup {
  id: SidebarGroupId;
  label: string;
  entries: SidebarEntry[];
}

export const SIDEBAR_GROUPS: readonly SidebarGroup[] = [
  {
    id: "ask",
    label: "Ask",
    entries: [
      { id: "ask.intent", label: "What do you want to do today?", icon: "spark", block: "imagoro.intent", requiredCapability: "engine:view" },
      { id: "ask.chat", label: "Chat (crew role)", icon: "chat-bubbles", tool: "scout_chat", block: "imagoro.chat", requiredCapability: "engine:chat" }
    ]
  },
  {
    id: "crew",
    label: "Crew",
    entries: [
      { id: "crew.status", label: "Status", icon: "pulse", tool: "scout_status", requiredCapability: "engine:view" },
      { id: "crew.roster", label: "Roster", icon: "people", tool: "scout_roster", requiredCapability: "engine:view" },
      { id: "crew.models", label: "Models", icon: "stack", tool: "scout_models", requiredCapability: "engine:view" },
      { id: "crew.dev", label: "Dev helper", icon: "wrench", tool: "scout_dev", requiredCapability: "engine:dev" },
      { id: "crew.orchestrate", label: "Orchestrate", icon: "flow", tool: "scout_crew", requiredCapability: "engine:crew" }
    ]
  },
  {
    id: "data",
    label: "Data",
    entries: [
      { id: "data.blackboard-read", label: "Blackboard (read)", icon: "layers", tool: "scout_blackboard_read", block: "imagoro.blackboard", requiredCapability: "data:read" },
      { id: "data.blackboard-write", label: "Blackboard (write)", icon: "pencil-layers", tool: "scout_blackboard_write", requiredCapability: "data:write", dangerous: true },
      { id: "data.pipeline", label: "Pipeline", icon: "funnel", block: "imagoro.pipeline", requiredCapability: "data:read" },
      { id: "data.metrics", label: "Metrics", icon: "chart", block: "imagoro.metrics", requiredCapability: "data:read" },
      { id: "data.registrations", label: "Registrations", icon: "id-badge", block: "imagoro.registrations", requiredCapability: "data:read" },
      { id: "data.audit", label: "Audit", icon: "shield-list", block: "imagoro.audit", requiredCapability: "system:audit", dangerous: true }
    ]
  },
  {
    id: "explore",
    label: "Explore",
    entries: [
      { id: "explore.graph", label: "Graph", icon: "nodes", block: "imagoro.graph", requiredCapability: "explore:graph" },
      { id: "explore.route", label: "Route", icon: "route", block: "imagoro.route", requiredCapability: "explore:route" },
      { id: "explore.map", label: "Map", icon: "map", block: "imagoro.map", requiredCapability: "explore:map" },
      { id: "explore.visualizer", label: "Visualizer", icon: "cube", block: "imagoro.visualizer", requiredCapability: "explore:visualizer" }
    ]
  },
  {
    id: "system",
    label: "System",
    entries: [
      { id: "system.console", label: "Console", icon: "terminal", block: "imagoro.console", requiredCapability: "system:console" },
      { id: "system.weather", label: "Weather (engine/local)", icon: "cloud-sun", block: "imagoro.weather", requiredCapability: "system:engine" }
    ]
  }
] as const;

/**
 * The single icon set, keyed by concept id (one glyph per sidebar entry).
 * Each value is a list of SVG <path> `d` strings on a 24x24 viewBox, fill-style.
 */
export const SIDEBAR_ICONS: Record<SidebarIconName, readonly string[]> = {
  spark: ["M12 2l2.2 6.1L20 10l-5.8 1.9L12 18l-2.2-6.1L4 10l5.8-1.9z", "M12 21v1"],
  "chat-bubbles": ["M3 6a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H9l-4 3.2V13H5a2 2 0 0 1-2-2z", "M17.5 12.5h1A2.5 2.5 0 0 1 21 15v2a2.5 2.5 0 0 1-2.5 2.5h-2"],
  pulse: ["M2 12h4l2.5-6 4 12 3-9 1.5 3H22"],
  people: ["M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z", "M3.5 20c.7-3.4 2.8-5 5.5-5s4.8 1.6 5.5 5z", "M16 10a3 3 0 1 0 0-6", "M17.5 15.5c1.7.4 2.9 1.8 3.4 4.5"],
  stack: ["M4 4h16v5H4z", "M4 10h16v5H4z", "M4 16h16v4H4z"],
  wrench: ["M14.7 6.3a4.2 4.2 0 0 0-5.3 1.3 4.2 4.2 0 0 0 1.2 5.8l-6.9 6.9 2 2 6.9-6.9a4.2 4.2 0 0 0 5.8 1.2 4.2 4.2 0 0 0 1.3-5.3l-3.2 2.5-2-2z"],
  flow: ["M6.5 5a3 3 0 1 0 0 5 3 3 0 0 0 0-5z", "M17.5 14a3 3 0 1 0 0 5 3 3 0 0 0 0-5z", "M9.5 7.5h4A3 3 0 0 1 16.5 11v0", "M9.5 16.5h4"],
  layers: ["M12 3l9 5-9 5-9-5z", "M3 12l9 5 9-5", "M3 16.5l9 5 9-5"],
  "pencil-layers": ["M12 3l9 5-9 5-9-5z", "M3 12l9 5 9-5", "M15.5 14.5l4-4.5v0", "M16 13l3.5-1 2.5 2.5-1.5 3.5z"],
  funnel: ["M3 4h18l-7 8.5V19l-4 2v-8.5z"],
  chart: ["M4 20V10h4v10z", "M10 20V4h4v16z", "M16 20v-7h4v7z"],
  "id-badge": ["M8 2h8a2 2 0 0 1 2 2v18l-6-3-6 3V4a2 2 0 0 1 2-2z", "M12 6a2.2 2.2 0 1 0 0 4.4A2.2 2.2 0 0 0 12 6z", "M9 16h6"],
  "shield-list": ["M12 2.5l8 3v6c0 4.5-3 7.7-8 10-5-2.3-8-5.5-8-10v-6z", "M9 10h6", "M9 13h6", "M9 16h3"],
  nodes: ["M6.5 7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z", "M17.5 4a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z", "M17.5 15a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z", "M9 9.5l6-2.5", "M9 12h6.5", "M13 15.5l4.5 1.5"],
  route: ["M5 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M19 4.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M7.5 16.5C11 15 9 8.5 16 8"],
  map: ["M12 2a7.2 7.2 0 0 0-7.2 7.2c0 5.2 7.2 12.8 7.2 12.8s7.2-7.6 7.2-12.8A7.2 7.2 0 0 0 12 2z", "M12 11a2.4 2.4 0 1 0 0-4.8A2.4 2.4 0 0 0 12 11z"],
  cube: ["M12 2l9 5v10l-9 5-9-5V7z", "M12 12l9-5", "M12 12v10", "M3 7l9 5"],
  terminal: ["M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "M7 9l3 3-3 3", "M12 15h5"],
  "cloud-sun": ["M5.5 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6z", "M15.5 16a4 4 0 0 1 .4 8H8a3 3 0 1 1 .6-6 4 4 0 0 1 6.9-2z", "M5.5 16.5v1", "M3 20h1"]
};

export function sidebarGroupsFor(role: unknown): SidebarGroup[] {
  return SIDEBAR_GROUPS.map((g) => ({
    ...g,
    entries: g.entries.filter((e) => e.requiredCapability === undefined || roleCanCapability(role, e.requiredCapability))
  }));
}

export function sidebarEntryById(id: string): SidebarEntry | undefined {
  for (const g of SIDEBAR_GROUPS) {
    const found = g.entries.find((e) => e.id === id);
    if (found) return found;
  }
  return undefined;
}

export function sidebarEntryByIdFor(id: string, role: unknown): SidebarEntry | undefined {
  return sidebarGroupsFor(role)
    .flatMap((g) => g.entries)
    .find((e) => e.id === id);
}

/** All capabilities referenced by the sidebar — a test asserts each has an owner. */
export function sidebarCapabilities(): string[] {
  const set = new Set<string>();
  for (const g of SIDEBAR_GROUPS) {
    for (const e of g.entries) if (e.requiredCapability) set.add(e.requiredCapability);
  }
  return [...set];
}

/** Entries that invoke a tool (activation must pass through the L3 broker). */
export function sidebarToolEntries(): SidebarEntry[] {
  return SIDEBAR_GROUPS.flatMap((g) => g.entries).filter((e) => e.tool !== undefined);
}

/** The bus event a block dispatches when an operator activates an entry. */
export function sidebarActivateEvent(entry: SidebarEntry): { type: "sidebar/activate"; ts: number; payload: { entryId: string } } {
  return { type: "sidebar/activate", ts: Date.now(), payload: { entryId: entry.id } };
}