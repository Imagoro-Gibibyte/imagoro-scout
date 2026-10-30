import { describe, expect, it } from "vitest";
import { EventBus } from "../src/eventbus.js";
import type { BusEvent } from "../src/types.js";

function evt(type: string): BusEvent {
  return { type, ts: Date.now(), payload: {} };
}

describe("EventBus", () => {
  it("delivers events in subscription order", () => {
    const bus = new EventBus();
    const order: string[] = [];
    bus.subscribe(() => order.push("a"));
    bus.subscribe(() => order.push("b"));
    bus.dispatch(evt("test"));
    expect(order).toEqual(["a", "b"]);
  });

  it("unsubscribes cleanly", () => {
    const bus = new EventBus();
    let hits = 0;
    const off = bus.subscribe(() => hits++);
    off();
    bus.dispatch(evt("test"));
    expect(hits).toBe(0);
  });

  it("isolates subscriber errors", () => {
    const bus = new EventBus();
    let hits = 0;
    bus.subscribe(() => {
      throw new Error("boom");
    });
    bus.subscribe(() => hits++);
    expect(() => bus.dispatch(evt("test"))).not.toThrow();
    expect(hits).toBe(1);
  });

  it("reports subscriber count", () => {
    const bus = new EventBus();
    const off = bus.subscribe(() => {});
    expect(bus.size).toBe(1);
    off();
    expect(bus.size).toBe(0);
  });
});