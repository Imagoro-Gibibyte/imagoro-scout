/**
 * Per-element formatting for page sections. The manifest stores it as data, and the
 * renderer turns it into `data-size` / `data-shape` / `data-font` attributes that the
 * stylesheet reads, so a format is never markup or inline style.
 */

export const SIZES = ["s", "m", "l", "xl"] as const;
export const SHAPES = ["square", "rounded", "pill"] as const;
export const FONTS = ["site", "sans", "serif", "display", "mono"] as const;

export type Size = (typeof SIZES)[number];
export type Shape = (typeof SHAPES)[number];
export type Font = (typeof FONTS)[number];

export interface ElementFormat {
  size?: Size;
  shape?: Shape;
  font?: Font;
}

/** Formats for one section, keyed by element: `headline`, `sub`, `cards`, `buttons`, … */
export type SectionStyle = Record<string, ElementFormat>;

/** The elements each section kind has, in display order. "tile" is the section itself. */
export const ELEMENTS: Record<string, readonly string[]> = {
  hero: ["tile", "headline", "sub"],
  features: ["tile", "headline", "cards"],
  text: ["tile", "headline", "sub", "points"],
  flow: ["tile", "headline", "sub", "steps"],
  cta: ["tile", "headline", "sub", "buttons"]
};

/** Elements that are boxes, so a shape means something for them. */
export const SHAPED = new Set(["tile", "cards", "steps", "buttons"]);

const editing = import.meta.env.MODE === "editor";

function pick<T extends string>(allowed: readonly T[], value: unknown): T | undefined {
  return allowed.includes(value as T) ? (value as T) : undefined;
}

/**
 * Attributes for one element. Unknown values are dropped, so a hand-edited manifest can't
 * inject anything. The `data-edit` marker that lets the editor select an element exists only
 * in the editor's dev mode, never in a published build.
 */
export function formatAttrs(style: SectionStyle | undefined, section: number, element: string): Record<string, string> {
  const format = style?.[element];
  const attrs: Record<string, string> = {};
  const size = pick(SIZES, format?.size);
  const shape = SHAPED.has(element) ? pick(SHAPES, format?.shape) : undefined;
  const font = pick(FONTS, format?.font);
  if (size && size !== "m") attrs["data-size"] = size;
  if (shape) attrs["data-shape"] = shape;
  if (font && font !== "site") attrs["data-font"] = font;
  if (editing) attrs["data-edit"] = `${section}:${element}`;
  return attrs;
}
