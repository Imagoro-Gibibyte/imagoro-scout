# Site

The public portfolio, and the browser terminal that ships with it, as one
static build. Vite + React. The runtime backends are the optional download counter and
the skills-page posts.

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
| `/skills/posts/new` | Submit a post for review |
| `/skills/posts/<slug>` | A published post |
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

## Not-found game

Unknown routes open a shooting gallery in `src/game/`, built from the voxel engine's
shotgun. `shotgun.json` comes from the engine's `shotgun_light.vox.json`. Difficulty is in
`rules.ts`, and targets follow the same grid as the backdrop's slats, using `DEFAULT_SEA`.
Visitors who prefer reduced motion get the plain not-found page.

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

## Posts

Anyone can submit a post on `/skills/posts/new`. Nothing goes live without an operator's
approval, and `functions/api/admin/posts/[id]/approve.ts` is the only code that publishes.

1. **Screening** (`functions/api/posts/_screen.ts`) runs on submit. Images get file-type and
   embedded-content checks, then a Workers AI classifier. Links get structural rules, then a
   lookup on a resolver that blocks malware. Rejected content gets its reasons back and is
   never stored. Every check fails closed: if a check can't run, the content is rejected.
2. **Review** happens in the Site Editor section of the Command Center, in the UI suite. It can
   edit, approve, reject, or take down a live post. Edited links are screened again.

Bodies support headings, lists, links, bold, code and attached images. They're parsed into
blocks (`src/post-body.ts`) and never rendered as HTML. Images are
stored in D1, so they're limited to 1 MB each.

| Binding | Kind | Purpose |
|---|---|---|
| `DB` | D1 | Posts, images and daily limits. Apply `migrations/` in order |
| `AI` | Workers AI | Image classifier. Without it, every image is rejected |
| `SKILL_SALT` | Secret | Daily visitor hash for the limit of 3 submissions |
| `POSTS_ADMIN_TOKEN` | Secret | Bearer token for `/api/admin/*`. Without it, that API stays shut |
| `POSTS_ADMIN_ORIGINS` | Variable | Comma-separated origins allowed to call the admin API |

`migrations/0002_seed_vault_memory.sql` queues the launch post as `pending`, so it needs an
approval like any other post.

`npm test` runs the real handlers against the real migrations on SQLite.

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
