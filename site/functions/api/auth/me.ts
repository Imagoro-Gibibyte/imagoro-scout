import { json } from "../posts/_store";
import { readSession, withCookie, type AuthEnv } from "./_lib";

/** GET /api/auth/me: the signed-in account and its profile, or 401. */
export const onRequestGet: PagesFunction<AuthEnv> = async ({ env, request }) => {
  const session = await readSession(env, request);
  if (!session) return json({ ok: false }, 401);
  const profile = await env.DB!.prepare("SELECT display_name, bio, website FROM account_profiles WHERE account_id = ?")
    .bind(session.accountId)
    .first<{ display_name: string | null; bio: string | null; website: string | null }>();
  return withCookie(
    json({
      ok: true,
      account: { email: session.email, emailVerified: session.emailVerified },
      profile: { displayName: profile?.display_name ?? null, bio: profile?.bio ?? null, website: profile?.website ?? null }
    }),
    session.refresh
  );
};
