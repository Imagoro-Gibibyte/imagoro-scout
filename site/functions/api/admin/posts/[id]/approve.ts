import { json, type Env } from "../../../posts/_store";

/** POST /api/admin/posts/:id/approve: the only code path that makes a post public. */
export const onRequestPost: PagesFunction<Env> = async ({ env, params }) => {
  const now = new Date().toISOString();
  const { meta } = await env
    .DB!.prepare("UPDATE posts SET status = 'published', published_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'")
    .bind(now, now, String(params.id))
    .run();
  return meta.changes === 1 ? json({ ok: true }) : json({ error: "No pending post with that id" }, 409);
};
