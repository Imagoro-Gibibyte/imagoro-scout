import { json } from "../posts/_store";
import {
  LIMITS, clientIp, emailLink, fail, hashPassword, issueEmailToken, issueSession, logEvent, normalizeEmail,
  overLimit, passwordProblem, readJson, salted, sendMail, validEmail, withCookie, type AuthEnv
} from "./_lib";

/** POST /api/auth/register { email, password, displayName? }: creates the account and signs it in. */
export const onRequestPost: PagesFunction<AuthEnv> = async ({ env, request }) => {
  const db = env.DB!;
  if (await overLimit(db, await salted(env, "register-ip", clientIp(request)), LIMITS.registerPerIp)) {
    return fail("Too many attempts. Try again later.", 429);
  }
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const password = String(body.password ?? "");
  const displayName = String(body.displayName ?? "").trim().slice(0, 60) || null;
  if (!validEmail(email)) return fail("A valid email is required.", 422, "email");
  const problem = passwordProblem(password);
  if (problem) return fail(problem, 422, "password");

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const taken = fail("That email can't be used to register. If it's yours, sign in or reset the password.", 409, "email");
  if (await db.prepare("SELECT 1 FROM accounts WHERE email = ?").bind(email).first()) return taken;
  try {
    await db.batch([
      db.prepare("INSERT INTO accounts (id, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
        .bind(id, email, await hashPassword(password), now, now),
      db.prepare("INSERT INTO account_profiles (account_id, display_name) VALUES (?, ?)").bind(id, displayName),
      logEvent(db, id, "register")
    ]);
  } catch {
    // Two sign-ups racing for one address: the unique index lets only one through.
    return taken;
  }

  const token = await issueEmailToken(db, "email_verifications", id);
  const emailSent = await sendMail(
    env,
    email,
    "Confirm your email",
    `Confirm the email for your account:\n\n${emailLink(request, "/verify", token)}\n\nIf you didn't create an account, ignore this message.`
  );
  return withCookie(json({ ok: true, emailSent }, 201), await issueSession(env, request, id));
};
