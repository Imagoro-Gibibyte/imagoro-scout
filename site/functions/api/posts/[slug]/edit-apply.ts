import { linksIn } from "../../../../src/post-body";
import { screenLinks } from "../_screen";
import { checkText, json, rejected, type Env, type PostRow } from "../../posts/_store";

/** POST /api/posts/:slug/edit-apply { email, token, title?, summary?, body?, removeImages? }
 *  Verifies the one-time token, then applies text edits and removes selected images. */
export const onRequestPost: PagesFunction<Env> = async ({ env, request, params }) => {
  if (!env.DB) return json({ ok: false, reason: "Not configured." }, 503);
  const slug = String(params.slug ?? "");
  const body = await request.json().catch(() => ({})) as {
    email?: unknown; token?: unknown; title?: unknown; summary?: unknown; body?: unknown;
    removeImages?: unknown;
  };
  const email = String(body.email ?? "").trim();
  const token = String(body.token ?? "").trim();
  if (!email || !token) {
    return json({ ok: false, reasons: [{ field: "form", reason: "Email and token are required." }] }, 422);
  }

  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  const hash = Array.from(digest).map((b) => b.toString(16).padStart(2, "0")).join("");

  const tokenRow = await env.DB.prepare(
    "SELECT id, expires_at, used_at FROM edit_tokens WHERE post_slug = ?1 AND email = ?2 AND token_hash = ?3"
  ).bind(slug, email, hash).first<{ id: string; expires_at: string; used_at: string | null }>();

  if (!tokenRow) return json({ ok: false, reason: "Invalid token." }, 401);
  if (tokenRow.used_at) return json({ ok: false, reason: "Token already used." }, 409);
  if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
    return json({ ok: false, reason: "Token expired." }, 410);
  }

  const row = await env.DB.prepare("SELECT * FROM posts WHERE slug = ?").bind(slug).first<PostRow>();
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

  await env.DB.prepare(
    "UPDATE posts SET title = ?, summary = ?, body = ?, updated_at = ? WHERE id = ?"
  ).bind(next.title, next.summary, next.body, new Date().toISOString(), row.id).run();

  const remove = Array.isArray(body.removeImages) ? body.removeImages.map((n) => Number(n)).filter((n) => Number.isInteger(n)) : [];
  for (const pos of remove) {
    await env.DB.prepare("DELETE FROM post_images WHERE post_id = ? AND position = ?").bind(row.id, pos).run();
  }

  await env.DB.prepare("UPDATE edit_tokens SET used_at = ?1 WHERE id = ?2").bind(new Date().toISOString(), tokenRow.id).run();
  return json({ ok: true });
};