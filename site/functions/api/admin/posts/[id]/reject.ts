import { json, type Env } from "../../../posts/_store";

/** POST /api/admin/posts/:id/reject: also takes down a published post, and drops its images. */
export const onRequestPost: PagesFunction<Env> = async ({ env, params, request }) => {
  const id = String(params.id);
  const { reason } = (await request.json().catch(() => ({}))) as { reason?: string };
  const now = new Date().toISOString();
  const [update] = await env.DB!.batch([
    env.DB!.prepare("UPDATE posts SET status = 'rejected', reject_reason = ?, published_at = NULL, updated_at = ? WHERE id = ?").bind(
      reason?.slice(0, 280) ?? "Rejected by a moderator.",
      now,
      id
    ),
    env.DB!.prepare("DELETE FROM post_images WHERE post_id = ?").bind(id)
  ]);
  return update!.meta.changes === 1 ? json({ ok: true }) : json({ error: "Not found" }, 404);
};
