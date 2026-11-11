import catalog from "../../../catalog/skills.json";
import { imagesIn } from "../../../src/post-body";
import type { AiBinding, Rejection } from "./_screen";
import { publicAuthor } from "../_profiles";

export interface Env {
  DB?: D1Database;
  AI?: AiBinding;
  SKILL_SALT?: string;
  POSTS_ADMIN_TOKEN?: string;
  /** Comma-separated origins allowed to call the admin API, such as the editor's dev server. */
  POSTS_ADMIN_ORIGINS?: string;
}

export interface PostRow {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  skill: string | null;
  author: string;
  status: "pending" | "published" | "rejected";
  reject_reason: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  account_id?: string | null;
}

export interface PostText {
  title: string;
  summary: string;
  body: string;
  skill: string | null;
}

export const DAILY_SUBMISSIONS = 3;
export const MAX_IMAGES = 4;
const LIMITS = { title: 120, summary: 280, body: 20_000 };

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function rejected(reasons: Rejection[]): Response {
  return json({ ok: false, reasons }, 422);
}

export function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "post";
}

export function checkText(post: PostText, imageCount: number): Rejection[] {
  const reasons: Rejection[] = [];
  for (const field of ["title", "summary", "body"] as const) {
    if (!post[field].trim()) reasons.push({ field, reason: `The ${field} is required.` });
    else if (post[field].length > LIMITS[field]) {
      reasons.push({ field, reason: `The ${field} can be ${LIMITS[field]} characters at most.` });
    }
  }
  if (post.skill && !catalog.entries.some((entry) => entry.id === post.skill)) {
    reasons.push({ field: "skill", reason: "That skill isn't in the catalog." });
  }
  for (const position of imagesIn(post.body)) {
    if (position < 1 || position > imageCount) {
      reasons.push({ field: "body", reason: `The body refers to image ${position}, which wasn't attached.` });
    }
  }
  return reasons;
}

/** The public shape of a post: no moderation fields, images as URLs, and the author's profile if public. */
export async function publicPost(db: D1Database, row: PostRow) {
  const { results } = await db
    .prepare("SELECT position FROM post_images WHERE post_id = ? ORDER BY position")
    .bind(row.id)
    .all<{ position: number }>();
  return {
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    body: row.body,
    skill: row.skill,
    author: row.author,
    author_profile: await publicAuthor(db, row.account_id ?? null),
    published_at: row.published_at,
    images: Object.fromEntries(results.map(({ position }) => [position, `/api/posts/images/${row.id}/${position}`]))
  };
}

/** Counts rejected attempts too, so the screen can't be probed without limit. */
export async function overLimit(db: D1Database, visitor: string, day: string): Promise<boolean> {
  const row = await db
    .prepare(
      "INSERT INTO post_limits (visitor, day, n) VALUES (?, ?, 1) " +
        "ON CONFLICT (visitor, day) DO UPDATE SET n = n + 1 RETURNING n"
    )
    .bind(visitor, day)
    .first<{ n: number }>();
  return (row?.n ?? 0) > DAILY_SUBMISSIONS;
}
