import { json, publicPost, type Env, type PostRow } from "./_store";

/** GET /api/posts/:slug. Unpublished posts answer 404, the same as ones that don't exist. */
export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const row = await env.DB?.prepare("SELECT * FROM posts WHERE slug = ? AND status = 'published'")
    .bind(String(params.slug))
    .first<PostRow>();
  if (!row) return json({ error: "Not found" }, 404);
  return json(await publicPost(env.DB!, row));
};
