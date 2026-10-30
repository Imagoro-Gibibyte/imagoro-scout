# UI ecosystem

[imagoro-ui](https://github.com/scout-hazard-system/imagoro-ui) is one React-first codebase for every Scout front end: a composable **block GUI** plus a **node canvas**, built modularity-first so the same blocks serve a personal dashboard, the Command Center and the desktop consoles. This repo vendors its zero-dependency core as [`packages/ui-core`](../packages/ui-core).

## Layers

| Layer | What |
|---|---|
| **Block contract** | a block is a manifest (id, family, inputs it subscribes to, capabilities it needs) plus a renderer. The contract is substrate-neutral; React is the canonical renderer, and JVM/Qt adapters are documented |
| **Core** (`@imagoro/core`) | registry, typed **event bus**, fixtures, the **ACL role matrix** (single-sourced from the server's matrix so client and server can't drift), and the pieces below |
| **Renderer** | React + Vite, 12 block families: map, route, chat, console, terminal, metrics, audit, weather, audio visualiser, pipeline, blackboard, cluster |
| **Canvas** | immutable DAG graph model, layered layout, SVG canvas block; imports crew task graphs |
| **Shells** | Command Center (CRM-style shell), Harness Console (talks to Kao), Scout Harness desktop app; packaged with Tauri v2 (Windows exe / MSI / NSIS), Flatpak and an Android webview |

## The client-side safety model (in `ui-core`)

- **`gateway`: the one network chokepoint.** No block calls `fetch()` against the harness directly; everything goes through `Gateway`, so there's one place for auth, timeouts and shaping errors.
- **`broker`: the tool broker.** Confirmed intents and quick-run tool pills reach the gateway only through it. Before a request leaves the tab, it checks:
  - the tool is known and mapped to a capability;
  - the caller's role holds that capability;
  - dry-run proposals never dispatch, and writes or system controls need the operator's explicit confirmation;
  - arguments are shape-checked against closed enums;
  - a client-side rate window and in-flight cap apply.

  The gateway stays transport-only, so all policy lives in the broker.
- **`intent`: pure routing.** It maps a natural-language goal ("what do you want to do today?") to a crew role, a block or a tool. It never executes anything.
- **`sidebar`: data, not markup.** Groups and entries map one-to-one to a harness tool id or block id, each pinned to a capability from the registry.
- **`guard`: client mirror of the harness guard.** Strings crossing a UI, log or JSON boundary are collapsed to one line, with control and bidi characters stripped.

Desktop apps add a strict CSP: the web view can only talk IPC, and Rust does all HTTP to one allowed origin. The security console keeps its signing key in the OS credential store, never in the web view.

## Run it

```sh
cd packages/ui-core
npm ci
npx vitest run        # 50 tests
npx tsc -p tsconfig.json --noEmit
```
