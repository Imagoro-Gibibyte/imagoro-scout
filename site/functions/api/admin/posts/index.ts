import { json, type Env, type PostRow } from "../../posts/_store";

/** GET /api/admin/posts?status=pending: the editor's queue, oldest first. */
export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const status = new URL(request.url).searchParams.get("status") ?? "pending";
  const { results } = await env.DB!.prepare(
    "SELECT p.*, (SELECT COUNT(*) FROM post_images i WHERE i.post_id = p.id) AS image_count " +
      "FROM posts p WHERE status = ? ORDER BY created_at LIMIT 200"
  )
    .bind(status)
    .all<PostRow & { image_count: number }>();
  return json(results);
};
