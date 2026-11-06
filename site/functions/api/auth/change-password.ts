import { json } from "../posts/_store";
import {
  LIMITS, atLimit, fail, hashPassword, logEvent, overLimit, passwordProblem, readJson, readSession, revokeSessions,
  salted, verifyPassword, type AuthEnv
} from "./_lib";

/** POST /api/auth/change-password { current, next }: also signs out every other session. */
export const onRequestPost: PagesFunction<AuthEnv> = async ({ env, request }) => {
  const db = env.DB!;
  const session = await readSession(env, request);
  if (!session) return fail("Sign in first.", 401);
  const body = await readJson(request);
  const next = String(body.next ?? "");
  const problem = passwordProblem(next);
  if (problem) return fail(problem, 422, "next");

  // Shares the login lockout, so a stolen session can't be used to guess the password.
  const failures = await salted(env, "login-fail", session.email);
  if (await atLimit(db, failures, LIMITS.failuresPerAccount)) return fail("Too many wrong passwords. Try again in 15 minutes.", 429);
  const account = await db.prepare("SELECT password_hash FROM accounts WHERE id = ?").bind(session.accountId)
    .first<{ password_hash: string }>();
  if (!account || !(await verifyPassword(String(body.current ?? ""), account.password_hash))) {
    await overLimit(db, failures, LIMITS.failuresPerAccount);
    return fail("The current password is incorrect.", 401, "current");
  }

  await db.batch([
    db.prepare("UPDATE accounts SET password_hash = ?, updated_at = ? WHERE id = ?")
      .bind(await hashPassword(next), new Date().toISOString(), session.accountId),
    revokeSessions(db, session.accountId, session.sessionId),
    logEvent(db, session.accountId, "password-change")
  ]);
  return json({ ok: true });
};
