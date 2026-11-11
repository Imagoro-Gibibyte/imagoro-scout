import type { Env } from "../../posts/_store";
import { avatarResponse } from "../../_profiles";

/** GET /api/people/:handle/avatar: only for a public, unsuspended profile. */
export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const row = await env.DB?.prepare(
    "SELECT a.id FROM account_profiles p JOIN accounts a ON a.id = p.account_id " +
      "WHERE p.handle = ? COLLATE NOCASE AND p.public = 1 AND a.suspended_at IS NULL"
  )
    .bind(String(params.handle ?? ""))
    .first<{ id: string }>();
  if (!row) return new Response("Not found", { status: 404 });
  return avatarResponse(env.DB!, row.id, "public");
};
