import { json } from "../../../posts/_store";
import { readJson, revokeSessions } from "../../../auth/_lib";
import { log, outranks, reasonOf, targetAccount, type ModFunction } from "../../_lib";

/**
 * POST /api/mod/accounts/:id/suspend { suspended: true|false, reason }
 * A suspended account is signed out everywhere, can't sign in, and its public profile disappears.
 * Its posts stay; take those down one by one if they need to go.
 */
export const onRequestPost: ModFunction = async ({ env, params, request, data }) => {
  const db = env.DB!;
  const target = await targetAccount(db, String(params.id));
  if (!target) return json({ error: "No such account" }, 404);
  if (!outranks(data.session.role, target.role)) return json({ error: "You can only moderate accounts below your tier." }, 403);
  const body = await readJson(request);
  if (typeof body.suspended !== "boolean") return json({ error: "Say whether to suspend: { suspended: true|false }" }, 422);
  const statements = [
    db.prepare("UPDATE accounts SET suspended_at = ? WHERE id = ?").bind(body.suspended ? new Date().toISOString() : null, target.id),
    log(db, data.session.accountId, body.suspended ? "suspend" : "unsuspend", target.id, reasonOf(body))
  ];
  if (body.suspended) statements.push(revokeSessions(db, target.id));
  await db.batch(statements);
  return json({ ok: true, suspended: body.suspended });
};
