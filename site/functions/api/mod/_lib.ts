import { RANK, type AuthEnv, type Role, type Session } from "../auth/_lib";

/**
 * Moderation, for signed-in moderators and admins. The tiers:
 *
 *   member     posts, edits their own profile and posts
 *   moderator  reviews posts; resets, suspends and restores members' profiles
 *   admin      everything a moderator does, to moderators too, and sets members' tiers
 *
 * A tier only acts on accounts below it, never on itself. Admins are made by the operator,
 * through the admin API's bearer token (PATCH /api/admin/accounts/:id), not from the site.
 */
export interface ModData extends Record<string, unknown> {
  session: Session;
}

export type ModFunction = PagesFunction<AuthEnv, string, ModData>;

export interface TargetAccount {
  id: string;
  role: Role;
  handle: string | null;
  suspended_at: string | null;
}

export function outranks(actor: Role, target: Role): boolean {
  return RANK[actor] > RANK[target];
}

export async function targetAccount(db: D1Database, id: string): Promise<TargetAccount | null> {
  return db.prepare(
    "SELECT a.id, a.role, a.suspended_at, p.handle FROM accounts a LEFT JOIN account_profiles p ON p.account_id = a.id WHERE a.id = ?"
  )
    .bind(id)
    .first<TargetAccount>();
}

export function log(db: D1Database, actor: string, action: string, target: string, reason?: string | null): D1PreparedStatement {
  return db
    .prepare("INSERT INTO moderation_log (actor_id, action, target, reason, at) VALUES (?, ?, ?, ?, ?)")
    .bind(actor, action, target, reason ? reason.slice(0, 280) : null, new Date().toISOString());
}

export function reasonOf(body: Record<string, unknown>): string | null {
  const reason = String(body.reason ?? "").trim();
  return reason ? reason.slice(0, 280) : null;
}
