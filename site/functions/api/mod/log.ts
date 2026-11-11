import { json } from "../posts/_store";
import type { ModFunction } from "./_lib";

/** GET /api/mod/log: the latest moderator actions, with handles where the accounts still have them. */
export const onRequestGet: ModFunction = async ({ env }) => {
  const { results } = await env.DB!.prepare(
    "SELECT l.action, l.target, l.reason, l.at, actor.handle AS actor_handle, subject.handle AS target_handle " +
      "FROM moderation_log l LEFT JOIN account_profiles actor ON actor.account_id = l.actor_id " +
      "LEFT JOIN account_profiles subject ON subject.account_id = l.target ORDER BY l.at DESC LIMIT 200"
  ).all();
  return json(results);
};
