import { json } from "../../../posts/_store";
import { log, type ModFunction } from "../../_lib";

/** POST /api/mod/posts/:id/approve: publishes a pending post, as the admin API does, and logs who did. */
export const onRequestPost: ModFunction = async ({ env, params, data }) => {
  const db = env.DB!;
  const id = String(params.id);
  const now = new Date().toISOString();
  const { meta } = await db
    .prepare("UPDATE posts SET status = 'published', published_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'")
    .bind(now, now, id)
    .run();
  if (meta.changes !== 1) return json({ error: "No pending post with that id" }, 409);
  await log(db, data.session.accountId, "post-approve", id).run();
  return json({ ok: true });
};
