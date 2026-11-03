import { describe, expect, it } from "vitest";
import { ELEMENTS, formatAttrs } from "../src/format";

describe("section formatting", () => {
  it("turns a format into data attributes", () => {
    const style = { headline: { size: "xl", font: "serif" }, buttons: { shape: "pill" } } as const;
    expect(formatAttrs(style, 0, "headline")).toEqual({ "data-size": "xl", "data-font": "serif" });
    expect(formatAttrs(style, 0, "buttons")).toEqual({ "data-shape": "pill" });
  });

  it("leaves defaults, unknown values and shapes on text elements out", () => {
    const style = { headline: { size: "m", font: "site", shape: "pill" }, sub: { size: "huge", font: "<script>" } };
    expect(formatAttrs(style as never, 0, "headline")).toEqual({});
    expect(formatAttrs(style as never, 0, "sub")).toEqual({});
    expect(formatAttrs(undefined, 0, "headline")).toEqual({});
  });

  it("never marks elements for the editor outside its dev mode", () => {
    expect(import.meta.env.MODE).not.toBe("editor");
    expect(formatAttrs({}, 3, "tile")["data-edit"]).toBeUndefined();
  });

  it("lists the tile first for every section kind", () => {
    for (const elements of Object.values(ELEMENTS)) expect(elements[0]).toBe("tile");
  });
});
