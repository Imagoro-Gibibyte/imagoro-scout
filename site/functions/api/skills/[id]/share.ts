import { isEntry, record, type Env } from "../_events";

/** POST /api/skills/:id/share. Same-origin only, so another site can't add to the count. */
export const onRequestPost: PagesFunction<Env> = async ({ env, params, request }) => {
  if (!isEntry(params.id)) return new Response("Not found", { status: 404 });
  if (request.headers.get("Origin") !== new URL(request.url).origin) {
    return new Response("Forbidden", { status: 403 });
  }
  await record(env, request, params.id, "share");
  return new Response(null, { status: 204 });
};
