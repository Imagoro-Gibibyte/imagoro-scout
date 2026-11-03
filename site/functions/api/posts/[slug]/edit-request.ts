import type { Env } from "../_store";

/** POST /api/posts/:slug/edit-request { email } — issues a one-time edit token.
 *  The plaintext token is never stored; only its SHA-256 hash is kept in D1.
 *  Email delivery is an integration point: configure a provider (e.g. Resend)
 *  via MAIL_PROVIDER_URL / MAIL_API_KEY, or a Cloudflare Email Worker binding.
 *  Without a provider the token is still issued and hashed, but not delivered. */
export const onRequestPost: PagesFunction<Env & { MAIL_PROVIDER_URL?: string; MAIL_API_KEY?: string }> = async ({ env, request, params }) => {
  if (!env.DB || !env.SKILL_SALT) return Response.json({ ok: false, reason: "Not configured." }, { status: 503 });
  const slug = String(params.slug ?? "");
  const body = await request.json().catch(() => ({})) as { email?: unknown };
  const email = String(body.email ?? "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Response.json({ ok: false, reasons: [{ field: "email", reason: "A valid email is required." }] }, { status: 422 });
  }

  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  const hash = Array.from(digest).map((b) => b.toString(16).padStart(2, "0")).join("");

  const id = crypto.randomUUID();
  const now = new Date();
  const expires = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
  await env.DB.prepare(
    "INSERT INTO edit_tokens (id, post_slug, email, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(id, slug, email, hash, expires, now.toISOString()).run();

  // Delivery is best-effort and pluggable. The token itself is never returned here.
  let emailSent = false;
  if (env.MAIL_PROVIDER_URL && env.MAIL_API_KEY) {
    try {
      await fetch(env.MAIL_PROVIDER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.MAIL_API_KEY}` },
        body: JSON.stringify({ to: email, subject: "Your edit token", text: `Token: ${token}\nExpires: ${expires}` })
      });
      emailSent = true;
    } catch {
      emailSent = false;
    }
  }

  return Response.json({ ok: true, emailSent }, { status: 202, headers: { "Cache-Control": "no-store" } });
};