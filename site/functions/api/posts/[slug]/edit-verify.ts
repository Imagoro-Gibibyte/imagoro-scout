import type { Env } from "../_store";

/** POST /api/posts/:slug/edit-verify { email, token } — verifies a one-time token.
 *  The token is hashed client-side? No: the client sends the plaintext over HTTPS;
 *  the server compares it against the stored hash and marks it used. The plaintext
 *  is never persisted. Returns { ok, verified }. */
export const onRequestPost: PagesFunction<Env> = async ({ env, request, params }) => {
  if (!env.DB) return Response.json({ ok: false, reason: "Not configured." }, { status: 503 });
  const slug = String(params.slug ?? "");
  const body = await request.json().catch(() => ({})) as { email?: unknown; token?: unknown };
  const email = String(body.email ?? "").trim();
  const token = String(body.token ?? "").trim();
  if (!email || !token) {
    return Response.json({ ok: false, reasons: [{ field: "form", reason: "Email and token are required." }] }, { status: 422 });
  }

  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  const hash = Array.from(digest).map((b) => b.toString(16).padStart(2, "0")).join("");

  const row = await env.DB.prepare(
    "SELECT id, expires_at, used_at FROM edit_tokens WHERE post_slug = ?1 AND email = ?2 AND token_hash = ?3"
  ).bind(slug, email, hash).first<{ id: string; expires_at: string; used_at: string | null }>();

  if (!row) return Response.json({ ok: false, reason: "Invalid token." }, { status: 401 });
  if (row.used_at) return Response.json({ ok: false, reason: "Token already used." }, { status: 409 });
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return Response.json({ ok: false, reason: "Token expired." }, { status: 410 });
  }

  await env.DB.prepare("UPDATE edit_tokens SET used_at = ?1 WHERE id = ?2").bind(new Date().toISOString(), row.id).run();
  return Response.json({ ok: true, verified: true }, { headers: { "Cache-Control": "no-store" } });
};