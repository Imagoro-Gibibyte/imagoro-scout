import { json } from "../posts/_store";
import { clearedCookie, logEvent, readSession, withCookie, type AuthEnv } from "./_lib";

/** POST /api/auth/logout: revokes this session and clears the cookie, signed in or not. */
export const onRequestPost: PagesFunction<AuthEnv> = async ({ env, request }) => {
  const session = await readSession(env, request);
  if (session) {
    await env.DB!.batch([
      env.DB!.prepare("UPDATE account_sessions SET revoked_at = ? WHERE id = ?").bind(new Date().toISOString(), session.sessionId),
      logEvent(env.DB!, session.accountId, "logout")
    ]);
  }
  return withCookie(json({ ok: true }), clearedCookie);
};
