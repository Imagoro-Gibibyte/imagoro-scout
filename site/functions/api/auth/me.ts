import { json } from "../posts/_store";
import { avatarUrl } from "../_profiles";
import { readSession, withCookie, type AuthEnv } from "./_lib";

/** GET /api/auth/me: the signed-in account and its profile, or 401. */
export const onRequestGet: PagesFunction<AuthEnv> = async ({ env, request }) => {
  const session = await readSession(env, request);
  if (!session) return json({ ok: false }, 401);
  const profile = await env.DB!.prepare(
    "SELECT display_name, bio, website, handle, public, (SELECT updated_at FROM account_avatars WHERE account_id = ?1) AS avatar_at " +
      "FROM account_profiles WHERE account_id = ?1"
  )
    .bind(session.accountId)
    .first<{ display_name: string | null; bio: string | null; website: string | null; handle: string | null; public: number; avatar_at: string | null }>();
  return withCookie(
    json({
      ok: true,
      account: { email: session.email, emailVerified: session.emailVerified, role: session.role },
      profile: {
        displayName: profile?.display_name ?? null,
        bio: profile?.bio ?? null,
        website: profile?.website ?? null,
        handle: profile?.handle ?? null,
        public: !!profile?.public,
        avatar: avatarUrl("/api/auth/avatar", profile?.avatar_at ?? null)
      }
    }),
    session.refresh
  );
};
