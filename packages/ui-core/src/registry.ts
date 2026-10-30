import { EventBus } from "./eventbus.js";
import type { Subscriber } from "./eventbus.js";
import type {
  Block,
  BlockContext,
  BlockHandle,
  BlockManifest,
  BusEvent,
  Config
} from "./types.js";

export type BlockFactory = () => Block;

export interface MountOptions {
  id: string;
  config?: Config;
  bus?: EventBus;
}

export class BlockRegistry {
  private readonly factories = new Map<string, { manifest: BlockManifest; make: BlockFactory }>();
  private readonly mounts = new Map<HTMLElement, { block: Block; bus: EventBus }>();

  get size(): number {
    return this.factories.size;
  }

  register(id: string, make: BlockFactory): void {
    const impl = make();
    const prev = this.factories.get(id);
    if (prev && prev.manifest.version !== impl.manifest.version) {
      throw new Error(
        `block ${id} already registered v${prev.manifest.version}; refusing v${impl.manifest.version}`
      );
    }
    this.factories.set(id, { manifest: impl.manifest, make });
  }

  manifest(id: string): BlockManifest | undefined {
    return this.factories.get(id)?.manifest;
  }

  get length(): number {
    return this.factories.size;
  }

  mount(slotEl: HTMLElement, opts: MountOptions): BlockHandle {
    const entry = this.factories.get(opts.id);
    if (!entry) throw new Error(`unknown block ${opts.id}`);
    const bus = opts.bus ?? new EventBus();
    const block = entry.make();
    const ctx: BlockContext = {
      config: { ...(opts.config ?? {}) },
      dispatch: (evt: BusEvent) => bus.dispatch(evt),
      subscribe: (fn: Subscriber) => bus.subscribe(fn)
    };
    block.mount(slotEl, ctx);
    this.mounts.set(slotEl, { block, bus });
    const handle: BlockHandle = {
      update: (config: Config) => {
        ctx.config = { ...config };
        block.render({});
      },
      unmount: () => {
        const rec = this.mounts.get(slotEl);
        if (!rec) return;
        block.unmount();
        this.mounts.delete(slotEl);
      }
    };
    return handle;
  }

  dispatch(evt: BusEvent): void {
    for (const rec of this.mounts.values()) rec.bus.dispatch(evt);
  }
}