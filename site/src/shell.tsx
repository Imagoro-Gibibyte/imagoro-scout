import { lazy, Suspense, useEffect } from "react";
import { nav, repoUrl, site } from "./content";
import { DevlogPage } from "./devlog";
import { AsciiBrand, AsciiHero, SeaBackdrop } from "./effects";
import { NotFound, PageView, pageFor } from "./pages";
import { POSTS_ROUTE, PostPage, SUBMIT_ROUTE, SubmitPage } from "./posts";
import { Link, useRoute } from "./router";
import { SkillsPage } from "./skills";

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
  const isSkills = route === "/skills";
  const isDevlog = route === "/devlog";
  const isSubmit = route === SUBMIT_ROUTE;
  const postSlug = !isSubmit && route.startsWith(`${POSTS_ROUTE}/`) ? route.slice(POSTS_ROUTE.length + 1) : null;

  const title = isTerminal
    ? `Terminal · ${site.title}`
    : isSkills || isSubmit || postSlug
      ? `Skills & Tools · ${site.title}`
    : isDevlog
      ? `Devlog · ${site.title}`
    : page
      ? page.route === "/"
        ? site.title
        : `${page.title} · ${site.title}`
      : `Not found · ${site.title}`;

  const heroText = isSkills || isSubmit ? "Skills" : isDevlog ? "Devlog" : page && page.route !== "/" ? page.title : null;

  useEffect(() => {
    document.title = title;
  }, [title]);

  return (
    <div className={isTerminal ? "pf-shell pf-shell-term" : "pf-shell"}>
      <SeaBackdrop route={route} />
      <header className="pf-header">
        <Link className="pf-brand" to="/">
          <AsciiBrand
            text={site.title}
            fallback={
              <>
                <span aria-hidden="true" className="pf-brand-mark">
                  ◇
                </span>
                <span className="pf-brand-name">{site.title}</span>
              </>
            }
          />
        </Link>
        <Nav route={route} />
      </header>

      <main className={isTerminal ? "pf-main pf-main-term" : "pf-main"}>
        {heroText ? <AsciiHero text={heroText} /> : null}
        {isTerminal ? (
          <Suspense fallback={<p className="pf-muted">Loading terminal…</p>}>
            <TerminalPage />
          </Suspense>
        ) : isSkills ? (
          <SkillsPage />
        ) : isSubmit ? (
          <SubmitPage />
        ) : postSlug ? (
          <PostPage slug={postSlug} />
        ) : isDevlog ? (
          <DevlogPage />
        ) : page ? (
          <PageView page={page} />
        ) : (
          <NotFound route={route} />
        )}
      </main>

      <footer className="pf-footer">
        <span className="pf-muted">{site.tagline}</span>
        <div className="pf-footer-links">
          <Link className="pf-nav-link" to="/devlog" aria-current={isDevlog ? "page" : undefined}>
            Devlog
          </Link>
          {repoUrl ? (
            <a className="pf-nav-link" href={repoUrl} rel="noreferrer noopener" target="_blank">
              Source
            </a>
          ) : null}
        </div>
      </footer>
    </div>
  );
}
