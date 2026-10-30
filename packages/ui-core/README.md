# @imagoro/core

The zero-dependency core of [imagoro-ui](https://github.com/scout-hazard-system/imagoro-ui), vendored at upstream `e3d5daa`: block registry, typed event bus, fixtures, ACL role matrix, intent router, sidebar model, tool broker, harness gateway client and a text guard. What each piece guarantees: [docs/ui.md](../../docs/ui.md).

```sh
npm ci
npx vitest run                     # 50 tests
npx tsc -p tsconfig.json --noEmit
```

The React renderer, block families, node canvas and app shells live upstream.
