import { json } from "../posts/_store";
import { fail, readJson, readSession, type AuthEnv } from "./_lib";

const MAX = { displayName: 60, bio: 500, website: 200 };

/** Only an https URL, so a profile can't carry a script or a local link. Undefined means invalid. */
function website(raw: string): string | null | undefined {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** PATCH /api/auth/profile { displayName?, bio?, website? }: fields left out keep their value. */
export const onRequestPatch: PagesFunction<AuthEnv> = async ({ env, request }) => {
  const session = await readSession(env, request);
  if (!session) return fail("Sign in first.", 401);
  const body = await readJson(request);
  const current = await env.DB!.prepare("SELECT display_name, bio, website FROM account_profiles WHERE account_id = ?")
    .bind(session.accountId)
    .first<{ display_name: string | null; bio: string | null; website: string | null }>();

  const given = (key: string, fallback: string | null | undefined) =>
    body[key] === undefined ? (fallback ?? "") : String(body[key] ?? "").trim();
  const displayName = given("displayName", current?.display_name) || null;
  const bio = given("bio", current?.bio) || null;
  const site = website(given("website", current?.website));

  if (displayName && displayName.length > MAX.displayName) {
    return fail(`The name can be ${MAX.displayName} characters at most.`, 422, "displayName");
  }
  if (bio && bio.length > MAX.bio) return fail(`The bio can be ${MAX.bio} characters at most.`, 422, "bio");
  if (site === undefined || (site && site.length > MAX.website)) return fail("The website must be an https:// link.", 422, "website");

  await env.DB!.prepare(
    "INSERT INTO account_profiles (account_id, display_name, bio, website) VALUES (?1, ?2, ?3, ?4) " +
      "ON CONFLICT (account_id) DO UPDATE SET display_name = ?2, bio = ?3, website = ?4"
  )
    .bind(session.accountId, displayName, bio, site)
    .run();
  return json({ ok: true, profile: { displayName, bio, website: site } });
};
