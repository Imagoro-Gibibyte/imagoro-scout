import { json } from "../posts/_store";
import { handleProblem } from "../_profiles";
import { blocked, screenText } from "../_textscreen";
import { fail, overLimit, readJson, readSession, type AuthEnv } from "./_lib";

const MAX = { displayName: 60, bio: 500, website: 200 };
/** Each save can call the text model, so saves are limited per account. */
const SAVES = { max: 30, windowMs: 3600_000 };

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

/**
 * PATCH /api/auth/profile { displayName?, bio?, website?, handle?, public? }: fields left out keep
 * their value. Name, handle and bio go through the text screen; a public profile needs a handle.
 */
export const onRequestPatch: PagesFunction<AuthEnv> = async ({ env, request }) => {
  const db = env.DB!;
  const session = await readSession(env, request);
  if (!session) return fail("Sign in first.", 401);
  const body = await readJson(request);
  const current = await db.prepare("SELECT display_name, bio, website, handle, public FROM account_profiles WHERE account_id = ?")
    .bind(session.accountId)
    .first<{ display_name: string | null; bio: string | null; website: string | null; handle: string | null; public: number }>();

  const given = (key: string, fallback: string | null | undefined) =>
    body[key] === undefined ? (fallback ?? "") : String(body[key] ?? "").trim();
  const displayName = given("displayName", current?.display_name) || null;
  const bio = given("bio", current?.bio) || null;
  const site = website(given("website", current?.website));
  const handle = given("handle", current?.handle).toLowerCase() || null;
  const isPublic = body.public === undefined ? !!current?.public : body.public === true;

  if (displayName && displayName.length > MAX.displayName) {
    return fail(`The name can be ${MAX.displayName} characters at most.`, 422, "displayName");
  }
  if (bio && bio.length > MAX.bio) return fail(`The bio can be ${MAX.bio} characters at most.`, 422, "bio");
  if (site === undefined || (site && site.length > MAX.website)) return fail("The website must be an https:// link.", 422, "website");
  if (handle && handle !== current?.handle) {
    const problem = handleProblem(handle, session.role);
    if (problem) return fail(problem, 422, "handle");
  }
  if (isPublic && !handle) return fail("A public profile needs a handle.", 422, "handle");
  if (site && blocked(site)) return fail("That website isn't allowed here.", 422, "website");

  // Only changed text is screened, so saving an unrelated field doesn't call the model again.
  const changed = (value: string | null, before: string | null | undefined) => (value !== (before ?? null) ? value : null);
  const text = {
    displayName: { label: "name", value: changed(displayName, current?.display_name) },
    handle: { label: "handle", value: changed(handle, current?.handle) },
    bio: { label: "bio", value: changed(bio, current?.bio) }
  };
  if (Object.values(text).some((f) => f.value)) {
    if (await overLimit(db, `profile-save:${session.accountId}`, SAVES)) return fail("Too many changes. Try again later.", 429);
    const reasons = await screenText(env.AI, text);
    if (reasons.length > 0) return json({ ok: false, reasons }, 422);
  }

  try {
    await db.prepare(
      "INSERT INTO account_profiles (account_id, display_name, bio, website, handle, public) VALUES (?1, ?2, ?3, ?4, ?5, ?6) " +
        "ON CONFLICT (account_id) DO UPDATE SET display_name = ?2, bio = ?3, website = ?4, handle = ?5, public = ?6"
    )
      .bind(session.accountId, displayName, bio, site, handle, isPublic ? 1 : 0)
      .run();
  } catch {
    // The unique index on handles is the only constraint this can hit.
    return fail("That handle is taken.", 409, "handle");
  }
  return json({ ok: true, profile: { displayName, bio, website: site, handle, public: isPublic } });
};
