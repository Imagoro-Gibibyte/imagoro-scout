import { json } from "../posts/_store";
import { avatarResponse, screenAvatar } from "../_profiles";
import { fail, overLimit, readSession, type AuthEnv } from "./_lib";

/** Each upload calls the image classifier, so uploads are limited per account. */
const UPLOADS = { max: 10, windowMs: 3600_000 };

/** GET /api/auth/avatar: the signed-in account's own picture, public profile or not. */
export const onRequestGet: PagesFunction<AuthEnv> = async ({ env, request }) => {
  const session = await readSession(env, request);
  if (!session) return new Response("Not found", { status: 404 });
  return avatarResponse(env.DB!, session.accountId, "private");
};

/**
 * POST /api/auth/avatar (multipart, field "avatar"): screened like a post image, then stored.
 * The page crops it square first; it's shown as a circle.
 */
export const onRequestPost: PagesFunction<AuthEnv> = async ({ env, request }) => {
  const db = env.DB!;
  const session = await readSession(env, request);
  if (!session) return fail("Sign in first.", 401);
  if (await overLimit(db, `avatar:${session.accountId}`, UPLOADS)) return fail("Too many uploads. Try again later.", 429);
  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("avatar");
  } catch {
    return fail("The upload couldn't be read.", 422, "avatar");
  }
  if (!file || typeof file === "string") return fail("Choose an image.", 422, "avatar");
  const screened = await screenAvatar(env.AI, file);
  if ("reason" in screened) return json({ ok: false, reasons: [screened] }, 422);
  const now = new Date().toISOString();
  await db.prepare(
    "INSERT INTO account_avatars (account_id, mime, bytes, updated_at) VALUES (?1, ?2, ?3, ?4) " +
      "ON CONFLICT (account_id) DO UPDATE SET mime = ?2, bytes = ?3, updated_at = ?4"
  )
    .bind(session.accountId, screened.mime, screened.bytes, now)
    .run();
  return json({ ok: true, avatar: `/api/auth/avatar?v=${encodeURIComponent(now)}` });
};

/** DELETE /api/auth/avatar */
export const onRequestDelete: PagesFunction<AuthEnv> = async ({ env, request }) => {
  const session = await readSession(env, request);
  if (!session) return fail("Sign in first.", 401);
  await env.DB!.prepare("DELETE FROM account_avatars WHERE account_id = ?").bind(session.accountId).run();
  return json({ ok: true });
};
