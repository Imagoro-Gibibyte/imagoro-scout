import { useEffect, useMemo, useState } from "react";
import catalog from "../catalog/skills.json";
import { PostList, SUBMIT_ROUTE } from "./posts";
import { Link } from "./router";

interface Entry {
  id: string;
  name: string;
  kind: string;
  summary: string;
  labels: string[];
  version: string;
  published: string;
  license: string;
  contents: string[];
}
type Stats = Record<string, { downloads: number; shares: number }>;

const AGES = [
  { label: "Any age", days: 0 },
  { label: "Past week", days: 7 },
  { label: "Past month", days: 30 },
  { label: "Past year", days: 365 }
] as const;

const SORTS = {
  downloads: "Most downloaded",
  shares: "Most shared",
  newest: "Newest",
  oldest: "Oldest"
} as const;
type Sort = keyof typeof SORTS;

const entries: readonly Entry[] = catalog.entries;
const DAY_MS = 86_400_000;

function SkillCard({ entry, stats, onShare }: { entry: Entry; stats: Stats; onShare: (entry: Entry) => void }) {
  const counts = stats[entry.id];
  return (
    <li className="pf-card pf-skill" id={entry.id}>
      <span className="pf-skill-kind">{entry.kind}</span>
      <h3>{entry.name}</h3>
      <p>{entry.summary}</p>
      <ul className="pf-skill-labels">
        {entry.labels.map((label) => (
          <li key={label}>{label}</li>
        ))}
      </ul>
      <p className="pf-muted pf-skill-meta">
        v{entry.version} · {entry.published} · {entry.license}
      </p>
      <p className="pf-muted pf-skill-meta">
        {counts?.downloads ?? 0} downloads · {counts?.shares ?? 0} shares
      </p>
      <div className="pf-cta-links">
        <a className="pf-btn" href={`/api/skills/${entry.id}/download`} download>
          Download
        </a>
        <button className="pf-btn" type="button" onClick={() => onShare(entry)}>
          Share
        </button>
      </div>
    </li>
  );
}

export function SkillsPage() {
  const [query, setQuery] = useState("");
  const [labels, setLabels] = useState<readonly string[]>([]);
  const [ageDays, setAgeDays] = useState(0);
  const [sort, setSort] = useState<Sort>("downloads");
  const [stats, setStats] = useState<Stats>({});
  const [notice, setNotice] = useState("");

  useEffect(() => {
    fetch("/api/skills/stats")
      .then((res) => (res.ok ? (res.json() as Promise<Stats>) : {}))
      .then(setStats)
      .catch(() => undefined);
    // Cards render after the browser's own jump to a shared link's #id.
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
  }, []);

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const now = Date.now();
    const age = (entry: Entry) => now - Date.parse(entry.published);
    const count = (entry: Entry, key: "downloads" | "shares") => stats[entry.id]?.[key] ?? 0;
    return entries
      .filter((entry) => {
        const text = `${entry.name} ${entry.kind} ${entry.summary} ${entry.labels.join(" ")}`.toLowerCase();
        return (
          words.every((word) => text.includes(word)) &&
          (labels.length === 0 || labels.some((label) => entry.labels.includes(label))) &&
          (ageDays === 0 || age(entry) <= ageDays * DAY_MS)
        );
      })
      .sort((a, b) => {
        if (sort === "newest") return age(a) - age(b);
        if (sort === "oldest") return age(b) - age(a);
        return count(b, sort) - count(a, sort) || age(a) - age(b);
      });
  }, [query, labels, ageDays, sort, stats]);

  function toggleLabel(label: string) {
    setLabels((current) => (current.includes(label) ? current.filter((l) => l !== label) : [...current, label]));
  }

  async function share(entry: Entry) {
    const url = `${window.location.origin}/skills#${entry.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: entry.name, text: entry.summary, url });
      } else {
        await navigator.clipboard.writeText(url);
        setNotice(`Link to ${entry.name} copied.`);
      }
    } catch {
      return; // Cancelled, or the browser refused: nothing was shared.
    }
    void fetch(`/api/skills/${entry.id}/share`, { method: "POST" });
  }

  return (
    <article className="pf-page">
      <header className="pf-page-head">
        <h1>Skills &amp; Tools</h1>
        <p className="pf-sub">Skills and tools for agents, ready to download and use with your own setup.</p>
      </header>

      <div className="pf-skill-filters">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search skills and tools"
          aria-label="Search skills and tools"
        />
        <select value={ageDays} onChange={(event) => setAgeDays(Number(event.target.value))} aria-label="Filter by age">
          {AGES.map((age) => (
            <option key={age.days} value={age.days}>
              {age.label}
            </option>
          ))}
        </select>
        <select value={sort} onChange={(event) => setSort(event.target.value as Sort)} aria-label="Sort by">
          {Object.entries(SORTS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="pf-skill-chips" role="group" aria-label="Filter by label">
        {catalog.labels.map((label) => (
          <button
            key={label}
            type="button"
            className="pf-skill-chip"
            aria-pressed={labels.includes(label)}
            onClick={() => toggleLabel(label)}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="pf-muted" role="status">
        {notice || `${shown.length} of ${entries.length} ${entries.length === 1 ? "entry" : "entries"}`}
      </p>

      {shown.length > 0 ? (
        <ul className="pf-cards">
          {shown.map((entry) => (
            <SkillCard key={entry.id} entry={entry} stats={stats} onShare={(e) => void share(e)} />
          ))}
        </ul>
      ) : (
        <p className="pf-muted">Nothing matches those filters.</p>
      )}

      <section className="pf-skill-posts" aria-label="Posts">
        <h2>Posts</h2>
        <PostList />
        <p>
          <Link className="pf-btn" to={SUBMIT_ROUTE}>
            Submit a post
          </Link>
        </p>
      </section>
    </article>
  );
}
