import { LIMITS, clientIp, normalizeEmail, overLimit, salted, sendMail, sha256Hex, validEmail, type AuthEnv } from "../../auth/_lib";
import { editEmailHash } from "../_edit";

/** POST /api/posts/:slug/edit-request { email }: mails a one-time edit token.
 *  A token is issued only when the email is the one the post was submitted with, and the reply is
 *  the same either way, so it says nothing about who wrote a post. Only hashes of the token and the
 *  email are stored. Delivery goes through the mail relay (MAIL_PROVIDER_URL / MAIL_API_KEY). */
export const onRequestPost: PagesFunction<AuthEnv> = async ({ env, request, params }) => {
  if (!env.DB || !env.SKILL_SALT) return Response.json({ ok: false, reason: "Not configured." }, { status: 503 });
  if (request.headers.get("Origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  if (await overLimit(env.DB, await salted(env, "edit-ip", clientIp(request)), LIMITS.resetPerIp)) {
    return Response.json({ ok: false, reasons: [{ field: "form", reason: "Too many attempts. Try again later." }] }, { status: 429 });
  }
  const slug = String(params.slug ?? "");
  const body = (await request.json().catch(() => ({}))) as { email?: unknown };
  const email = normalizeEmail(body.email);
  if (!validEmail(email)) {
    return Response.json({ ok: false, reasons: [{ field: "email", reason: "A valid email is required." }] }, { status: 422 });
  }

  const emailHash = await editEmailHash(env, email);
  const owner = await env.DB.prepare("SELECT 1 FROM posts WHERE slug = ? AND edit_email_hash = ?").bind(slug, emailHash).first();
  if (owner) {
    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const now = new Date();
    const expires = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
    await env.DB.prepare(
      "INSERT INTO edit_tokens (id, post_slug, email, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(crypto.randomUUID(), slug, emailHash, await sha256Hex(token), expires, now.toISOString()).run();
    await sendMail(env, email, "Your edit token", `Token: ${token}\nExpires: ${expires}`);
  }

  return Response.json({ ok: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
};
