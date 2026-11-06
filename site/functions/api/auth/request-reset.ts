import { json } from "../posts/_store";
import {
  LIMITS, clientIp, emailLink, fail, issueEmailToken, normalizeEmail, overLimit, readJson, salted, sendMail, validEmail,
  type AuthEnv
} from "./_lib";

/**
 * POST /api/auth/request-reset { email }. The reply is the same whether or not the account
 * exists, so it can't be used to find out who has one.
 */
export const onRequestPost: PagesFunction<AuthEnv> = async ({ env, request }) => {
  const db = env.DB!;
  if (await overLimit(db, await salted(env, "reset-ip", clientIp(request)), LIMITS.resetPerIp)) {
    return fail("Too many attempts. Try again later.", 429);
  }
  const email = normalizeEmail((await readJson(request)).email);
  if (!validEmail(email)) return fail("A valid email is required.", 422, "email");

  // Over the per-address limit, the request is dropped quietly instead of mailing again.
  const quiet = await overLimit(db, await salted(env, "reset-email", email), LIMITS.resetPerEmail);
  const account = quiet ? null : await db.prepare("SELECT id FROM accounts WHERE email = ?").bind(email).first<{ id: string }>();
  if (account) {
    const token = await issueEmailToken(db, "password_resets", account.id);
    await sendMail(
      env,
      email,
      "Reset your password",
      `Use this link within an hour to choose a new password:\n\n${emailLink(request, "/reset", token)}\n\nIf you didn't ask for this, ignore this message.`
    );
  }
  return json({ ok: true }, 202);
};
