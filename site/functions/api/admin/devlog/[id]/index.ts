import { linksIn } from "../../../../../src/post-body";
import { screenLinks } from "../../../posts/_screen";
import { checkText, json, rejected, type DevlogRow, type Env } from "../../../devlog/_store";

/** PATCH /api/admin/devlog/:id: an edit. Links are screened again. */
export const onRequestPatch: PagesFunction<Env> = async ({ env, params, request }) => {
  const db = env.DB!;
  const id = String(params.id);
  const row = await db.prepare("SELECT * FROM devlog_entries WHERE id = ?").bind(id).first<DevlogRow>();
  if (!row) return json({ error: "Not found" }, 404);
  const edit = (await request.json()) as Partial<Pick<DevlogRow, "title" | "body" | "project">>;
  const post = {
    title: edit.title ?? row.title,
    body: edit.body ?? row.body,
    project: edit.project ?? row.project
  };
  const reasons = [...checkText(post)];
  if (reasons.length > 0) return rejected(reasons);
  reasons.push(...(await screenLinks(linksIn(post.body))));
  if (reasons.length > 0) return rejected(reasons);
  await db
    .prepare("UPDATE devlog_entries SET title = ?, body = ?, project = ?, updated_at = ? WHERE id = ?")
    .bind(post.title, post.body, post.project, new Date().toISOString(), id)
    .run();
  return json({ ok: true });
};
