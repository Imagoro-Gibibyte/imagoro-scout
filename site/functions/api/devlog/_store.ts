import type { AiBinding, Rejection } from "../posts/_screen";

export interface Env {
  DB?: D1Database;
  AI?: AiBinding;
  SKILL_SALT?: string;
  POSTS_ADMIN_TOKEN?: string;
  DEVLOG_ADMIN_TOKEN?: string;
  /** Comma-separated origins allowed to call the admin API, such as the editor's dev server. */
  POSTS_ADMIN_ORIGINS?: string;
}

export interface DevlogRow {
  id: string;
  slug: string;
  date: string;
  project: string;
  title: string;
  body: string;
  author: string;
  status: "pending" | "published" | "rejected";
  reject_reason: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  post_slug: string | null;
}

export const DAILY_SUBMISSIONS = 3;

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function rejected(reasons: Rejection[]): Response {
  return json({ ok: false, reasons }, 422);
}

export function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "post";
}

const PROJECTS = new Set(["imagoro", "security", "nav", "lab", "voxel"]);

export function checkText(post: { title: string; body: string; project: string }): Rejection[] {
  const reasons: Rejection[] = [];
  if (!post.title.trim()) reasons.push({ field: "title", reason: "The title is required." });
  else if (post.title.length > 120) reasons.push({ field: "title", reason: "The title can be 120 characters at most." });
  if (!post.body.trim()) reasons.push({ field: "body", reason: "The body is required." });
  else if (post.body.length > 20_000) reasons.push({ field: "body", reason: "The body can be 20000 characters at most." });
  if (!PROJECTS.has(post.project)) reasons.push({ field: "project", reason: "That project isn't in the devlog." });
  return reasons;
}

/** The public shape of an entry. */
export function publicEntry(row: DevlogRow) {
  return {
    slug: row.slug,
    date: row.date,
    project: row.project,
    title: row.title,
    body: row.body,
    author: row.author,
    published_at: row.published_at,
    post: row.post_slug
  };
}

/** Counts rejected attempts too, so the screen can't be probed without limit. */
export async function overLimit(db: D1Database, visitor: string, day: string): Promise<boolean> {
  const row = await db
    .prepare(
      "INSERT INTO devlog_limits (visitor, day, n) VALUES (?, ?, 1) " +
        "ON CONFLICT (visitor, day) DO UPDATE SET n = n + 1 RETURNING n"
    )
    .bind(visitor, day)
    .first<{ n: number }>();
  return (row?.n ?? 0) > DAILY_SUBMISSIONS;
}

export { Rejection };
