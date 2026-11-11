import { json, type Env } from "../posts/_store";
import { avatarUrl } from "../_profiles";

/**
 * GET /api/people/:handle: a public profile and its published posts. A private, suspended or
 * unknown profile answers 404, the same in each case.
 */
export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const db = env.DB;
  if (!db) return json({ error: "Not found" }, 404);
  const row = await db.prepare(
    "SELECT a.id, a.role, a.created_at, p.handle, p.display_name, p.bio, p.website, " +
      "(SELECT updated_at FROM account_avatars WHERE account_id = a.id) AS avatar_at " +
      "FROM account_profiles p JOIN accounts a ON a.id = p.account_id " +
      "WHERE p.handle = ? COLLATE NOCASE AND p.public = 1 AND a.suspended_at IS NULL"
  )
    .bind(String(params.handle ?? ""))
    .first<{ id: string; role: string; created_at: string; handle: string; display_name: string | null; bio: string | null; website: string | null; avatar_at: string | null }>();
  if (!row) return json({ error: "Not found" }, 404);
  const { results } = await db.prepare(
    "SELECT slug, title, summary, published_at FROM posts WHERE account_id = ? AND status = 'published' ORDER BY published_at DESC LIMIT 50"
  )
    .bind(row.id)
    .all();
  return json({
    handle: row.handle,
    displayName: row.display_name,
    bio: row.bio,
    website: row.website,
    role: row.role,
    joined: row.created_at.slice(0, 10),
    avatar: avatarUrl(`/api/people/${row.handle}/avatar`, row.avatar_at),
    posts: results
  });
};
