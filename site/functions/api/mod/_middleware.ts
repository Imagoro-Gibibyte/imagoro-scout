import { json } from "../posts/_store";
import { RANK, readSession, sameOrigin } from "../auth/_lib";
import type { ModFunction } from "./_lib";

/**
 * Every moderation route: state changes only from this site's own pages, and only for a
 * signed-in moderator or admin. The session is handed to the route in `data`.
 */
export const onRequest: ModFunction = async ({ env, request, next, data }) => {
  if (request.method !== "GET" && request.method !== "HEAD" && !sameOrigin(request)) {
    return new Response("Forbidden", { status: 403 });
  }
  if (!env.DB || !env.SKILL_SALT) return json({ ok: false, reasons: [{ field: "form", reason: "Not configured." }] }, 503);
  const session = await readSession(env, request);
  if (!session) return json({ ok: false, reasons: [{ field: "form", reason: "Sign in first." }] }, 401);
  if (RANK[session.role] < RANK.moderator) return json({ ok: false, reasons: [{ field: "form", reason: "Moderators only." }] }, 403);
  data.session = session;
  return next();
};
