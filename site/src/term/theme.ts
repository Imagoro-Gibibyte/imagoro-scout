import type { ITheme } from "@xterm/xterm";

/** The terminal palette, kept in code so the bundle needs no runtime fetch. */
export const termTheme: ITheme = {
  cursor: "#4F8CFF",
  cursorAccent: "#0B1020",
  background: "#0B1020",
  foreground: "#E8EEFF",
  selectionBackground: "rgba(79,140,255,0.35)",
  black: "#0B1020",
  red: "#F87171",
  green: "#86EFAC",
  yellow: "#FCD34D",
  blue: "#4F8CFF",
  magenta: "#C4B5FD",
  cyan: "#67E8F9",
  white: "#E8EEFF",
  brightBlack: "#64748B",
  brightRed: "#FCA5A5",
  brightGreen: "#BBF7D0",
  brightYellow: "#FDE68A",
  brightBlue: "#93C5FD",
  brightMagenta: "#DDD6FE",
  brightCyan: "#A5F3FC",
  brightWhite: "#F8FAFC"
};

export const termOptions = {
  fontFamily: "'Cascadia Code', Consolas, 'Courier New', ui-monospace, monospace",
  fontSize: 13,
  lineHeight: 1.2,
  cursorBlink: true,
  allowProposedApi: true,
  scrollback: 5000,
  theme: termTheme
} as const;
