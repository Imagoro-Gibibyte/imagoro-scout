import { IMAGE_HEADERS } from "../../../../posts/images/[id]/[position]";
import type { Env } from "../../../../posts/_store";

/** GET /api/admin/posts/images/:id/:position: lets the editor preview a pending post's images. */
export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const row = await env
    .DB!.prepare("SELECT mime, bytes FROM post_images WHERE post_id = ? AND position = ?")
    .bind(String(params.id), Number(params.position))
    .first<{ mime: string; bytes: number[] }>();
  if (!row) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(row.bytes), {
    headers: { "Content-Type": row.mime, "Cache-Control": "no-store", ...IMAGE_HEADERS }
  });
};
