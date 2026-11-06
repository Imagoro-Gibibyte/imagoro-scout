import { json } from "../posts/_store";
import {
  LIMITS, clientIp, consumeEmailToken, emailLink, fail, issueEmailToken, logEvent, overLimit, readJson, readSession,
  salted, sendMail, type AuthEnv
} from "./_lib";

/**
 * POST /api/auth/verify-email { token }: confirms the address.
 * POST /api/auth/verify-email {} while signed in: sends a new link.
 */
export const onRequestPost: PagesFunction<AuthEnv> = async ({ env, request }) => {
  const db = env.DB!;
  if (await overLimit(db, await salted(env, "token-ip", clientIp(request)), LIMITS.tokenPerIp)) {
    return fail("Too many attempts. Try again later.", 429);
  }
  const token = String((await readJson(request)).token ?? "");
  if (!token) {
    const session = await readSession(env, request);
    if (!session) return fail("Sign in first.", 401);
    if (session.emailVerified) return json({ ok: true, emailSent: false });
    const fresh = await issueEmailToken(db, "email_verifications", session.accountId);
    const emailSent = await sendMail(
      env,
      session.email,
      "Confirm your email",
      `Confirm the email for your account:\n\n${emailLink(request, "/verify", fresh)}`
    );
    return json({ ok: true, emailSent }, 202);
  }

  const accountId = await consumeEmailToken(db, "email_verifications", token);
  if (!accountId) return fail("That link is invalid or has expired.", 410);
  await db.batch([
    db.prepare("UPDATE accounts SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?").bind(new Date().toISOString(), accountId),
    logEvent(db, accountId, "email-verified")
  ]);
  return json({ ok: true });
};
