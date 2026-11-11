import { json, type PostRow } from "../../posts/_store";
import type { ModFunction } from "../_lib";

/** GET /api/mod/posts?status=pending|published|rejected: the review queue, with each author's account. */
export const onRequestGet: ModFunction = async ({ env, request }) => {
  const status = new URL(request.url).searchParams.get("status") ?? "pending";
  if (!["pending", "published", "rejected"].includes(status)) return json({ error: "Unknown status" }, 400);
  const order = status === "pending" ? "p.created_at" : "p.updated_at DESC";
  const { results } = await env.DB!.prepare(
    "SELECT p.id, p.slug, p.title, p.summary, p.body, p.skill, p.author, p.status, p.reject_reason, p.created_at, p.published_at, " +
      "(SELECT COUNT(*) FROM post_images i WHERE i.post_id = p.id) AS image_count, pr.handle AS account_handle, a.role AS account_role " +
      `FROM posts p LEFT JOIN accounts a ON a.id = p.account_id LEFT JOIN account_profiles pr ON pr.account_id = p.account_id WHERE p.status = ? ORDER BY ${order} LIMIT 100`
  )
    .bind(status)
    .all<PostRow & { image_count: number; account_handle: string | null; account_role: string | null }>();
  return json(results);
};
