export type BlockFamily =
  | "map" | "route" | "chat" | "console" | "terminal" | "metrics"
  | "audit" | "weather" | "audio/visualizer" | "pipeline" | "blackboard"
  | "cluster" | "graph" | "sidebar";

export interface PortDef { name: string; type: string; }

export interface BlockManifest {
  id: string;
  name: string;
  version: string;
  family: BlockFamily;
  substrates: string[];
  size: { min: [number, number]; ideal: [number, number] };
  ports: {
    in: PortDef[];
    out: PortDef[];
  };
  theme?: { tokens: string[] };
  api?: string[];
  lifecycle?: { autostart: boolean };
}

export interface BusEvent {
  type: string;
  ts: number;
  payload: JsonObject;
}

export type JsonObject = Record<string, unknown>;

export type Config = Record<string, unknown>;

export interface BlockState {
  [key: string]: unknown;
}

export interface BlockContext {
  config: Config;
  dispatch: (evt: BusEvent) => void;
  subscribe: (fn: (evt: BusEvent) => void) => () => void;
}

export interface Block {
  manifest: BlockManifest;
  mount(el: HTMLElement, ctx: BlockContext): void;
  render(state: BlockState): void;
  onEvent(evt: BusEvent): void;
  unmount(): void;
}

export type BlockImpl = { new (): Block } | Block;

export interface BlockHandle {
  update(config: Record<string, unknown>): void;
  unmount(): void;
}

// placeholder; registry + event bus implemented in M1 (src/registry.ts, src/eventbus.ts)
export const version = "0.1.0";