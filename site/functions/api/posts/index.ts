import { linksIn } from "../../../src/post-body";
import { readSession, validEmail, type AuthEnv } from "../auth/_lib";
import { visitor } from "../skills/_events";
import { editEmailHash } from "./_edit";
import { checkImageFile, classifyImage, screenLinks, type Rejection } from "./_screen";
import { MAX_IMAGES, checkText, json, overLimit, publicPost, rejected, slugify, type Env, type PostRow } from "./_store";

/** GET /api/posts: published posts, newest first. ?skill=<id> narrows to one catalog entry. */
export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  if (!env.DB) return json([]);
  const skill = new URL(request.url).searchParams.get("skill");
  const { results } = await env.DB.prepare(
    "SELECT * FROM posts WHERE status = 'published' AND (?1 IS NULL OR skill = ?1) ORDER BY published_at DESC LIMIT 100"
  )
    .bind(skill)
    .all<PostRow>();
  return json(await Promise.all(results.map((row) => publicPost(env.DB!, row))));
};

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * POST /api/posts: a multipart submission. Anything that fails screening is answered with its
 * reasons and isn't stored. Anything that passes waits as `pending` until an operator approves it.
 * A signed-in author owns the post. An anonymous one can leave an email to get edit tokens at.
 */
export const onRequestPost: PagesFunction<AuthEnv> = async ({ env, request }) => {
  if (request.headers.get("Origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  if (!env.DB || !env.SKILL_SALT) {
    return json({ ok: false, reasons: [{ field: "form", reason: "Posting isn't open yet." }] }, 503);
  }

  const day = new Date().toISOString().slice(0, 10);
  if (await overLimit(env.DB, await visitor(request, day, env.SKILL_SALT), day)) {
    return json({ ok: false, reasons: [{ field: "form", reason: "That's the limit for today. Try again tomorrow." }] }, 429);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return rejected([{ field: "form", reason: "The form couldn't be read." }]);
  }
  // Hidden from people by the page, so only a form-filling bot sets it. It gets a normal reply.
  if (field(form, "website")) return json({ ok: true, status: "pending" }, 202);

  const post = {
    title: field(form, "title").trim(),
    summary: field(form, "summary").trim(),
    body: field(form, "body").trim(),
    skill: field(form, "skill") || null
  };
  const session = await readSession(env, request);
  const profile = session
    ? await env.DB.prepare("SELECT display_name FROM account_profiles WHERE account_id = ?").bind(session.accountId)
        .first<{ display_name: string | null }>()
    : null;
  const author = field(form, "author").trim().slice(0, 60) || profile?.display_name || "Anonymous";
  const email = field(form, "email").trim();
  const files = form.getAll("images").filter((value): value is File => typeof value !== "string");

  const reasons: Rejection[] = checkText(post, files.length);
  if (!session && email && !validEmail(email.toLowerCase())) reasons.push({ field: "email", reason: "That email isn't valid." });
  if (files.length > MAX_IMAGES) reasons.push({ field: "images", reason: `A post can have ${MAX_IMAGES} images at most.` });
  if (reasons.length > 0) return rejected(reasons);

  const images: { mime: string; bytes: Uint8Array }[] = [];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const checked = checkImageFile(bytes, file.type);
    if ("reason" in checked) {
      reasons.push({ field: file.name, reason: checked.reason });
      continue;
    }
    const flagged = await classifyImage(env.AI, bytes);
    if (flagged) reasons.push({ field: file.name, reason: flagged });
    else images.push({ mime: checked.mime, bytes });
  }
  reasons.push(...(await screenLinks(linksIn(post.body))));
  if (reasons.length > 0) return rejected(reasons);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO posts (id, slug, title, summary, body, skill, author, account_id, edit_email_hash, created_at, updated_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      id, `${slugify(post.title)}-${id.slice(0, 8)}`, post.title, post.summary, post.body, post.skill, author,
      session?.accountId ?? null, !session && email ? await editEmailHash(env, email) : null, now, now
    ),
    ...images.map(({ mime, bytes }, i) =>
      env.DB!.prepare("INSERT INTO post_images (post_id, position, mime, bytes) VALUES (?, ?, ?, ?)").bind(id, i + 1, mime, bytes)
    )
  ]);
  return json({ ok: true, status: "pending" }, 202);
};
