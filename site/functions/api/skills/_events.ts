import catalog from "../../../catalog/skills.json";

export interface Env {
  DB?: D1Database;
  SKILL_SALT?: string;
}

export function isEntry(id: unknown): id is string {
  return catalog.entries.some((entry) => entry.id === id);
}

/** A hash that changes daily: it dedupes repeat clicks without storing an IP address. */
export async function visitor(request: Request, day: string, salt: string): Promise<string> {
  const ip = request.headers.get("CF-Connecting-IP") ?? "";
  const data = new TextEncoder().encode(`${ip}|${day}|${salt}`);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return btoa(String.fromCharCode(...hash.slice(0, 16)));
}

/** Counting never blocks a download, so a failure here is ignored. */
export async function record(env: Env, request: Request, skill: string, kind: "download" | "share"): Promise<void> {
  if (!env.DB || !env.SKILL_SALT) return;
  try {
    const day = new Date().toISOString().slice(0, 10);
    await env.DB.prepare("INSERT OR IGNORE INTO skill_events (skill, kind, visitor, day) VALUES (?, ?, ?, ?)")
      .bind(skill, kind, await visitor(request, day, env.SKILL_SALT), day)
      .run();
  } catch {
    // The count is a nicety; the download is the point.
  }
}
