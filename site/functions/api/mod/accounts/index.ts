import { json } from "../../posts/_store";
import { avatarUrl } from "../../_profiles";
import type { ModFunction } from "../_lib";

/**
 * GET /api/mod/accounts?q=: accounts by handle or display name, newest first. Emails stay out:
 * a moderator judges what an account shows, not who it belongs to.
 */
export const onRequestGet: ModFunction = async ({ env, request }) => {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 60);
  const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const { results } = await env.DB!.prepare(
    "SELECT a.id, a.role, a.suspended_at, a.created_at, a.email_verified_at IS NOT NULL AS email_verified, " +
      "p.handle, p.display_name, p.bio, p.website, p.public, (SELECT updated_at FROM account_avatars v WHERE v.account_id = a.id) AS avatar_at, " +
      "(SELECT COUNT(*) FROM posts WHERE account_id = a.id) AS post_count " +
      "FROM accounts a LEFT JOIN account_profiles p ON p.account_id = a.id " +
      "WHERE ?1 = '' OR p.handle LIKE ?2 ESCAPE '\\' OR p.display_name LIKE ?2 ESCAPE '\\' " +
      "ORDER BY a.created_at DESC LIMIT 100"
  )
    .bind(q, like)
    .all<{ id: string; avatar_at: string | null } & Record<string, unknown>>();
  return json(
    results.map(({ avatar_at, ...row }) => ({ ...row, avatar: avatarUrl(`/api/mod/accounts/${row.id}/avatar`, avatar_at) }))
  );
};
