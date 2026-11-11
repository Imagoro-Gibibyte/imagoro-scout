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
| `/login`, `/register`, `/reset`, `/verify` | Site accounts |
| `/profile`, `/account/posts` | The signed-in account's profile and posts |
| `/u/<handle>` | A public profile |
| `/moderation` | Post review and account moderation, for moderators and admins |
| `/privacy`, `/terms` | Privacy notice and terms of use, linked from the footer |
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
| `MAIL_PROVIDER_URL` | Variable | URL of the mail relay in `email-worker/`. Without it, no mail is sent |
| `MAIL_API_KEY` | Secret | Bearer token for the relay: the same value as the relay's `RELAY_TOKEN` |

`migrations/0002_seed_vault_memory.sql` queues the launch post as `pending`, so it needs an
approval like any other post.

`npm test` runs the real handlers against the real migrations on SQLite.

Anonymous posts can be edited with a one-time token, mailed only to the address the post was
submitted with. The post keeps a salted hash of that address, never the address itself, and
the token is spent when the edit is saved.

## Accounts

Accounts belong to this site only: a profile, and ownership of the posts submitted while
signed in, which their owner can then edit without a token. They grant nothing anywhere else.
The handlers are in `functions/api/auth/`, and the schema is `migrations/0006_accounts.sql`.

| Route | What |
|---|---|
| `POST /api/auth/register` | Creates the account, mails a confirmation link, and signs in |
| `POST /api/auth/login`, `/logout` | Starts or revokes a session |
| `GET /api/auth/me` | The account and profile, or 401 |
| `PATCH /api/auth/profile` | Display name, handle, bio, an `https://` website, and whether the profile is public |
| `POST`, `DELETE /api/auth/avatar` | Sets or removes the profile picture |
| `GET /api/people/<handle>` | A public profile and its published posts |
| `POST /api/auth/change-password` | Needs the current password, and signs out the other sessions |
| `POST /api/auth/request-reset`, `/reset` | Mails a reset link, then sets the password and signs out every session |
| `POST /api/auth/verify-email` | Confirms the email with a token, or sends a new link |
| `GET /api/auth/posts` | The account's own posts, in every status |
| `GET`, `DELETE /api/auth/account` | Exports everything stored, or deletes the account and its posts |

- **Passwords** are PBKDF2-SHA256 with a random salt, at 100,000 iterations, the most Workers
  allow. The count is stored in each hash, so it can change without breaking old ones. A hash
  takes more CPU than the Workers Free plan allows per request, so accounts need Workers Paid.
- **Sessions** are a random 256-bit token in a `__Host-session` cookie (HttpOnly, Secure,
  SameSite=Lax). Only its SHA-256 is stored. A session lasts 7 days, slides forward while in
  use, and ends 30 days after sign-in at the latest.
- **Mailed tokens** (confirmation, reset) are single-use, stored as hashes, and travel in the
  link's fragment, so they don't reach server logs.
- **Limits** live in `auth_limits`, keyed by salted hashes of the IP or email. Five wrong
  passwords lock an account's sign-in for 15 minutes, and each route has a per-IP limit.
- **CSRF:** `functions/api/auth/_middleware.ts` refuses any state-changing request whose
  `Origin` isn't the site's own.
- Wrong passwords and unknown emails get the same answer, and a reset request answers the same
  whether or not the account exists. Account events record a kind and a time, nothing else.

Apply the migration with `npx wrangler d1 migrations apply <database> --remote`. Accounts need
`DB` and `SKILL_SALT`, and mail needs `MAIL_PROVIDER_URL` and `MAIL_API_KEY`. Without mail,
accounts still work, but confirmation and reset links can't be delivered.

The privacy contact on `/privacy` and `/terms` is the build variable `VITE_PRIVACY_CONTACT`.
Without it, those pages point at `/contact`.

### Profiles

A profile is private until its owner makes it public, which needs a handle. A public profile
shows at `/u/<handle>` and next to its owner's posts, never with the email.

- **Profile pictures** are cropped square in the browser (256 px PNG), shown as circles, and
  screened on the server exactly like post images: file type, embedded content, then the Workers
  AI classifier. 300 KB at most, 10 uploads an hour.
- **Names, handles, bios and post author names** go through `functions/api/_textscreen.ts`. A
  term list runs first, after normalizing what trolls use to disguise words: letters from other
  alphabets, accents, full-width and styled letters, leet digits and symbols, letters spaced out
  or split by punctuation and invisible characters, and repeated letters. Some terms match only
  as whole words, so "Scunthorpe" and "therapist" pass. Text the list passes then goes to Llama
  Guard 3 on Workers AI. Both layers fail closed, and only changed text is screened.
- Handles that read as the site speaking (`admin`, `moderator`, `imagoro` and the like) are
  reserved for moderators and admins.

### Moderation tiers

| Tier | Can |
|---|---|
| member | Post, and edit their own profile and posts |
| moderator | Review posts (approve, reject, take down), and reset, suspend or restore members |
| admin | Everything a moderator can, to moderators too, and move members between member and moderator |

A tier only acts on accounts below it, never on itself. Admins are made by the operator, with
the admin bearer token: `PATCH /api/admin/accounts/<id, handle or email> {"role": "admin"}`.
Moderators see profiles but never emails, and every action goes in `moderation_log` with its
reason. A suspended account is signed out, can't sign in, and its public profile disappears.
The routes are under `functions/api/mod/`, and the schema is
`migrations/0008_profiles_and_moderation.sql`.

### Mail relay

`email-worker/` relays the site's mail through Cloudflare Email Service, with a `send_email`
binding that may only send from the no-reply address. It answers only requests that carry
its `RELAY_TOKEN` as a bearer token, refuses everything when that isn't set, and sends one
recipient per message. The sending domain has to be onboarded to Email Sending first, and
reaching any recipient needs the Workers Paid plan.

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
