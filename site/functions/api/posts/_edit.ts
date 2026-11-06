import { normalizeEmail, salted, sha256Hex, type AuthEnv } from "../auth/_lib";

/** Edit tokens and post owners are matched on this, so no edit email is stored in the clear. */
export function editEmailHash(env: AuthEnv, email: unknown): Promise<string> {
  return salted(env, "post-email", normalizeEmail(email));
}

export type TokenCheck = { ok: true; id: string } | { ok: false; status: number; reason: string };

/** Checks a post's edit token. Only `consume` spends it, so the page can check it before the edit. */
export async function checkEditToken(
  env: AuthEnv,
  slug: string,
  email: unknown,
  token: string,
  consume = false
): Promise<TokenCheck> {
  const db = env.DB!;
  const hash = await sha256Hex(token);
  const emailHash = await editEmailHash(env, email);
  const row = await db
    .prepare("SELECT id, expires_at, used_at FROM edit_tokens WHERE post_slug = ?1 AND email = ?2 AND token_hash = ?3")
    .bind(slug, emailHash, hash)
    .first<{ id: string; expires_at: string; used_at: string | null }>();
  if (!row) return { ok: false, status: 401, reason: "Invalid token." };
  if (row.used_at) return { ok: false, status: 409, reason: "Token already used." };
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, status: 410, reason: "Token expired." };
  if (consume) {
    // The update is the check, so one token can't be spent twice by racing requests.
    const spent = await db
      .prepare("UPDATE edit_tokens SET used_at = ?1 WHERE id = ?2 AND used_at IS NULL RETURNING id")
      .bind(new Date().toISOString(), row.id)
      .first();
    if (!spent) return { ok: false, status: 409, reason: "Token already used." };
  }
  return { ok: true, id: row.id };
}
