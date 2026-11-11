/**
 * Cloudflare Worker that relays the site's mail: edit tokens, email confirmations and
 * password resets. It sends through Cloudflare Email Service, so no provider key is involved.
 *
 * Bind this worker's URL as MAIL_PROVIDER_URL in the Pages project. The Pages functions
 * POST { to, subject, text } here with `Authorization: Bearer <MAIL_API_KEY>`, so set the
 * Pages MAIL_API_KEY to the same value as this worker's RELAY_TOKEN.
 *
 * The sending domain must be onboarded to Email Sending (dashboard: Email Service >
 * Email Sending > Onboard Domain), which needs the Workers Paid plan to reach any recipient.
 *
 * Deploy:  cd site/email-worker && npx wrangler deploy
 * Secret:  npx wrangler secret put RELAY_TOKEN
 */
interface Env {
  EMAIL: SendEmail;
  /** Callers must present this. Without it the relay refuses everything, so it can't be used for spam. */
  RELAY_TOKEN?: string;
  MAIL_FROM?: string;
}

const MAX = { subject: 200, text: 10_000 };

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
    const subject = String(body.subject ?? "").trim();
    const text = String(body.text ?? "").trim();
    // One recipient per message, so a caller can't turn the relay into a mailing list.
    if (!/^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/.test(to) || !subject || !text) {
      return Response.json({ ok: false, reason: "missing or invalid fields" }, { status: 422 });
    }
    if (subject.length > MAX.subject || text.length > MAX.text) {
      return Response.json({ ok: false, reason: "too long" }, { status: 413 });
    }

    try {
      const sent = await env.EMAIL.send({ to, from: env.MAIL_FROM || "noreply@imagoro.net", subject, text });
      return Response.json({ ok: true, id: sent.messageId });
    } catch (err) {
      // The error code says why without echoing the recipient.
      const code = (err as { code?: string }).code ?? "E_UNKNOWN";
      return Response.json({ ok: false, reason: "send failed", code }, { status: 502 });
    }
  }
};
