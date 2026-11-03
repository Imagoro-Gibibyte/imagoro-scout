import { useState, type CSSProperties } from "react";
import devlog from "../catalog/devlog.json";

const colors = new Map(devlog.projects.map((project) => [project.id, project.color]));
const names = new Map(devlog.projects.map((project) => [project.id, project.name]));

function tint(project: string): CSSProperties {
  return { "--project": colors.get(project) } as CSSProperties;
}

export function DevlogPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const entries = devlog.entries.filter((entry) => !selected || entry.project === selected);

  return (
    <article className="pf-page">
      <header className="pf-page-head">
        <h1>Devlog</h1>
        <p className="pf-sub">What changed across the projects, newest first.</p>
      </header>

      <div className="pf-skill-chips" role="group" aria-label="Filter by project">
        {devlog.projects.map((project) => (
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

      <ol className="pf-devlog">
        {entries.map((entry) => (
          <li className="pf-devlog-entry" key={`${entry.date}-${entry.title}`} style={tint(entry.project)}>
            <p className="pf-devlog-meta">
              <span className="pf-devlog-project">{names.get(entry.project)}</span>
              <time dateTime={entry.date}>{entry.date}</time>
            </p>
            <h2>{entry.title}</h2>
            <p>{entry.body}</p>
          </li>
        ))}
      </ol>
    </article>
  );
}
