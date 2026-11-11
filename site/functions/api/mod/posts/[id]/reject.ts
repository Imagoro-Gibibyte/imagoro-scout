import { json } from "../../../posts/_store";
import { readJson } from "../../../auth/_lib";
import { log, reasonOf, type ModFunction } from "../../_lib";

/** POST /api/mod/posts/:id/reject { reason }: rejects a pending post or takes a published one down. */
export const onRequestPost: ModFunction = async ({ env, params, request, data }) => {
  const db = env.DB!;
  const id = String(params.id);
  const reason = reasonOf(await readJson(request)) ?? "Rejected by a moderator.";
  const now = new Date().toISOString();
  const { meta } = await db
    .prepare("UPDATE posts SET status = 'rejected', reject_reason = ?, published_at = NULL, updated_at = ? WHERE id = ? AND status != 'rejected'")
    .bind(reason, now, id)
    .run();
  if (meta.changes !== 1) return json({ error: "No such post, or it's already rejected" }, 404);
  await db.batch([
    db.prepare("DELETE FROM post_images WHERE post_id = ?").bind(id),
    log(db, data.session.accountId, "post-reject", id, reason)
  ]);
  return json({ ok: true });
};
