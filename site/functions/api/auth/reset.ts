import { json } from "../posts/_store";
import {
  LIMITS, clientIp, consumeEmailToken, fail, hashPassword, logEvent, overLimit, passwordProblem, readJson,
  revokeSessions, salted, type AuthEnv
} from "./_lib";

/** POST /api/auth/reset { token, password }: sets the password and signs out every session. */
export const onRequestPost: PagesFunction<AuthEnv> = async ({ env, request }) => {
  const db = env.DB!;
  if (await overLimit(db, await salted(env, "token-ip", clientIp(request)), LIMITS.tokenPerIp)) {
    return fail("Too many attempts. Try again later.", 429);
  }
  const body = await readJson(request);
  const password = String(body.password ?? "");
  const problem = passwordProblem(password);
  if (problem) return fail(problem, 422, "password");

  const accountId = await consumeEmailToken(db, "password_resets", String(body.token ?? ""));
  if (!accountId) return fail("That link is invalid or has expired. Ask for a new one.", 410);
  await db.batch([
    db.prepare("UPDATE accounts SET password_hash = ?, updated_at = ? WHERE id = ?")
      .bind(await hashPassword(password), new Date().toISOString(), accountId),
    revokeSessions(db, accountId),
    logEvent(db, accountId, "password-reset")
  ]);
  return json({ ok: true });
};
