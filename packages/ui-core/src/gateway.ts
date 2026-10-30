/**
 * gateway.ts — the ONE network chokepoint for the Imagoro client (L3).
 *
 * No block, section, or app module may touch fetch() against the harness
 * directly; everything goes through Gateway. That single surface lets us
 * enforce, in one place:
 *   - the endpoint + Bearer token policy (never a raw token in a URL/query);
 *   - a hard response-body cap (a hostile/looping harness cannot blow the tab);
 *   - a request timeout via AbortController (no orphaned in-flight calls);
 *   - stable, redacted error text (never a raw non-JSON body on the wire);
 *   - a class-of-request rate guard is applied UPSTREAM by the ToolBroker —
 *     the gateway itself is transport only, so it stays easy to audit.
 *
 * The gateway is framework-free and browser-safe; the harness-console app is
 * the only owner today. `fetch` is injected so tests can stub it.
 */
import { stripUnsafe } from "./guard.js";

export interface GatewayOptions {
  base?: string;
  token?: string;
  timeoutMs?: number;
  maxBodyBytes?: number;
  fetchImpl?: typeof fetch;
}

export interface GatewayError {
  kind: "timeout" | "http" | "parse" | "payload-too-large" | "network";
  message: string;
  status?: number;
}

export function isGatewayError(err: unknown): err is GatewayError {
  return typeof err === "object" && err !== null && "kind" in err && typeof (err as { kind: unknown }).kind === "string";
}

export const GATEWAY_DEFAULTS = Object.freeze({
  base: "/api",
  timeoutMs: 20_000,
  maxBodyBytes: 2 * 1024 * 1024
});

export class Gateway {
  private readonly base: string;
  private readonly token: string | undefined;
  private readonly timeoutMs: number;
  private readonly maxBodyBytes: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: GatewayOptions = {}) {
    const cfg = { ...GATEWAY_DEFAULTS, ...opts };
    this.base = String(cfg.base || "/api").replace(/\/+$/, "");
    this.token = typeof cfg.token === "string" && cfg.token.length > 0 ? cfg.token : undefined;
    this.timeoutMs = Math.max(1_000, Math.trunc(Number(cfg.timeoutMs) || GATEWAY_DEFAULTS.timeoutMs));
    this.maxBodyBytes = Math.max(1024, Math.trunc(Number(cfg.maxBodyBytes) || GATEWAY_DEFAULTS.maxBodyBytes));
    this.fetchImpl = cfg.fetchImpl ?? ((...args) => fetch(...args));
  }

  async rpc<T>(method: string, params: Record<string, unknown> = {}, id = 1): Promise<T> {
    let url = `${this.base}/rpc`;
    let res: Response;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      res = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {})
        },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params: params ?? {} }),
        signal: controller.signal
      });
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      throw this.error(aborted ? "timeout" : "network",
        aborted ? `gateway timeout after ${this.timeoutMs}ms` : "gateway unreachable");
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 401) {
      throw this.error("http", "unauthorized: check IMAGORO_MCP_TOKEN", 401);
    }
    if (!res.ok) {
      throw this.error("http", `gateway http ${res.status}`, res.status);
    }

    const len = Number(res.headers.get("content-length") ?? 0);
    if (Number.isFinite(len) && len > this.maxBodyBytes) {
      throw this.error("payload-too-large", `gateway response exceeds ${this.maxBodyBytes} bytes`);
    }
    const text = await res.text();
    if (text.length > this.maxBodyBytes) {
      throw this.error("payload-too-large", `gateway response exceeds ${this.maxBodyBytes} bytes`);
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw this.error("parse", "gateway returned non-JSON body");
    }
  }

  private error(kind: GatewayError["kind"], message: string, status?: number): GatewayError {
    return { kind, message: stripUnsafe(message, { max: 300 }) as string, status };
  }
}

/** Human-readable, single-line error text suitable for a console/log event. */
export function gatewayErrorText(err: unknown): string {
  if (isGatewayError(err)) return `[gateway] ${err.message}`;
  return `[gateway] ${stripUnsafe(err instanceof Error ? err.message : String(err), { max: 300 })}`;
}