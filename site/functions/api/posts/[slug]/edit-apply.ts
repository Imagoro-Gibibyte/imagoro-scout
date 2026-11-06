import { linksIn } from "../../../../src/post-body";
import { readSession, type AuthEnv } from "../../auth/_lib";
import { checkEditToken } from "../_edit";
import { screenLinks } from "../_screen";
import { checkText, json, rejected, type PostRow } from "../../posts/_store";

/** POST /api/posts/:slug/edit-apply { email?, token?, title?, summary?, body?, removeImages? }
 *  The post's owner edits with their session. Anyone else needs the one-time token, which is
 *  spent only once the edit passes screening. Applies text edits and removes selected images. */
export const onRequestPost: PagesFunction<AuthEnv> = async ({ env, request, params }) => {
  if (!env.DB || !env.SKILL_SALT) return json({ ok: false, reason: "Not configured." }, 503);
  if (request.headers.get("Origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  const slug = String(params.slug ?? "");
  const body = await request.json().catch(() => ({})) as {
    email?: unknown; token?: unknown; title?: unknown; summary?: unknown; body?: unknown;
    removeImages?: unknown;
  };

  const row = await env.DB.prepare("SELECT * FROM posts WHERE slug = ?").bind(slug).first<PostRow & { account_id: string | null }>();
  const session = await readSession(env, request);
  const owner = !!row?.account_id && session?.accountId === row.account_id;
  const token = String(body.token ?? "").trim();
  if (!owner) {
    if (!body.email || !token) {
      return json({ ok: false, reasons: [{ field: "form", reason: "Email and token are required." }] }, 422);
    }
    const check = await checkEditToken(env, slug, body.email, token);
    if (!check.ok) return json({ ok: false, reason: check.reason }, check.status);
  }
  if (!row) return json({ ok: false, reason: "Post not found." }, 404);

  const next = {
    title: body.title === undefined ? row.title : String(body.title ?? "").trim(),
    summary: body.summary === undefined ? row.summary : String(body.summary ?? "").trim(),
    body: body.body === undefined ? row.body : String(body.body ?? "").trim(),
    skill: row.skill
  };

  const images = await env.DB.prepare("SELECT COUNT(*) AS n FROM post_images WHERE post_id = ?").bind(row.id).first<{ n: number }>();
  const reasons = [...checkText(next, images?.n ?? 0), ...(await screenLinks(linksIn(next.body)))];
  if (reasons.length > 0) return rejected(reasons);

  if (!owner) {
    const spent = await checkEditToken(env, slug, body.email, token, true);
    if (!spent.ok) return json({ ok: false, reason: spent.reason }, spent.status);
  }

  await env.DB.prepare(
    "UPDATE posts SET title = ?, summary = ?, body = ?, updated_at = ? WHERE id = ?"
  ).bind(next.title, next.summary, next.body, new Date().toISOString(), row.id).run();

  const remove = Array.isArray(body.removeImages) ? body.removeImages.map((n) => Number(n)).filter((n) => Number.isInteger(n)) : [];
  for (const pos of remove) {
    await env.DB.prepare("DELETE FROM post_images WHERE post_id = ? AND position = ?").bind(row.id, pos).run();
  }
  return json({ ok: true });
};
