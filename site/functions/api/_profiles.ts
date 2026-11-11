import { IMAGE_HEADERS } from "./posts/images/[id]/[position]";
import { checkImageFile, classifyImage, type AiBinding, type Rejection } from "./posts/_screen";
import type { Role } from "./auth/_lib";

/** Lowercase letters, digits and underscores; 3 to 24 of them. */
export const HANDLE = /^[a-z0-9_]{3,24}$/;
/** Names that would read as the site speaking. Moderators and admins may hold them. */
const RESERVED = new Set([
  "admin", "administrator", "mod", "moderator", "moderators", "staff", "support", "help", "official", "root", "system",
  "imagoro", "security", "privacy", "abuse", "postmaster", "webmaster", "noreply", "api", "u", "login", "register", "profile"
]);
export const AVATAR_MAX_BYTES = 300_000;

export function handleProblem(handle: string, role: Role): string | null {
  if (!HANDLE.test(handle)) return "A handle is 3 to 24 lowercase letters, digits or underscores.";
  if (RESERVED.has(handle) && role === "member") return "That handle is reserved.";
  return null;
}

/** The same screen as post images: file type, embedded content, then the classifier. Fails closed. */
export async function screenAvatar(ai: AiBinding | undefined, file: File): Promise<{ mime: string; bytes: Uint8Array } | Rejection> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length > AVATAR_MAX_BYTES) return { field: "avatar", reason: "A profile picture can be 300 KB at most." };
  const checked = checkImageFile(bytes, file.type);
  if ("reason" in checked) return { field: "avatar", reason: checked.reason };
  const flagged = await classifyImage(ai, bytes);
  if (flagged) return { field: "avatar", reason: flagged };
  return { mime: checked.mime, bytes };
}

export async function avatarResponse(db: D1Database, accountId: string, cache: "public" | "private"): Promise<Response> {
  const row = await db.prepare("SELECT mime, bytes FROM account_avatars WHERE account_id = ?").bind(accountId)
    .first<{ mime: string; bytes: number[] }>();
  if (!row) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(row.bytes), {
    headers: { "Content-Type": row.mime, "Cache-Control": `${cache}, max-age=300`, ...IMAGE_HEADERS }
  });
}

/** The stamp changes with the picture, so a cached copy never outlives it. */
export function avatarUrl(path: string, updatedAt: string | null): string | null {
  return updatedAt ? `${path}?v=${encodeURIComponent(updatedAt)}` : null;
}

export interface PublicAuthor {
  handle: string;
  displayName: string | null;
  role: Role;
  avatar: string | null;
}

/** The author shown on a post: only for a public, unsuspended profile with a handle. */
export async function publicAuthor(db: D1Database, accountId: string | null): Promise<PublicAuthor | null> {
  if (!accountId) return null;
  const row = await db.prepare(
    "SELECT p.handle, p.display_name, a.role, (SELECT v.updated_at FROM account_avatars v WHERE v.account_id = a.id) AS avatar_at " +
      "FROM accounts a JOIN account_profiles p ON p.account_id = a.id " +
      "WHERE a.id = ? AND p.public = 1 AND p.handle IS NOT NULL AND a.suspended_at IS NULL"
  )
    .bind(accountId)
    .first<{ handle: string; display_name: string | null; role: Role; avatar_at: string | null }>();
  if (!row) return null;
  return {
    handle: row.handle,
    displayName: row.display_name,
    role: row.role,
    avatar: avatarUrl(`/api/people/${row.handle}/avatar`, row.avatar_at)
  };
}
