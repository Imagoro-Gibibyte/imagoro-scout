/**
 * Cloudflare Worker that sends one-time edit tokens by email.
 *
 * Bind this worker's URL as MAIL_PROVIDER_URL in the Pages project, and set
 * MAIL_API_KEY to your provider key (e.g. a Resend API key). The Pages function
 * at /api/posts/:slug/edit-request POSTs { to, subject, text } here.
 *
 * Deploy:  cd site/email-worker && npx wrangler deploy
 * Secret:  npx wrangler secret put MAIL_API_KEY
 */
interface Env {
  MAIL_API_KEY: string;
  MAIL_FROM?: string;
  RESEND_URL?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    let body: { to?: string; subject?: string; text?: string };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return Response.json({ ok: false, reason: "bad json" }, { status: 400 });
    }
    const to = String(body.to ?? "").trim();
    const subject = String(body.subject ?? "Your edit token").trim();
    const text = String(body.text ?? "").trim();
    if (!to || !text) return Response.json({ ok: false, reason: "missing fields" }, { status: 422 });

    const url = env.RESEND_URL || "https://api.resend.com/emails";
    const from = env.MAIL_FROM || "noreply@imagoro.net";
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.MAIL_API_KEY}` },
      body: JSON.stringify({ from, to, subject, text })
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return Response.json({ ok: false, reason: "provider error", detail }, { status: 502 });
    }
    return Response.json({ ok: true });
  }
};