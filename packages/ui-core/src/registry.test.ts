import { describe, expect, it } from "vitest";
import { BlockRegistry } from "../src/registry.js";
import { EventBus } from "../src/eventbus.js";
import type { Block, BlockContext, BlockManifest, BusEvent } from "../src/types.js";

const FAKE_EL = {} as HTMLElement;

function makeBlock(id: string, version = "0.1.0") {
  const manifest: BlockManifest = {
    id,
    name: id,
    version,
    family: "metrics",
    substrates: ["react"],
    size: { min: [0, 0], ideal: [0, 0] },
    ports: { in: [], out: [] }
  };
  const seen: BusEvent[] = [];
  let ctx: BlockContext | null = null;
  let off: (() => void) | null = null;
  const block: Block = {
    manifest,
    mount(el, c) {
      ctx = c;
      off = c.subscribe((e) => seen.push(e));
    },
    render() {
      /* test stub */
    },
    onEvent(e) {
      seen.push(e);
    },
    unmount() {
      off?.();
      off = null;
      ctx = null;
    }
  };
  return { block, seen, getCtx: () => ctx };
}

describe("BlockRegistry", () => {
  it("registers and exposes manifests", () => {
    const reg = new BlockRegistry();
    reg.register("t.map", () => makeBlock("t.map").block);
    expect(reg.length).toBe(1);
    expect(reg.manifest("t.map")?.version).toBe("0.1.0");
  });

  it("rejects same-version re-register silently", () => {
    const reg = new BlockRegistry();
    reg.register("t.map", () => makeBlock("t.map").block);
    expect(() => reg.register("t.map", () => makeBlock("t.map").block)).not.toThrow();
  });

  it("throws on version-conflicting re-register", () => {
    const reg = new BlockRegistry();
    reg.register("t.map", () => makeBlock("t.map", "0.1.0").block);
    expect(() => reg.register("t.map", () => makeBlock("t.map", "0.2.0").block)).toThrow(
      /already registered/
    );
  });

  it("mounts, dispatches, and unmounts a block", () => {
    const reg = new BlockRegistry();
    const bus = new EventBus();
    const { block, seen } = makeBlock("t.metrics");
    reg.register("t.metrics", () => block);
    const handle = reg.mount(FAKE_EL, { id: "t.metrics", bus });
    reg.dispatch({ type: "metrics/update", ts: 1, payload: { captured: 143 } });
    expect(seen.length).toBe(1);
    expect(seen[0]!.type).toBe("metrics/update");
    handle.update({ fast: true });
    handle.unmount();
    reg.dispatch({ type: "metrics/update", ts: 2, payload: {} });
    expect(seen.length).toBe(1);
  });
});