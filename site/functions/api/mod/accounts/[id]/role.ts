import { json } from "../../../posts/_store";
import { readJson } from "../../../auth/_lib";
import { log, outranks, reasonOf, targetAccount, type ModFunction } from "../../_lib";

/**
 * POST /api/mod/accounts/:id/role { role: "member" | "moderator", reason }: admins only.
 * Making an admin is the operator's call, through the admin API.
 */
export const onRequestPost: ModFunction = async ({ env, params, request, data }) => {
  const db = env.DB!;
  if (data.session.role !== "admin") return json({ error: "Only admins set tiers." }, 403);
  const target = await targetAccount(db, String(params.id));
  if (!target) return json({ error: "No such account" }, 404);
  if (!outranks(data.session.role, target.role)) return json({ error: "You can only change tiers below your own." }, 403);
  const body = await readJson(request);
  if (body.role !== "member" && body.role !== "moderator") return json({ error: "The tier must be member or moderator." }, 422);
  await db.batch([
    db.prepare("UPDATE accounts SET role = ? WHERE id = ?").bind(body.role, target.id),
    log(db, data.session.accountId, `role:${body.role}`, target.id, reasonOf(body))
  ]);
  return json({ ok: true, role: body.role });
};
