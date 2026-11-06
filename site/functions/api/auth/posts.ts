import { json } from "../posts/_store";
import { fail, readSession, type AuthEnv } from "./_lib";

/** GET /api/auth/posts: the signed-in account's own posts, in every status, newest first. */
export const onRequestGet: PagesFunction<AuthEnv> = async ({ env, request }) => {
  const session = await readSession(env, request);
  if (!session) return fail("Sign in first.", 401);
  const { results } = await env.DB!.prepare(
    "SELECT slug, title, summary, status, reject_reason, created_at, published_at FROM posts WHERE account_id = ? ORDER BY created_at DESC"
  )
    .bind(session.accountId)
    .all();
  return json(results);
};
