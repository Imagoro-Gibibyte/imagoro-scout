import { linksIn } from "../../../../../src/post-body";
import { screenLinks } from "../../../posts/_screen";
import { checkText, json, rejected, type Env, type PostRow } from "../../../posts/_store";

/** PATCH /api/admin/posts/:id: an edit. Links are screened again, so an edit can't skip the check. */
export const onRequestPatch: PagesFunction<Env> = async ({ env, params, request }) => {
  const db = env.DB!;
  const id = String(params.id);
  const row = await db.prepare("SELECT * FROM posts WHERE id = ?").bind(id).first<PostRow>();
  if (!row) return json({ error: "Not found" }, 404);
  const edit = (await request.json()) as Partial<Pick<PostRow, "title" | "summary" | "body" | "skill">>;
  const post = {
    title: edit.title ?? row.title,
    summary: edit.summary ?? row.summary,
    body: edit.body ?? row.body,
    skill: edit.skill === undefined ? row.skill : edit.skill
  };
  const images = await db.prepare("SELECT COUNT(*) AS n FROM post_images WHERE post_id = ?").bind(id).first<{ n: number }>();
  const reasons = [...checkText(post, images?.n ?? 0), ...(await screenLinks(linksIn(post.body)))];
  if (reasons.length > 0) return rejected(reasons);
  await db
    .prepare("UPDATE posts SET title = ?, summary = ?, body = ?, skill = ?, updated_at = ? WHERE id = ?")
    .bind(post.title, post.summary, post.body, post.skill, new Date().toISOString(), id)
    .run();
  return json({ ok: true });
};
