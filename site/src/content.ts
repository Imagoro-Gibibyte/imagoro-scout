/**
 * The site copy, in one place.
 *
 * The editable content now lives in `site.manifest.json` (a plain JSON file a
 * designer can change without touching code). This module loads it, resolves the
 * `{REPO}` token in link hrefs against the build inputs, and
 * re-exports the typed shapes the rest of the site consumes.
 *
 * The repository's own URL is a build input (`VITE_REPO_URL`) rather than a
 * literal: the public tree never names the account it lives under, and a build
 * without the variable simply renders fewer outbound links.
 */

import type { SectionStyle } from "./format";
import manifest from "./site.manifest.json";

const REPO = (import.meta.env.VITE_REPO_URL ?? "").replace(/\/+$/, "");

export const repoUrl: string = REPO;

export interface NavItem {
  label: string;
  route: string;
}

export type Section = { style?: SectionStyle } & (
  | { kind: "hero"; headline: string; sub: string }
  | { kind: "features"; headline?: string; features: readonly { title: string; body: string }[] }
  | { kind: "text"; headline?: string; sub?: string; points?: readonly string[] }
  | { kind: "flow"; headline: string; sub: string; nodes: readonly { name: string; body: string }[] }
  | { kind: "cta"; headline: string; sub: string; links: readonly { label: string; href: string }[] }
);

export interface Page {
  route: string;
  title: string;
  description: string;
  sections: readonly Section[];
}

function resolveTokens(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(/\{REPO\}/g, REPO);
  }
  if (Array.isArray(value)) {
    return value.map(resolveTokens);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = resolveTokens(v);
    }
    return out;
  }
  return value;
}

const resolved = resolveTokens(manifest) as {
  site: { title: string; tagline: string };
  nav: NavItem[];
  footer?: { links: { label: string; href: string }[] };
  pages: Page[];
};

export const site = resolved.site;
export const nav = resolved.nav as readonly NavItem[];
/** Footer links. A link whose `{REPO}` didn't resolve is left out. */
export const footerLinks = (resolved.footer?.links ?? []).filter((link) => link.href);
export const pages = resolved.pages as readonly Page[];

export function findPage(route: string): Page | undefined {
  return pages.find((page) => page.route === route);
}