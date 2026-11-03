import { isEntry, record, type Env } from "../_events";

/** GET /api/skills/:id/download: counts, then sends the browser to the zip. */
export const onRequestGet: PagesFunction<Env> = async ({ env, params, request, waitUntil }) => {
  if (!isEntry(params.id)) return new Response("Not found", { status: 404 });
  waitUntil(record(env, request, params.id, "download"));
  return new Response(null, {
    status: 302,
    headers: { Location: `/downloads/${params.id}.zip`, "Cache-Control": "no-store" }
  });
};
