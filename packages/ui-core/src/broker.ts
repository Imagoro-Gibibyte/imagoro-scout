/**
 * broker.ts — the client-side TOOL BROKER (L3): the single gate through which
 * confirmed intents and quick-run tool pills reach the harness gateway.
 *
 * What the broker enforces BEFORE anything leaves the tab:
 *   1. the tool is a KNOWN tool with a mapped capability (no magic strings);
 *   2. the caller's role holds that capability (open role -> capability matrix);
 *   3. a proposal still in dry-run NEVER dispatches; execution requires the
 *      operator's `confirmed` flag;
 *   4. dangerous tools (writes / system controls) additionally refuse unless
 *      confirmed — an unconfirmed dangerous step is a hard denial;
 *   5. per-kind client-side rate window + in-flight cap (the server budget
 *      remains the authoritative arbiter);
 *   6. args are shape-checked against closed enums (reuses the generated ACL
 *      matrix + ident grammar) — schema drift cannot widen what we send.
 *
 * The broker is the client half of the L1 intent -> L3 dispatch bridge:
 * executeIntent() runs the confirmed proposal's steps through the same gate.
 * The gateway is transport-only (see gateway.ts); all policy lives here so an
 * app swap never re-implements safety.
 */
import type { Role } from "./acl-matrix.gen.js";
import { isRole, normalizeRole, canWrite } from "./acl.js";
import { ACL_MATRIX } from "./acl-matrix.gen.js";
import { TOOL_CAPABILITY, isDangerousTool, type IntentProposal } from "./intent.js";
import { isSafeIdent, stripUnsafe } from "./guard.js";
import { type Gateway } from "./gateway.js";

export interface BrokerOptions {
  perMinute?: number;
  maxConcurrent?: number;
}

export interface BrokerRequest {
  tool: string;
  args?: Record<string, unknown>;
}

export interface DispatchOptions {
  role?: unknown;
  confirmed?: boolean;
  dryRun?: boolean;
}

export type BrokerResult =
  | { ok: true; tool: string; role: Role; data: string }
  | { ok: false; tool: string; role: Role; denial: string };

/**
 * Role -> capability matrix. Data capabilities are DERIVED from the ACL matrix
 * (a role may read/write only when the matrix says so); engine + system +
 * explore capabilities are explicit.
 */
const ENGINE_CAPS = ["engine:view", "engine:chat", "engine:dev", "engine:crew"] as const;
const EXPLORE_CAPS = ["explore:graph", "explore:route", "explore:map", "explore:visualizer"] as const;
const SYSTEM_CAPS = ["system:console", "system:engine"] as const;
const ENTERPRISE_CAPS = ["system:kill", "system:audit", "system:budget"] as const;

function derivedCaps(role: Role): string[] {
  const scope = ACL_MATRIX[role];
  const hasRead = Object.keys(scope.read).some((c) => {
    const acl = scope.read[c as keyof typeof scope.read];
    return acl && Object.values(acl).some(Boolean);
  });
  const hasWrite = Object.keys(scope.write).some((c) => {
    const acl = scope.write[c as keyof typeof scope.write];
    return acl && Object.values(acl).some(Boolean);
  });
  const caps: string[] = [];
  if (hasRead) caps.push("data:read");
  if (hasWrite) caps.push("data:write");
  return caps;
}

function capabilitiesFor(role: Role): string[] {
  const caps = [...ENGINE_CAPS, ...EXPLORE_CAPS, ...SYSTEM_CAPS, ...derivedCaps(role)];
  if (role === "enterprise") caps.push(...ENTERPRISE_CAPS);
  return caps;
}

const capabilityCache = new Map<Role, ReadonlySet<string>>();
function capSet(role: Role): ReadonlySet<string> {
  let set = capabilityCache.get(role);
  if (!set) {
    set = new Set(capabilitiesFor(role));
    capabilityCache.set(role, set);
  }
  return set;
}

const STRING_MAX_4000 = /^[^\u0000-\u001f\u007f-\u009f]{1,4000}$/;
const DEV_ARG_RE = /^[A-Za-z0-9_]{1,64}$/;
const MAX_TOKENS = 2048;
const CREW_MAX_STEPS = 6;

/** Minimal per-tool arg validation. Returns denial text or null (valid). */
function validateArgs(tool: string, role: Role, args: Record<string, unknown>): string | null {
  const isStr = (v: unknown): v is string => typeof v === "string";
  const enumOk = (v: unknown, list: readonly string[]): boolean => typeof v === "string" && (list as readonly string[]).includes(v);

  switch (tool) {
    case "scout_status":
    case "scout_roster":
    case "scout_models":
    case "scout_blackboard_read":
      return null;
    case "scout_chat": {
      if (!isStr(args.prompt) || !STRING_MAX_4000.test(args.prompt)) return "invalid-args: prompt must be a bounded string";
      if (args.role !== undefined && !enumOk(args.role, [ "base", "core", "manager", "dev", "vet", "analyst" ])) return "invalid-args: unknown chat role";
      if (args.max_tokens !== undefined && (typeof args.max_tokens !== "number" || args.max_tokens < 1 || args.max_tokens > MAX_TOKENS)) return "invalid-args: max_tokens out of range";
      return null;
    }
    case "scout_dev": {
      if (!Array.isArray(args.args)) return "invalid-args: dev needs an args array";
      if (args.args.length > 8) return "invalid-args: too many dev args";
      if (!args.args.every((a) => typeof a === "string" && DEV_ARG_RE.test(a))) return "invalid-args: dev args must be identifiers";
      return null;
    }
    case "scout_crew": {
      if (!isStr(args.goal) || !STRING_MAX_4000.test(args.goal)) return "invalid-args: goal must be a bounded string";
      if (args.max_tokens !== undefined && (typeof args.max_tokens !== "number" || args.max_tokens < 1 || args.max_tokens > MAX_TOKENS)) return "invalid-args: max_tokens out of range";
      if (args.steps !== undefined) {
        if (!Array.isArray(args.steps) || args.steps.length > CREW_MAX_STEPS) return "invalid-args: steps count out of range";
        for (const s of args.steps) {
          if (typeof s !== "object" || s === null) return "invalid-args: malformed step";
          const step = s as Record<string, unknown>;
          if (!isStr(step.role) || !enumOk(step.role, [ "base", "core", "manager", "dev", "vet", "analyst" ])) return "invalid-args: unknown step role";
          if (!isStr(step.task) || !STRING_MAX_4000.test(step.task)) return "invalid-args: step task must be bounded";
        }
      }
      return null;
    }
    case "scout_blackboard_write": {
      const CATEGORIES_LOCAL = Object.keys(ACL_MATRIX[role].write) as string[];
      if (!isStr(args.category) || !enumOk(args.category, CATEGORIES_LOCAL)) return "invalid-args: unknown or forbidden category";
      if (args.kind !== undefined && !isStr(args.kind)) return "invalid-args: bad kind";
      const kind = isStr(args.kind) ? args.kind : "raw";
      if (!canWrite(role, args.category, kind)) return "invalid-args: role cannot write category/kind";
      if (!isSafeIdent(args.key)) return "invalid-args: key must be an ASCII identifier";
      if (!args.value || typeof args.value !== "object" || Array.isArray(args.value)) return "invalid-args: value must be an object";
      return null;
    }
    case "scout_memory": {
      if (args.role !== undefined && !isStr(args.role)) return "invalid-args: bad role";
      return null;
    }
    case "scout_killswitch": {
      if (!enumOk(args.op, ["status", "trip", "release"])) return "invalid-args: op must be status|trip|release";
      if (args.op === "trip") {
        if (!isStr(args.reason) || args.reason.length === 0 || args.reason.length > 120) return "invalid-args: trip needs a reason (1..120 chars)";
      }
      return null;
    }
    case "scout_budget": {
      if (!enumOk(args.op, ["stats", "revoke"])) return "invalid-args: op must be stats|revoke";
      return null;
    }
    case "scout_audit":
      return null;
    case "system_kill":
      return null;
    default:
      return "unknown-tool";
  }
}

const BROKER_DEFAULT = Object.freeze({ perMinute: 20, maxConcurrent: 2 });
const emptyArgs = (args: Record<string, unknown> | undefined): Record<string, unknown> =>
  (args && typeof args === "object" && !Array.isArray(args)) ? args : {};

export class ToolBroker {
  private readonly perMinute: number;
  private readonly maxConcurrent: number;
  private readonly window: Map<string, number[]> = new Map();
  private inFlight = 0;

  constructor(
    private readonly gateway: Gateway,
    private readonly opts: BrokerOptions = {}
  ) {
    const cfg = { ...BROKER_DEFAULT, ...opts };
    this.perMinute = Math.max(1, Math.trunc(Number(cfg.perMinute) || BROKER_DEFAULT.perMinute));
    this.maxConcurrent = Math.max(1, Math.trunc(Number(cfg.maxConcurrent) || BROKER_DEFAULT.maxConcurrent));
  }

  /** Fail-closed client rate gate per tool kind. */
  private take(kind: string): boolean {
    const now = Date.now();
    const stamps = (this.window.get(kind) ?? []).filter((t) => now - t < 60_000);
    if (stamps.length >= this.perMinute) {
      this.window.set(kind, stamps);
      return false;
    }
    stamps.push(now);
    this.window.set(kind, stamps);
    return true;
  }

  /** Single gated tool dispatch. Never throws. */
  async dispatch(req: BrokerRequest, opts: DispatchOptions = {}): Promise<BrokerResult> {
    const role = normalizeRole(opts.role);
    const tool = req.tool;
    const confirmed = opts.confirmed === true;
    const dryRun = opts.dryRun === true;

    if (typeof tool !== "string" || !isSafeIdent(tool)) {
      return { ok: false, tool: String(tool ?? ""), role, denial: "unknown-tool" };
    }
    const capability = TOOL_CAPABILITY[tool];
    if (!capability) return { ok: false, tool, role, denial: "unknown-tool" };
    if (!capSet(role).has(capability)) {
      return { ok: false, tool, role, denial: `forbidden:capability (${capability}) for role ${role}` };
    }
    if (dryRun) return { ok: false, tool, role, denial: "dry-run: nothing executes" };
    if (isDangerousTool(tool) && !confirmed) {
      return { ok: false, tool, role, denial: "confirm-required: dangerous tool" };
    }
    if (!this.take(tool)) return { ok: false, tool, role, denial: `rate-limited: ${tool}` };
    if (this.inFlight >= this.maxConcurrent) {
      return { ok: false, tool, role, denial: "concurrency-limited" };
    }

    const badArgs = validateArgs(tool, role, emptyArgs(req.args));
    if (badArgs) return { ok: false, tool, role, denial: badArgs };

    this.inFlight++;
    try {
      const reply = await this.gateway.rpc<{
        result?: { content?: { type?: string; text?: string }[]; isError?: boolean };
        error?: { code?: number; message?: string };
      }>("tools/call", { name: tool, arguments: emptyArgs(req.args) }, (Date.now() % 0xffffff) + 1);
      if (reply?.error) {
        return { ok: false, tool, role, denial: `tool-error: ${stripUnsafe(reply.error.message ?? "error", { max: 200 })}` };
      }
      const text = (reply?.result?.content ?? []).map((c) => c?.text ?? "").join("\n").trim();
      if (reply?.result?.isError) {
        return { ok: false, tool, role, denial: `tool-error: ${stripUnsafe(text || "isError", { max: 200 })}` };
      }
      return { ok: true, tool, role, data: stripUnsafe(text, { max: 200_000 }) };
    } catch (err) {
      return { ok: false, tool, role, denial: `gateway: ${stripUnsafe(err instanceof Error ? err.message : String(err), { max: 200 })}` };
    } finally {
      this.inFlight--;
    }
  }

  /**
   * Run a proposed (confirmed) intent's steps through the same gate. Steps are
   * executed in order; a denied step stops the run (fail-closed, no partial
   * whisper of skipped denials). Returns per-step outcomes.
   */
  async executeIntent(
    proposal: IntentProposal,
    opts: { confirmed?: boolean } = {}
  ): Promise<Array<BrokerResult & { step: number }>> {
    if (proposal.dryRun) return [{ ok: false, step: 0, tool: proposal.steps[0]?.tool ?? "", role: proposal.role, denial: "dry-run: nothing executes" }];
    const confirmed = proposal.confirmed || opts.confirmed === true;
    const out: Array<BrokerResult & { step: number }> = [];
    for (let i = 0; i < proposal.steps.length; i++) {
      const step = proposal.steps[i]!;
      const res = await this.dispatch({ tool: step.tool, args: step.args }, { role: proposal.role, confirmed });
      out.push({ ...res, step: i });
      if (!res.ok) break; // fail-closed: a denied step halts the plan
    }
    return out;
  }
}

export function isBrokerOk(result: BrokerResult): result is Extract<BrokerResult, { ok: true }> {
  return result.ok === true;
}

export function roleCanCapability(role: unknown, capability: string): boolean {
  return isRole(role) ? capSet(role).has(capability) : false;
}