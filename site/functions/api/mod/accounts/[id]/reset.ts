import { json } from "../../../posts/_store";
import { readJson } from "../../../auth/_lib";
import { log, outranks, reasonOf, targetAccount, type ModFunction } from "../../_lib";

const FIELDS = ["avatar", "displayName", "bio", "website", "handle"] as const;
const COLUMNS: Record<Exclude<(typeof FIELDS)[number], "avatar">, string> = {
  displayName: "display_name",
  bio: "bio",
  website: "website",
  handle: "handle"
};

/**
 * POST /api/mod/accounts/:id/reset { fields: ["avatar", "displayName", "bio", "website", "handle"], reason }
 * Clears what an account shows. Clearing the handle also makes the profile private.
 */
export const onRequestPost: ModFunction = async ({ env, params, request, data }) => {
  const db = env.DB!;
  const target = await targetAccount(db, String(params.id));
  if (!target) return json({ error: "No such account" }, 404);
  if (!outranks(data.session.role, target.role)) return json({ error: "You can only moderate accounts below your tier." }, 403);
  const body = await readJson(request);
  const fields = Array.isArray(body.fields) ? FIELDS.filter((f) => (body.fields as unknown[]).includes(f)) : [];
  if (fields.length === 0) return json({ error: "Name the fields to reset." }, 422);

  const statements: D1PreparedStatement[] = [];
  if (fields.includes("avatar")) statements.push(db.prepare("DELETE FROM account_avatars WHERE account_id = ?").bind(target.id));
  const columns = fields.filter((f): f is keyof typeof COLUMNS => f !== "avatar").map((f) => `${COLUMNS[f]} = NULL`);
  if (fields.includes("handle")) columns.push("public = 0");
  if (columns.length > 0) {
    statements.push(db.prepare(`UPDATE account_profiles SET ${columns.join(", ")} WHERE account_id = ?`).bind(target.id));
  }
  statements.push(log(db, data.session.accountId, `reset:${fields.join(",")}`, target.id, reasonOf(body)));
  await db.batch(statements);
  return json({ ok: true, reset: fields });
};
