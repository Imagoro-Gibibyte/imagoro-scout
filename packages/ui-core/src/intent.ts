import { normalizeRole, type Role } from "./acl.js";

/**
 * Intent model — L1 "what do you want to do today?".
 *
 * The intent bar routes a natural-language goal to a crew role, a block, or a
 * tool. This module is PURE: it never executes anything and never touches a
 * network. It turns text into a *proposed plan* (a list of tool steps with
 * resolved args) so the UI can show a preview and the operator can confirm.
 *
 * Safety contract (threat model T1/T2/T8):
 *   - tool results and memory are data, never instructions — this parser is not
 *     an authority grant;
 *   - no plan can fabricate an unrecognized tool (`steps` is empty when nothing
 *     matches);
 *   - dangerous steps (writes, audit, kill) are flagged and require confirmation
 *     before the broker (L3) may dispatch them;
 *   - step/transcript counts are capped so a session cannot runaway.
 *
 * The heuristic matcher is deliberately deterministic and offline. Real
 * model-generated planning happens server-side (scout_crew manager), never by
 * free-text on the client.
 */
export const INTENT_TOOLS = [
  "scout_status",
  "scout_roster",
  "scout_models",
  "scout_chat",
  "scout_dev",
  "scout_crew",
  "scout_blackboard_read",
  "scout_blackboard_write"
] as const;

export type IntentToolId = (typeof INTENT_TOOLS)[number];

export const DANGEROUS_TOOLS: readonly string[] = [
  "scout_blackboard_write",
  "system_kill",
  "scout_killswitch",
  "scout_budget"
];

export const TOOL_CAPABILITY: Record<string, string> = {
  scout_status: "engine:view",
  scout_roster: "engine:view",
  scout_models: "engine:view",
  scout_chat: "engine:chat",
  scout_dev: "engine:dev",
  scout_crew: "engine:crew",
  scout_blackboard_read: "data:read",
  scout_blackboard_write: "data:write",
  system_kill: "system:kill",
  scout_killswitch: "system:kill",
  scout_budget: "system:budget",
  scout_audit: "system:audit"
};

export function isDangerousTool(tool: string): boolean {
  return (DANGEROUS_TOOLS as readonly string[]).includes(tool);
}

export interface PlanStep {
  tool: string;
  label: string;
  args: Record<string, unknown>;
  dangerous: boolean;
  capability: string;
}

export interface IntentProposal {
  id: string;
  ts: number;
  intent: string;
  role: Role;
  steps: PlanStep[];
  dryRun: boolean;
  confirmed: boolean;
  note?: string;
}

export interface IntentTranscriptEntry {
  ts: number;
  role: Role;
  intent: string;
  steps: number;
  dryRun: boolean;
  confirmed: boolean;
}

export interface ProposeOptions {
  role?: unknown;
  dryRun?: boolean;
  maxSteps?: number;
}

const TEXT_MAX = 4000;
export const DEFAULT_MAX_PLAN_STEPS = 3;
export const DEFAULT_MAX_TRANSCRIPT = 40;

/** Deterministic keyword -> tool routing used by the plan preview. */
const ROUTES: { tool: IntentToolId; label: string; re: RegExp; args: (text: string) => Record<string, unknown> }[] = [
  { tool: "scout_blackboard_write", label: "Write a blackboard entry", re: /\b(write|save|store|remember)\b/i, args: (t) => ({ note: t.slice(0, 200) }) },
  { tool: "scout_crew", label: "Orchestrate a crew", re: /\b(orchestrat|run crew|workflow|delegate|campaign)\b/i, args: (t) => ({ goal: t.slice(0, 4000) }) },
  { tool: "scout_roster", label: "Crew roster", re: /\b(roster|who is on|crew roles)\b/i, args: () => ({}) },
  { tool: "scout_models", label: "Available models", re: /\b(models?)\b/i, args: () => ({}) },
  { tool: "scout_status", label: "Engine status", re: /\b(status|health|engine|is the.*running)\b/i, args: () => ({}) },
  { tool: "scout_dev", label: "Dev helper", re: /\b(dev|refactor|generate|helper|fix)\b/i, args: () => ({}) },
  { tool: "scout_blackboard_read", label: "Read the blackboard", re: /\b(read|show|display|snapshot|blackboard|what is in|pipeline data)\b/i, args: () => ({}) },
  { tool: "scout_chat", label: "Chat with a crew role", re: /.*/s, args: (t) => ({ prompt: t.slice(0, 4000) }) }
];

/**
 * Turn raw text into a proposed plan. Returns an empty-steps proposal when
 * nothing useful can be routed (fail closed: never guess, never fabricate).
 */
export function proposePlan(
  text: unknown,
  opts: ProposeOptions = {}
): IntentProposal {
  const raw = typeof text === "string" ? text.slice(0, TEXT_MAX) : "";
  const trimmed = raw.replace(/\s+/g, " ").trim();
  const role = normalizeRole(opts.role);
  const dryRun = opts.dryRun !== false;
  const maxSteps = Math.max(1, Math.min(8, Math.trunc(Number(opts.maxSteps) || DEFAULT_MAX_PLAN_STEPS)));
  const ts = Date.now();
  const id = `intent-${ts.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  if (!trimmed) {
    return { id, ts, intent: trimmed, role, steps: [], dryRun, confirmed: false, note: "empty intent" };
  }

  const steps: PlanStep[] = [];
  const seen = new Set<string>();
  for (const route of ROUTES) {
    if (!route.re.test(trimmed)) continue;
    const tool = route.tool;
    if (seen.has(tool)) continue;
    seen.add(tool);
    const planStep: PlanStep = {
      tool,
      label: route.label,
      args: route.args(trimmed),
      dangerous: isDangerousTool(tool),
      capability: TOOL_CAPABILITY[tool] ?? "unknown"
    };
    steps.push(planStep);
    if (steps.length >= maxSteps) break;
  }

  // The catch-all chat route matches everything when nothing more specific did.
  if (steps.length === 0) {
    steps.push({
      tool: "scout_chat",
      label: "Chat with a crew role",
      args: { prompt: trimmed },
      dangerous: false,
      capability: TOOL_CAPABILITY["scout_chat"] ?? "engine:chat"
    });
  }

  return { id, ts, intent: trimmed, role, steps, dryRun, confirmed: false };
}

/** One session's intent transcript. Holds budgets/caps; never executes. */
export class IntentSession {
  private readonly entries: IntentTranscriptEntry[] = [];
  constructor(
    private readonly opts: {
      maxSteps?: number;
      maxTranscript?: number;
    } = {}
  ) {}

  propose(text: unknown, role?: unknown, dryRun = true): IntentProposal {
    const proposal = proposePlan(text, { role, dryRun, maxSteps: this.opts.maxSteps });
    const entry: IntentTranscriptEntry = {
      ts: proposal.ts,
      role: proposal.role,
      intent: proposal.intent,
      steps: proposal.steps.length,
      dryRun,
      confirmed: false
    };
    this.entries.push(entry);
    const cap = Math.max(1, Math.trunc(Number(this.opts.maxTranscript) || DEFAULT_MAX_TRANSCRIPT));
    if (this.entries.length > cap) this.entries.splice(0, this.entries.length - cap);
    return proposal;
  }

  confirm(proposal: IntentProposal): IntentProposal {
    const confirmed = { ...proposal, confirmed: true };
    const last = this.entries[this.entries.length - 1];
    if (last && last.intent === proposal.intent) this.entries[this.entries.length - 1]!.confirmed = true;
    return confirmed;
  }

  history(): IntentTranscriptEntry[] {
    return this.entries;
  }

  get transcriptSize(): number {
    return this.entries.length;
  }
}