import { json, type DevlogRow, type Env } from "../../devlog/_store";

/** GET /api/admin/devlog?status=pending: the queue, newest first. */
export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  if (!env.DB) return json([]);
  const status = new URL(request.url).searchParams.get("status") ?? "pending";
  const { results } = await env.DB.prepare(
    "SELECT * FROM devlog_entries WHERE status = ? ORDER BY created_at DESC LIMIT 200"
  )
    .bind(status)
    .all<DevlogRow>();
  return json(results);
};
