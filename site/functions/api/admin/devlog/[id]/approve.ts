import { json, type Env } from "../../../devlog/_store";

/** POST /api/admin/devlog/:id/approve */
export const onRequestPost: PagesFunction<Env> = async ({ env, params }) => {
  const now = new Date().toISOString();
  const { meta } = await env
    .DB!.prepare("UPDATE devlog_entries SET status = 'published', published_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'")
    .bind(now, now, String(params.id))
    .run();
  return meta.changes === 1 ? json({ ok: true }) : json({ error: "No pending entry with that id" }, 409);
};
