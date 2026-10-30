import { findPage, type Page, type Section } from "./content";
import { Link } from "./router";

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

function SectionView({ section }: { section: Section }) {
  switch (section.kind) {
    case "hero":
      return (
        <section className="pf-section pf-hero">
          <h1>{section.headline}</h1>
          <p className="pf-sub">{section.sub}</p>
        </section>
      );

    case "features":
      return (
        <section className="pf-section">
          {section.headline ? <h2>{section.headline}</h2> : null}
          <ul className="pf-cards">
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
        <section className="pf-section">
          {section.headline ? <h2>{section.headline}</h2> : null}
          {section.sub ? <p className="pf-sub">{section.sub}</p> : null}
          {section.points ? (
            <ul className="pf-points">
              {section.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          ) : null}
        </section>
      );

    case "flow":
      return (
        <section className="pf-section">
          <h2>{section.headline}</h2>
          <p className="pf-sub">{section.sub}</p>
          <ol className="pf-flow">
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
        <section className="pf-section">
          <h2>{section.headline}</h2>
          <p className="pf-sub">{section.sub}</p>
          <div className="pf-cta-links">
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
        <SectionView key={index} section={section} />
      ))}
    </article>
  );
}

export function NotFound({ route }: { route: string }) {
  return (
    <article className="pf-page">
      <header className="pf-page-head">
        <h1>Not found</h1>
        <p className="pf-sub">No page matches {route}.</p>
      </header>
      <p className="pf-muted">
        Published pages:{" "}
        <Link to="/">/</Link>, <Link to="/services">/services</Link>, <Link to="/insights">/insights</Link>,{" "}
        <Link to="/about">/about</Link>, <Link to="/term">/term</Link>, <Link to="/contact">/contact</Link>
      </p>
    </article>
  );
}

export function pageFor(route: string): Page | undefined {
  return findPage(route);
}
