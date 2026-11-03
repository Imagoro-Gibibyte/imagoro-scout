import { useEffect, useState, type CSSProperties } from "react";
import devlogSeed from "../catalog/devlog.json";

interface Entry {
  slug?: string;
  date: string;
  project: string;
  title: string;
  body: string;
  author?: string;
  published_at?: string | null;
}

const colors = new Map(devlogSeed.projects.map((project) => [project.id, project.color]));
const names = new Map(devlogSeed.projects.map((project) => [project.id, project.name]));

function tint(project: string): CSSProperties {
  return { "--project": colors.get(project) } as CSSProperties;
}

function seedEntries(): Entry[] {
  return devlogSeed.entries.map((e) => ({ date: e.date, project: e.project, title: e.title, body: e.body }));
}

export function DevlogPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>(seedEntries());
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/devlog")
      .then((res) => (res.ok ? (res.json() as Promise<Entry[]>) : []))
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data) && data.length > 0) {
          // Merge: API entries win over seed by slug/title+date.
          const seen = new Set(data.map((e) => `${e.date}-${e.title}`));
          const merged = [...data, ...seedEntries().filter((e) => !seen.has(`${e.date}-${e.title}`))];
          setEntries(merged);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = entries.filter((entry) => !selected || entry.project === selected);

  return (
    <article className="pf-page">
      <header className="pf-page-head">
        <h1>Devlog</h1>
        <p className="pf-sub">What changed across the projects, newest first.</p>
      </header>

      <div className="pf-skill-chips" role="group" aria-label="Filter by project">
        {devlogSeed.projects.map((project) => (
          <button
            key={project.id}
            type="button"
            className="pf-devlog-chip"
            style={tint(project.id)}
            aria-pressed={selected === project.id}
            onClick={() => setSelected(selected === project.id ? null : project.id)}
          >
            {project.name}
          </button>
        ))}
      </div>

      {loading ? <p className="pf-muted" role="status">Loading entries…</p> : null}

      <ol className="pf-devlog">
        {filtered.map((entry) => (
          <li className="pf-devlog-entry" key={`${entry.date}-${entry.title}`} style={tint(entry.project)}>
            <p className="pf-devlog-meta">
              <span className="pf-devlog-project">{names.get(entry.project) ?? entry.project}</span>
              <time dateTime={entry.date}>{entry.date}</time>
            </p>
            <h2>{entry.title}</h2>
            <p>{entry.body}</p>
          </li>
        ))}
      </ol>

      {!loading && filtered.length === 0 ? <p className="pf-muted">No entries yet.</p> : null}
    </article>
  );
}
