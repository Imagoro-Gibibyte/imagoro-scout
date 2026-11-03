/**
 * Loaded only by `npm run dev:editor`, inside the Command Center's preview frame. It lets the
 * editor select tiles and elements by clicking them, and reports which page is showing.
 * A production build never includes it: main.tsx imports it behind `MODE === "editor"`.
 */

type Inbound = { source: "site-editor-host"; type: "mode"; select: boolean } | { source: "site-editor-host"; type: "highlight"; target: string | null };

let selecting = false;
let selected: string | null = null;

function post(message: Record<string, unknown>) {
  // The payload is only a route and an element path, so any parent may read it.
  window.parent.postMessage({ source: "site-editor", ...message }, "*");
}

const style = document.createElement("style");
style.textContent = `
  .site-editor-hover { outline: 2px dashed #4f8cff !important; outline-offset: 2px; cursor: pointer; }
  .site-editor-selected { outline: 2px solid #e5a83b !important; outline-offset: 2px; }
`;
document.head.append(style);

function markerOf(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? (target.closest("[data-edit]") as HTMLElement | null) : null;
}

function mark(target: string | null) {
  document.querySelectorAll(".site-editor-selected").forEach((el) => el.classList.remove("site-editor-selected"));
  selected = target;
  if (target) document.querySelector(`[data-edit="${CSS.escape(target)}"]`)?.classList.add("site-editor-selected");
}

document.addEventListener("mouseover", (event) => {
  document.querySelectorAll(".site-editor-hover").forEach((el) => el.classList.remove("site-editor-hover"));
  if (selecting) markerOf(event.target)?.classList.add("site-editor-hover");
});

// Capture phase, so a selection click never also follows a link.
document.addEventListener(
  "click",
  (event) => {
    if (!selecting) return;
    const marker = markerOf(event.target);
    if (!marker) return;
    event.preventDefault();
    event.stopPropagation();
    const [section, element] = (marker.dataset.edit ?? "").split(":");
    mark(marker.dataset.edit ?? null);
    post({ type: "select", route: location.pathname, section: Number(section), element });
  },
  true
);

window.addEventListener("message", (event: MessageEvent<Inbound>) => {
  if (event.source !== window.parent || event.data?.source !== "site-editor-host") return;
  if (event.data.type === "mode") {
    selecting = event.data.select;
    if (!selecting) document.querySelectorAll(".site-editor-hover").forEach((el) => el.classList.remove("site-editor-hover"));
  }
  if (event.data.type === "highlight") mark(event.data.target);
});

// The router uses pushState, so watch the path rather than hooking navigation.
let route = "";
setInterval(() => {
  if (location.pathname === route) return;
  route = location.pathname;
  post({ type: "route", route });
  requestAnimationFrame(() => mark(selected));
}, 250);

post({ type: "ready", route: location.pathname });

export {};
