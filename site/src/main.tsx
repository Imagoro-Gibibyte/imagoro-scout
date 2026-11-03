import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@xterm/xterm/css/xterm.css";
import "./styles/tokens.css";
import "./styles/fonts.css";
import "./styles/site.css";
import "./styles/term.css";
import "./styles/format.css";
import { Shell } from "./shell";

const el = document.getElementById("root");
if (!el) throw new Error("#root not found");

createRoot(el).render(
  <StrictMode>
    <Shell />
  </StrictMode>
);

// The visual editor's selection layer. Only `npm run dev:editor` sets this mode, so a
// production build drops the import entirely.
if (import.meta.env.MODE === "editor") void import("./editor/inspector");
