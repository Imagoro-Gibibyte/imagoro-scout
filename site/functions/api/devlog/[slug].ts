import { json, type DevlogRow, type Env } from "./_store";

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  if (!env.DB) return new Response("Not found", { status: 404 });
  const row = await env.DB.prepare("SELECT * FROM devlog_entries WHERE slug = ? AND status = 'published'").bind(String(params.slug)).first<DevlogRow>();
  if (!row) return new Response("Not found", { status: 404 });
  return json({
    slug: row.slug,
    date: row.date,
    project: row.project,
    title: row.title,
    body: row.body,
    author: row.author,
    published_at: row.published_at
  });
};
