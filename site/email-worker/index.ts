/**
 * Cloudflare Worker that relays the site's mail: edit tokens, email confirmations and
 * password resets.
 *
 * Bind this worker's URL as MAIL_PROVIDER_URL in the Pages project. The Pages functions
 * POST { to, subject, text } here with `Authorization: Bearer <MAIL_API_KEY>`, so set the
 * Pages MAIL_API_KEY to the same value as this worker's RELAY_TOKEN. MAIL_API_KEY here is the
 * provider key (e.g. a Resend API key) and never leaves this worker.
 *
 * Deploy:  cd site/email-worker && npx wrangler deploy
 * Secrets: npx wrangler secret put MAIL_API_KEY
 *          npx wrangler secret put RELAY_TOKEN
 */
interface Env {
  MAIL_API_KEY: string;
  /** Callers must present this. Without it the relay refuses everything, so it can't be used for spam. */
  RELAY_TOKEN?: string;
  MAIL_FROM?: string;
  RESEND_URL?: string;
}

async function digest(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

/** Compares digests in full, so the time taken says nothing about the token. */
async function sameToken(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([digest(given), digest(expected)]);
  return a.reduce((diff, byte, i) => diff | (byte ^ b[i]!), 0) === 0;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    const given = request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
    if (!env.RELAY_TOKEN) return new Response("Not configured", { status: 503 });
    if (!(await sameToken(given, env.RELAY_TOKEN))) return new Response("Unauthorized", { status: 401 });
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
      // The provider's reply can echo the recipient, so it isn't passed back.
      return Response.json({ ok: false, reason: "provider error", status: res.status }, { status: 502 });
    }
    return Response.json({ ok: true });
  }
};