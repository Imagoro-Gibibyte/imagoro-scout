# Site

The public portfolio, and the browser terminal that ships with it, as one
static build. Vite + React; no server, no runtime backend.

```sh
npm ci
npm run dev        # http://localhost:8794
npm run build      # typecheck + dist/
npm run preview
```

## Pages

| Route | What |
|---|---|
| `/` | The hero and the three claims the system rests on |
| `/services` | How the loop runs, and which tier each part runs on |
| `/insights` | The request path and the client-side safety model |
| `/about` | What the system is, the trust boundaries, licensing |
| `/term` | The browser terminal |
| `/contact` | Source and issues |

`public/_redirects` rewrites every unmatched path to `index.html`, so deep links
work on any static host that honours it. The router is in `src/router.tsx`.

## The terminal

`src/term/` is a tabbed xterm UI. It opens an in-browser demo shell by default,
and can target a real pty agent when the build is given one:

| Build variable | Meaning |
|---|---|
| `VITE_AGENT_URL` | `ws(s)://` URL of a pty agent, e.g. `ws://127.0.0.1:8787/ws` |
| `VITE_GATEWAY_URL` | `ws(s)://` URL of a gateway that fronts several agents |
| `VITE_AGENT_TOKEN` | Bearer token for direct mode; prefer the gateway |
| `VITE_REPO_URL` | Public repository URL, for the source and issue links |

None of them have a deployed default. A plain `npm run build` is a
self-contained demo, and no hostname from a real deployment is committed here.

## Deploying

`.github/workflows/pages.yml` builds and uploads `site/dist`. It runs only when
the repository has `PAGES_DEPLOY=1`, and reads the project name, account and the
build variables above from repository settings, so the tree stays free of
deployment detail.
