import { json, type Env } from "../../posts/_store";

/**
 * PATCH /api/admin/accounts/:id { role: "member" | "moderator" | "admin" }, behind the admin bearer token.
 * The operator's way to make admins: `:id` is an account id, a handle, or an email.
 */
export const onRequestPatch: PagesFunction<Env> = async ({ env, params, request }) => {
  const db = env.DB!;
  const { role } = (await request.json().catch(() => ({}))) as { role?: unknown };
  if (role !== "member" && role !== "moderator" && role !== "admin") return json({ error: "Unknown role" }, 422);
  const key = String(params.id ?? "");
  const account = await db.prepare(
    "SELECT a.id FROM accounts a LEFT JOIN account_profiles p ON p.account_id = a.id " +
      "WHERE a.id = ?1 OR a.email = ?1 COLLATE NOCASE OR p.handle = ?1 COLLATE NOCASE"
  )
    .bind(key)
    .first<{ id: string }>();
  if (!account) return json({ error: "No such account" }, 404);
  await db.batch([
    db.prepare("UPDATE accounts SET role = ? WHERE id = ?").bind(role, account.id),
    db.prepare("INSERT INTO moderation_log (actor_id, action, target, at) VALUES ('operator', ?, ?, ?)")
      .bind(`role:${role}`, account.id, new Date().toISOString())
  ]);
  return json({ ok: true, id: account.id, role });
};
