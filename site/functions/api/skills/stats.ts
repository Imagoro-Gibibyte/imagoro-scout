import type { Env } from "./_events";

/** GET /api/skills/stats: { "<id>": { downloads, shares } } */
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const stats: Record<string, { downloads: number; shares: number }> = {};
  if (env.DB) {
    const { results } = await env.DB.prepare(
      "SELECT skill, kind, COUNT(*) AS n FROM skill_events GROUP BY skill, kind"
    ).all<{ skill: string; kind: string; n: number }>();
    for (const row of results) {
      const entry = (stats[row.skill] ??= { downloads: 0, shares: 0 });
      if (row.kind === "download") entry.downloads = row.n;
      if (row.kind === "share") entry.shares = row.n;
    }
  }
  return Response.json(stats, { headers: { "Cache-Control": "public, max-age=60" } });
};
