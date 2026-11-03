import { lazy, Suspense } from "react";
import { findPage, type Page, type Section } from "./content";
import { formatAttrs } from "./format";
import { reducedMotion } from "./effects";
import { Link } from "./router";

const NotFoundGame = lazy(() => import("./game/NotFoundGame").then((module) => ({ default: module.NotFoundGame })));

function CtaLink({ label, href }: { label: string; href: string }) {
  const internal = href.startsWith("/");
  return (
    <a
      className="pf-btn"
      href={href}
      {...(internal ? {} : { target: "_blank", rel: "noreferrer noopener" })}
    >
      {label}
    </a>
  );
}

function SectionView({ section, index }: { section: Section; index: number }) {
  const f = (element: string) => formatAttrs(section.style, index, element);
  switch (section.kind) {
    case "hero":
      return (
        <section className="pf-section pf-hero" {...f("tile")}>
          <h1 {...f("headline")}>{section.headline}</h1>
          <p className="pf-sub" {...f("sub")}>
            {section.sub}
          </p>
        </section>
      );

    case "features":
      return (
        <section className="pf-section" {...f("tile")}>
          {section.headline ? <h2 {...f("headline")}>{section.headline}</h2> : null}
          <ul className="pf-cards" {...f("cards")}>
            {section.features.map((feature) => (
              <li className="pf-card" key={feature.title}>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </li>
            ))}
          </ul>
        </section>
      );

    case "text":
      return (
        <section className="pf-section" {...f("tile")}>
          {section.headline ? <h2 {...f("headline")}>{section.headline}</h2> : null}
          {section.sub ? (
            <p className="pf-sub" {...f("sub")}>
              {section.sub}
            </p>
          ) : null}
          {section.points ? (
            <ul className="pf-points" {...f("points")}>
              {section.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          ) : null}
        </section>
      );

    case "flow":
      return (
        <section className="pf-section" {...f("tile")}>
          <h2 {...f("headline")}>{section.headline}</h2>
          <p className="pf-sub" {...f("sub")}>
            {section.sub}
          </p>
          <ol className="pf-flow" {...f("steps")}>
            {section.nodes.map((node) => (
              <li className="pf-flow-node" key={node.name}>
                <span className="pf-flow-name">{node.name}</span>
                <span className="pf-flow-body">{node.body}</span>
              </li>
            ))}
          </ol>
        </section>
      );

    case "cta":
      return (
        <section className="pf-section" {...f("tile")}>
          <h2 {...f("headline")}>{section.headline}</h2>
          <p className="pf-sub" {...f("sub")}>
            {section.sub}
          </p>
          <div className="pf-cta-links" {...f("buttons")}>
            {section.links.map((link) => (
              <CtaLink key={link.href} label={link.label} href={link.href} />
            ))}
          </div>
        </section>
      );
  }
}

export function PageView({ page }: { page: Page }) {
  return (
    <article className="pf-page">
      {page.route === "/" ? null : (
        <header className="pf-page-head">
          <h1>{page.title}</h1>
          <p className="pf-sub">{page.description}</p>
        </header>
      )}
      {page.sections.map((section, index) => (
        <SectionView key={index} section={section} index={index} />
      ))}
    </article>
  );
}

function NotFoundText({ route }: { route: string }) {
  return (
    <>
      <header className="pf-page-head">
        <h1>Not found</h1>
        <p className="pf-sub">No page matches {route}.</p>
      </header>
      <div className="pf-cta-links" aria-label="Published pages">
        <Link to="/" className="pf-btn">
          home
        </Link>
        <Link to="/services" className="pf-btn">
          /services
        </Link>
        <Link to="/insights" className="pf-btn">
          /insights
        </Link>
        <Link to="/about" className="pf-btn">
          /about
        </Link>
        <Link to="/skills" className="pf-btn">
          /skills
        </Link>
        <Link to="/devlog" className="pf-btn">
          /devlog
        </Link>
        <Link to="/term" className="pf-btn">
          /term
        </Link>
        <Link to="/contact" className="pf-btn">
          /contact
        </Link>
      </div>
    </>
  );
}

export function NotFound({ route }: { route: string }) {
  const text = <NotFoundText route={route} />;
  return (
    <article className="pf-page">
      {reducedMotion ? (
        text
      ) : (
        <Suspense fallback={text}>
          <NotFoundGame>{text}</NotFoundGame>
        </Suspense>
      )}
    </article>
  );
}

export function pageFor(route: string): Page | undefined {
  return findPage(route);
}
