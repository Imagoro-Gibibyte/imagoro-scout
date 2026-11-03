import { screenLinks } from "../posts/_screen";
import { linksIn } from "../../../src/post-body";
import { visitor } from "../skills/_events";
import {
  checkText,
  json,
  overLimit,
  publicEntry,
  rejected,
  slugify,
  type DevlogRow,
  type Env
} from "./_store";

/** GET /api/devlog: published entries, newest first. ?project= and ?post= narrow. */
export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  if (!env.DB) {
    // No DB: return empty; the page falls back to the static seed.
    return json([]);
  }
  const url = new URL(request.url);
  const project = url.searchParams.get("project");
  const post = url.searchParams.get("post");
  const { results } = await env.DB.prepare(
    "SELECT * FROM devlog_entries WHERE status = 'published' AND (?1 IS NULL OR project = ?1) AND (?2 IS NULL OR post_slug = ?2) ORDER BY date DESC, published_at DESC LIMIT 200"
  )
    .bind(project, post)
    .all<DevlogRow>();
  return json(results.map(publicEntry));
};

/** POST /api/devlog: a JSON submission. Screens, then waits as pending. */
export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  if (request.headers.get("Origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  if (!env.DB || !env.SKILL_SALT) {
    return json({ ok: false, reasons: [{ field: "form", reason: "Posting isn't open yet." }] }, 503);
  }

  const day = new Date().toISOString().slice(0, 10);
  if (await overLimit(env.DB, await visitor(request, day, env.SKILL_SALT), day)) {
    return json({ ok: false, reasons: [{ field: "form", reason: "That's the limit for today. Try again tomorrow." }] }, 429);
  }

  let body: { title?: unknown; body?: unknown; project?: unknown; author?: unknown; post?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return rejected([{ field: "form", reason: "The request body couldn't be read." }]);
  }

  const postSlug = String(body.post ?? "").trim().slice(0, 80) || null;

  const post = {
    title: String(body.title ?? "").trim(),
    body: String(body.body ?? "").trim(),
    project: String(body.project ?? "").trim(),
    author: String(body.author ?? "").trim().slice(0, 60) || "Anonymous"
  };

  const reasons = checkText(post);
  if (reasons.length > 0) return rejected(reasons);

  reasons.push(...(await screenLinks(linksIn(post.body))));
  if (reasons.length > 0) return rejected(reasons);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const date = now.slice(0, 10);
  await env.DB.prepare(
    "INSERT INTO devlog_entries (id, slug, date, project, title, body, author, created_at, updated_at, post_slug) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(id, `${slugify(post.title)}-${id.slice(0, 8)}`, date, post.project, post.title, post.body, post.author, now, now, postSlug).run();

  return json({ ok: true, status: "pending", id }, 202);
};
