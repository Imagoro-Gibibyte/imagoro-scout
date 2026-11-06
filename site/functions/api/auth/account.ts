import { json } from "../posts/_store";
import {
  LIMITS, atLimit, clearedCookie, fail, overLimit, readJson, readSession, salted, verifyPassword, withCookie, type AuthEnv
} from "./_lib";

/** GET /api/auth/account: everything stored about the account, as one JSON download. */
export const onRequestGet: PagesFunction<AuthEnv> = async ({ env, request }) => {
  const db = env.DB!;
  const session = await readSession(env, request);
  if (!session) return fail("Sign in first.", 401);
  const [account, profile, posts, sessions, events] = await Promise.all([
    db.prepare("SELECT email, email_verified_at, created_at, updated_at FROM accounts WHERE id = ?").bind(session.accountId).first(),
    db.prepare("SELECT display_name, bio, website FROM account_profiles WHERE account_id = ?").bind(session.accountId).first(),
    db.prepare("SELECT slug, title, summary, body, skill, author, status, reject_reason, created_at, updated_at, published_at FROM posts WHERE account_id = ? ORDER BY created_at")
      .bind(session.accountId).all(),
    db.prepare("SELECT created_at, expires_at, revoked_at FROM account_sessions WHERE account_id = ? ORDER BY created_at")
      .bind(session.accountId).all(),
    db.prepare("SELECT kind, at FROM account_events WHERE account_id = ? ORDER BY at").bind(session.accountId).all()
  ]);
  const out = json({ account, profile, posts: posts.results, sessions: sessions.results, events: events.results });
  out.headers.set("Content-Disposition", 'attachment; filename="account.json"');
  return out;
};

/**
 * DELETE /api/auth/account { password }: removes the account, its sessions, tokens and history,
 * and every post it submitted, published or not.
 */
export const onRequestDelete: PagesFunction<AuthEnv> = async ({ env, request }) => {
  const db = env.DB!;
  const session = await readSession(env, request);
  if (!session) return fail("Sign in first.", 401);

  const failures = await salted(env, "login-fail", session.email);
  if (await atLimit(db, failures, LIMITS.failuresPerAccount)) return fail("Too many wrong passwords. Try again in 15 minutes.", 429);
  const account = await db.prepare("SELECT password_hash FROM accounts WHERE id = ?").bind(session.accountId)
    .first<{ password_hash: string }>();
  if (!account || !(await verifyPassword(String((await readJson(request)).password ?? ""), account.password_hash))) {
    await overLimit(db, failures, LIMITS.failuresPerAccount);
    return fail("The password is incorrect.", 401, "password");
  }

  // Children first, so the deletes hold with or without foreign-key enforcement.
  const id = session.accountId;
  const owned = "SELECT id FROM posts WHERE account_id = ?";
  await db.batch([
    db.prepare(`DELETE FROM post_images WHERE post_id IN (${owned})`).bind(id),
    db.prepare("DELETE FROM edit_tokens WHERE post_slug IN (SELECT slug FROM posts WHERE account_id = ?)").bind(id),
    db.prepare("DELETE FROM posts WHERE account_id = ?").bind(id),
    ...["account_sessions", "account_events", "password_resets", "email_verifications", "account_profiles"].map((table) =>
      db.prepare(`DELETE FROM ${table} WHERE account_id = ?`).bind(id)
    ),
    db.prepare("DELETE FROM accounts WHERE id = ?").bind(id)
  ]);
  return withCookie(json({ ok: true }), clearedCookie);
};
