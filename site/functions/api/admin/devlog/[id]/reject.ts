import { json, type Env } from "../../../devlog/_store";

/** POST /api/admin/devlog/:id/reject */
export const onRequestPost: PagesFunction<Env> = async ({ env, params, request }) => {
  const id = String(params.id);
  const { reason } = (await request.json().catch(() => ({}))) as { reason?: string };
  const now = new Date().toISOString();
  const { meta } = await env.DB!.prepare(
    "UPDATE devlog_entries SET status = 'rejected', reject_reason = ?, published_at = NULL, updated_at = ? WHERE id = ?"
  )
    .bind(reason?.slice(0, 280) ?? "Rejected by a moderator.", now, id)
    .run();
  return meta.changes === 1 ? json({ ok: true }) : json({ error: "Not found" }, 404);
};
