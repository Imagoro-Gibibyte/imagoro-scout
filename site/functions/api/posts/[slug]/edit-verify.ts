import type { AuthEnv } from "../../auth/_lib";
import { checkEditToken } from "../_edit";

/** POST /api/posts/:slug/edit-verify { email, token }: checks a one-time token before the edit form
 *  opens. It doesn't spend the token: edit-apply does, when the edit is saved. Returns { ok, verified }. */
export const onRequestPost: PagesFunction<AuthEnv> = async ({ env, request, params }) => {
  if (!env.DB || !env.SKILL_SALT) return Response.json({ ok: false, reason: "Not configured." }, { status: 503 });
  const slug = String(params.slug ?? "");
  const body = (await request.json().catch(() => ({}))) as { email?: unknown; token?: unknown };
  const token = String(body.token ?? "").trim();
  if (!body.email || !token) {
    return Response.json({ ok: false, reasons: [{ field: "form", reason: "Email and token are required." }] }, { status: 422 });
  }
  const check = await checkEditToken(env, slug, body.email, token);
  if (!check.ok) return Response.json({ ok: false, reason: check.reason }, { status: check.status });
  return Response.json({ ok: true, verified: true }, { headers: { "Cache-Control": "no-store" } });
};
