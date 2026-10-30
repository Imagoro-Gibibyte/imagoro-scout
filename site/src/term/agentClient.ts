import type { AgentInfo, HostInfo } from "./types";

/** Messages the browser sends to a pty agent. */
export type ClientMessage =
  | { type: "input"; data: string }
  | { type: "resize"; cols: number; rows: number }
  | { type: "ping" };

/** Messages a pty agent sends back. */
export type ServerMessage =
  | { type: "output"; data: string }
  | { type: "ready"; platform: string; shell: string }
  | { type: "exit"; code: number }
  | { type: "error"; message: string }
  | { type: "pong" };

export interface AgentHandlers {
  onOutput(data: string): void;
  onReady(info: { platform: string; shell: string }): void;
  onExit(code: number): void;
  onError(message: string): void;
  onClose(): void;
}

export interface ConnectOptions {
  cols: number;
  rows: number;
  shell?: string;
  token?: string;
  /** Gateway host id to target (gateway mode). */
  host?: string;
  /** Session id, used by a worker to isolate a container per tab. */
  session?: string;
}

/** Default agent URL for local development. Never a deployed hostname. */
export const DEFAULT_AGENT_URL = "ws://127.0.0.1:8787/ws";

export function agentUrlFromEnv(): string {
  return import.meta.env.VITE_AGENT_URL ?? DEFAULT_AGENT_URL;
}

/**
 * The gateway URL. When set, the browser talks only to the gateway (`wss://`),
 * which authenticates the user and adds agent tokens server-side, so no secret
 * is ever shipped in this bundle.
 */
export function gatewayUrlFromEnv(): string | undefined {
  return import.meta.env.VITE_GATEWAY_URL;
}

export function agentTokenFromEnv(): string | undefined {
  return import.meta.env.VITE_AGENT_TOKEN;
}

/** Derive the http(s) origin of an agent from its ws(s) URL. */
export function httpOriginOf(wsUrl: string): string {
  const u = new URL(wsUrl);
  u.protocol = u.protocol === "wss:" ? "https:" : "http:";
  u.pathname = "";
  u.search = "";
  return u.toString().replace(/\/$/, "");
}

/**
 * Ask the gateway which hosts it fronts. Sent with credentials so an Access
 * cookie authenticates the call (same-origin recommended).
 */
export async function fetchGatewayHosts(gatewayWsUrl: string): Promise<HostInfo[]> {
  try {
    const res = await fetch(`${httpOriginOf(gatewayWsUrl)}/api/hosts`, {
      credentials: "include",
      signal: AbortSignal.timeout(4000)
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { hosts?: HostInfo[] };
    return Array.isArray(data.hosts) ? data.hosts : [];
  } catch {
    return [];
  }
}

/** Best-effort probe of an agent's `/shells` endpoint. Returns null if absent. */
export async function fetchAgentInfo(wsUrl: string, token?: string): Promise<AgentInfo | null> {
  try {
    const res = await fetch(`${httpOriginOf(wsUrl)}/shells`, {
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
      signal: AbortSignal.timeout(1500)
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<AgentInfo>;
    if (!Array.isArray(data.shells)) return null;
    return {
      ok: true,
      platform: data.platform ?? "unknown",
      shell: data.shell ?? "",
      shells: data.shells,
      version: data.version ?? "0"
    };
  } catch {
    return null;
  }
}

/**
 * A JSON-framed WebSocket connection to a pty agent. JSON is deliberate:
 * terminal output is small, and framing stays debuggable in devtools.
 */
export class AgentConnection {
  private ws: WebSocket | null = null;
  private closedByUs = false;

  constructor(
    private readonly url: string,
    private readonly handlers: AgentHandlers
  ) {}

  connect(opts: ConnectOptions): void {
    const u = new URL(this.url);
    u.searchParams.set("cols", String(opts.cols));
    u.searchParams.set("rows", String(opts.rows));
    if (opts.shell) u.searchParams.set("shell", opts.shell);
    if (opts.host) u.searchParams.set("host", opts.host);
    if (opts.session) u.searchParams.set("session", opts.session);
    const token = opts.token ?? agentTokenFromEnv();
    if (token) u.searchParams.set("token", token);

    const ws = new WebSocket(u.toString());
    this.ws = ws;

    ws.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(ev.data as string) as ServerMessage;
      } catch {
        return;
      }
      switch (msg.type) {
        case "output":
          this.handlers.onOutput(msg.data);
          break;
        case "ready":
          this.handlers.onReady({ platform: msg.platform, shell: msg.shell });
          break;
        case "exit":
          this.handlers.onExit(msg.code);
          break;
        case "error":
          this.handlers.onError(msg.message);
          break;
      }
    };

    ws.onerror = () => {
      if (!this.closedByUs) this.handlers.onError("websocket error");
    };

    ws.onclose = () => {
      this.ws = null;
      if (!this.closedByUs) this.handlers.onClose();
    };
  }

  send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  input(data: string): void {
    this.send({ type: "input", data });
  }

  resize(cols: number, rows: number): void {
    this.send({ type: "resize", cols, rows });
  }

  close(): void {
    this.closedByUs = true;
    this.ws?.close();
    this.ws = null;
  }
}
