import type { Env } from "../../_store";

/** Stops a browser treating a stored file as a page, whatever is inside it. */
export const IMAGE_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox"
};

/** GET /api/posts/images/:id/:position: only for a published post. */
export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const row = await env.DB?.prepare(
    "SELECT i.mime, i.bytes FROM post_images i JOIN posts p ON p.id = i.post_id " +
      "WHERE i.post_id = ? AND i.position = ? AND p.status = 'published'"
  )
    .bind(String(params.id), Number(params.position))
    .first<{ mime: string; bytes: number[] }>();
  if (!row) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(row.bytes), {
    headers: { "Content-Type": row.mime, "Cache-Control": "public, max-age=300", ...IMAGE_HEADERS }
  });
};
