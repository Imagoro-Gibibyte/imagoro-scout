import { lazy, Suspense, useEffect } from "react";
import { nav, repoUrl, site } from "./content";
import { NotFound, PageView, pageFor } from "./pages";
import { Link, useRoute } from "./router";

// xterm is ~500 kB, and most visits never open the terminal, so it loads on
// demand instead of shipping in the landing-page bundle.
const TerminalPage = lazy(() =>
  import("./term/App").then((module) => ({ default: module.TerminalPage }))
);

function Nav({ route }: { route: string }) {
  return (
    <nav className="pf-nav" aria-label="Main">
      {nav.map((item) => (
        <Link
          className="pf-nav-link"
          key={item.route}
          to={item.route}
          aria-current={item.route === route ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function Shell() {
  const route = useRoute();
  const page = pageFor(route);
  const isTerminal = route === "/term";

  const title = isTerminal
    ? `Terminal · ${site.title}`
    : page
      ? page.route === "/"
        ? site.title
        : `${page.title} · ${site.title}`
      : `Not found · ${site.title}`;

  useEffect(() => {
    document.title = title;
  }, [title]);

  return (
    <div className={isTerminal ? "pf-shell pf-shell-term" : "pf-shell"}>
      <header className="pf-header">
        <Link className="pf-brand" to="/">
          <span aria-hidden="true" className="pf-brand-mark">
            ◇
          </span>
          <span className="pf-brand-name">{site.title}</span>
        </Link>
        <Nav route={route} />
      </header>

      <main className={isTerminal ? "pf-main pf-main-term" : "pf-main"}>
        {isTerminal ? (
          <Suspense fallback={<p className="pf-muted">Loading terminal…</p>}>
            <TerminalPage />
          </Suspense>
        ) : page ? (
          <PageView page={page} />
        ) : (
          <NotFound route={route} />
        )}
      </main>

      <footer className="pf-footer">
        <span className="pf-muted">{site.tagline}</span>
        {repoUrl ? (
          <a className="pf-nav-link" href={repoUrl} rel="noreferrer noopener" target="_blank">
            Source
          </a>
        ) : null}
      </footer>
    </div>
  );
}
