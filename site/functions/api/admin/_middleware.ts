import type { Env } from "../posts/_store";

async function digest(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

/** Compares digests in full, so the time taken says nothing about the token. */
async function sameToken(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([digest(given), digest(expected)]);
  return a.reduce((diff, byte, i) => diff | (byte ^ b[i]!), 0) === 0;
}

/** Every admin route needs the bearer token. Without a configured token the API stays shut. */
export const onRequest: PagesFunction<Env> = async ({ env, request, next }) => {
  const origin = request.headers.get("Origin") ?? "";
  const allowed = (env.POSTS_ADMIN_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean);
  const cors: Record<string, string> = allowed.includes(origin)
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Allow-Methods": "GET, PATCH, POST, OPTIONS",
        Vary: "Origin"
      }
    : {};
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  const given = request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
  let response: Response;
  if (!env.POSTS_ADMIN_TOKEN || !env.DB) response = new Response("Not configured", { status: 503 });
  else if (!(await sameToken(given, env.POSTS_ADMIN_TOKEN))) response = new Response("Unauthorized", { status: 401 });
  else response = await next();

  const out = new Response(response.body, response);
  for (const [key, value] of Object.entries(cors)) out.headers.set(key, value);
  return out;
};
