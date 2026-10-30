import type { BusEvent } from "./types.js";
import { canWrite, normalizeRole, type BlackboardKind, type Role } from "./acl.js";

export type Subscriber = (evt: BusEvent) => void;

export class EventBus {
  private readonly subs: Subscriber[] = [];

  subscribe(fn: Subscriber): () => void {
    this.subs.push(fn);
    return () => {
      const i = this.subs.indexOf(fn);
      if (i >= 0) this.subs.splice(i, 1);
    };
  }

  dispatch(evt: BusEvent): void {
    for (const fn of [...this.subs]) {
      try {
        fn(evt);
      } catch (err) {
        console.error("[imagoro] subscriber threw on", evt.type, err);
      }
    }
  }

  get size(): number {
    return this.subs.length;
  }
}

export interface SseClientOptions {
  url: string;
  onEvent: (evt: BusEvent) => void;
  onError?: (err: unknown) => void;
}

export function connectSse(opts: SseClientOptions): () => void {
  let closed = false;
  const source = new EventSource(opts.url);
  source.onmessage = (msg) => {
    try {
      opts.onEvent(JSON.parse(String(msg.data)) as BusEvent);
    } catch {
      /* ignore malformed frames; EventSource reconnects on its own */
    }
  };
  source.onerror = (e) => opts.onError?.(e);
  return () => {
    closed = true;
    source.close();
  };
}

export interface BlackboardClientOptions {
  baseUrl: string;
  category: string;
  role?: Role;
}

export class BlackboardClient {
  private readonly role: Role;
  constructor(private readonly opts: BlackboardClientOptions) {
    this.role = normalizeRole(opts.role);
  }

  get scope(): Role {
    return this.role;
  }

  private endpoint(kind: string): string {
    return `${this.opts.baseUrl}/v1/${kind}`;
  }

  async snapshot(): Promise<Record<string, unknown>> {
    const res = await fetch(this.endpoint("snapshot"), {
      headers: { "Content-Type": "application/json" }
    });
    if (!res.ok) throw new Error(`blackboard snapshot ${res.status}`);
    const body = (await res.json()) as Record<string, unknown>;
    return (body[this.opts.category] ?? {}) as Record<string, unknown>;
  }

  async write(key: string, payload: unknown, kind: BlackboardKind = "raw"): Promise<void> {
    if (!canWrite(this.role, this.opts.category, kind)) {
      throw new Error(
        `blackboard write denied: role "${this.role}" cannot write "${kind}" in "${this.opts.category}"`
      );
    }
    const res = await fetch(this.endpoint("write"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: this.opts.category, key, kind, payload })
    });
    if (!res.ok) throw new Error(`blackboard write ${res.status}`);
  }

  toBusEvent(categorySnapshot: Record<string, unknown>): BusEvent {
    return {
      type: "blackboard/snapshot",
      ts: Date.now(),
      payload: { category: this.opts.category, values: categorySnapshot }
    };
  }
}