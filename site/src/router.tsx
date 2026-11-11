import { useSyncExternalStore, type ReactNode } from "react";

/**
 * A history router small enough to read: one module-level path, a listener set,
 * and one delegated click handler. Deep links work because the host rewrites
 * every unmatched path to `index.html` (`public/_redirects`), so the first load
 * arrives here with the real path already in `window.location`.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

function readPath(): string {
  return normalizeRoute(window.location.pathname);
}

let path = readPath();

export function normalizeRoute(raw: string): string {
  const trimmed = raw.split("?")[0]!.split("#")[0]!;
  const stripped = trimmed.replace(/\/+$/, "").replace(/\/index\.html$/, "");
  return stripped === "" ? "/" : stripped;
}

function emit(): void {
  const next = readPath();
  if (next === path) return;
  path = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function checkForUpdate(): Promise<void> {
  try {
    const res = await fetch("/version.json", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { buildId?: string };
    if (data.buildId && data.buildId !== __BUILD_ID__) {
      window.location.reload();
    }
  } catch {
    // Network or parse failure: ignore, keep the current build.
  }
}

export function navigate(to: string): void {
  const target = normalizeRoute(to);
  if (target === path) return;
  void checkForUpdate();
  window.history.pushState(null, "", to);
  emit();
  window.scrollTo({ top: 0 });
}

export function useRoute(): string {
  return useSyncExternalStore(
    subscribe,
    () => path,
    () => "/"
  );
}

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    void checkForUpdate();
    emit();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void checkForUpdate();
  });

  // One delegated handler for every same-origin anchor, so a link rendered as
  // plain HTML still navigates without a full reload.
  window.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const anchor = (event.target as Element | null)?.closest?.("a");
    if (!anchor) return;
    if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;

    const href = anchor.getAttribute("href");
    if (!href || !href.startsWith("/") || href.startsWith("//")) return;

    event.preventDefault();
    navigate(href);
  });
}

export function Link({
  to,
  className,
  children,
  ...rest
}: {
  to: string;
  className?: string;
  children: ReactNode;
  "aria-current"?: "page";
}) {
  return (
    <a className={className} href={to} {...rest}>
      {children}
    </a>
  );
}
