import { json } from "../posts/_store";
import {
  LIMITS, atLimit, burnPasswordCheck, clientIp, fail, issueSession, logEvent, normalizeEmail, overLimit, readJson,
  salted, verifyPassword, withCookie, type AuthEnv
} from "./_lib";

const WRONG = "The email or password is incorrect.";

/** POST /api/auth/login { email, password }. Five wrong passwords lock the account for 15 minutes. */
export const onRequestPost: PagesFunction<AuthEnv> = async ({ env, request }) => {
  const db = env.DB!;
  if (await overLimit(db, await salted(env, "login-ip", clientIp(request)), LIMITS.loginPerIp)) {
    return fail("Too many attempts. Try again later.", 429);
  }
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const password = String(body.password ?? "");
  if (!email || !password) return fail(WRONG, 401);

  const failures = await salted(env, "login-fail", email);
  if (await atLimit(db, failures, LIMITS.failuresPerAccount)) {
    return fail("Too many wrong passwords for this account. Try again in 15 minutes, or reset the password.", 429);
  }

  const account = await db
    .prepare("SELECT id, password_hash FROM accounts WHERE email = ?")
    .bind(email)
    .first<{ id: string; password_hash: string }>();
  if (!account) await burnPasswordCheck(password);
  if (!account || !(await verifyPassword(password, account.password_hash))) {
    await overLimit(db, failures, LIMITS.failuresPerAccount);
    if (account) await logEvent(db, account.id, "login-failed").run();
    return fail(WRONG, 401);
  }

  await logEvent(db, account.id, "login").run();
  return withCookie(json({ ok: true }), await issueSession(env, request, account.id));
};
