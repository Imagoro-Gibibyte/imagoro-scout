import { json } from "../posts/_store";
import { sameOrigin, type AuthEnv } from "./_lib";

/**
 * Every account route: state changes must come from this site's own pages (the CSRF guard,
 * alongside the SameSite cookie), and the routes stay shut until the database and salt are bound.
 */
export const onRequest: PagesFunction<AuthEnv> = async ({ env, request, next }) => {
  if (request.method !== "GET" && request.method !== "HEAD" && !sameOrigin(request)) {
    return new Response("Forbidden", { status: 403 });
  }
  if (!env.DB || !env.SKILL_SALT) {
    return json({ ok: false, reasons: [{ field: "form", reason: "Accounts aren't open yet." }] }, 503);
  }
  return next();
};
