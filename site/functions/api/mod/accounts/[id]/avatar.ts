import { avatarResponse } from "../../../_profiles";
import type { ModFunction } from "../../_lib";

/** GET /api/mod/accounts/:id/avatar: any account's picture, private ones included, for review. */
export const onRequestGet: ModFunction = async ({ env, params }) => avatarResponse(env.DB!, String(params.id), "private");
