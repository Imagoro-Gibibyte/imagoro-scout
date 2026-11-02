# Site

The public portfolio, and the browser terminal that ships with it, as one
static build. Vite + React. The only runtime backend is the optional download counter.

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
| `/skills` | Marketplace of downloadable skills and tools |
| `/devlog` | Dated project updates, linked from the footer |
| `/term` | The browser terminal |
| `/contact` | Source and issues |

`public/_redirects` rewrites every unmatched path to `index.html`, so deep links
work on any static host that honours it. The router is in `src/router.tsx`.

## Effects

`src/effects/` holds the animated backdrops and ASCII titles, adapted from
[React Bits](https://reactbits.dev), which keeps its own license
(`src/effects/LICENSE-react-bits.md`). They load after the page, and are skipped for
visitors who prefer reduced motion or whose browser can't run WebGL. Backdrops are set
per route in `src/effects/seas.ts`, and a route without one uses `DEFAULT_SEA`.

## Devlog

`catalog/devlog.json` holds the entries, and each one names a project from the list at
the top of that file, which also sets its color. This site is public, so write each entry
for that audience: describe roles rather than machines, and run `tools/leakcheck.py`.

## Skills and tools

`catalog/skills.json` lists the entries, and `skills/<id>/` holds each entry's files.
`scripts/pack-skills.mjs` zips those into `public/downloads/` during the build, so the
downloads are always built from reviewed source.

The page works as a static site. Download and share counts come from the Pages Functions
in `functions/`, which need a D1 binding named `DB` and a `SKILL_SALT` secret:

```sql
CREATE TABLE skill_events (
  skill TEXT NOT NULL, kind TEXT NOT NULL, visitor TEXT NOT NULL, day TEXT NOT NULL,
  PRIMARY KEY (skill, kind, visitor, day)
) WITHOUT ROWID;
```

Each visitor counts once per entry, action and day. `visitor` is a salted hash that
changes daily, so no IP address is stored. Without the binding, downloads still work and
the counts show as 0.

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
