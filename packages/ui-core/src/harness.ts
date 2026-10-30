import type { BusEvent } from "./types.js";
import type { EventBus } from "./eventbus.js";
import type { BlockRegistry } from "./registry.js";

export interface FixtureSet {
  snapshot: BusEvent;
  stream: BusEvent[];
}

export function findSlotElements(root: ParentNode = document): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("[data-slot]")];
}

export function replayFixtures(
  bus: EventBus,
  fixture: FixtureSet,
  betweenMs = 25
): () => void {
  const timers: number[] = [];
  bus.dispatch(fixture.snapshot);
  fixture.stream.forEach((evt, i) => {
    timers.push(window.setTimeout(() => bus.dispatch(evt), (i + 1) * betweenMs));
  });
  return () => {
    for (const t of timers) window.clearTimeout(t);
  };
}

export function mountSlots(
  registry: BlockRegistry,
  root: ParentNode = document
): HTMLElement[] {
  const mounted: HTMLElement[] = [];
  for (const el of findSlotElements(root)) {
    const id = el.dataset.slot;
    if (!id) continue;
    registry.mount(el, { id });
    mounted.push(el);
  }
  return mounted;
}