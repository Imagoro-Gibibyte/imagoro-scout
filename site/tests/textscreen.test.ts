import { describe, expect, it } from "vitest";
import { blocked, classifyText, screenText } from "../functions/api/_textscreen";

// The term list is base64 in the source; these spell its entries in ways trolls do.
describe("the term list", () => {
  it.each([
    "fuck", "FUCK off", "Fuuuuuck", "f u c k", "f.u.c.k", "f_u-c_k", "fvck", "phuck", "ｆｕｃｋ", "𝐟𝐮𝐜𝐤",
    "f​uck", "fü¢k", "ƒuck", "fцck".replace("ц", "u"), "a$$hole", "@ss", "a s s", "b1tch", "sh1t", "sh!t",
    "n1gg3r", "nіgger" /* Cyrillic і */, "s.l.u.t", "pornstar", "x_hentai_x", "big tits", "kys", "1488", "14/88",
    "c0ck", "|<ike".replace("|<", "k"), "p e n i s"
  ])("blocks %s", (text) => {
    expect(blocked(text)).toBe(true);
  });

  it.each([
    "Ada Lovelace", "Scunthorpe", "class act", "assassin", "Sussex", "therapist", "grape", "cocktail", "Hancock",
    "analysis", "shiitake", "Cumberland", "is lutz", "spice", "raccoon", "I love voxels", "pass", "Dick Grayson",
    "Matsuo", "photography", "1 4 8", "glasshouse", "documents"
  ])("allows %s", (text) => {
    expect(blocked(text)).toBe(false);
  });
});

describe("the model layer", () => {
  const ai = (response: unknown) => ({ run: async () => ({ response }) });

  it("reads both answer shapes, and fails closed on anything else", async () => {
    expect(await classifyText(ai({ safe: true, categories: [] }), "hi")).toBeNull();
    expect(await classifyText(ai({ safe: false, categories: ["S10"] }), "hi")).toContain("flagged");
    expect(await classifyText(ai("safe"), "hi")).toBeNull();
    expect(await classifyText(ai("unsafe\nS12"), "hi")).toContain("flagged");
    expect(await classifyText(ai("maybe"), "hi")).toContain("unavailable");
    expect(await classifyText(undefined, "hi")).toContain("unavailable");
    expect(await classifyText({ run: () => Promise.reject(new Error("down")) }, "hi")).toContain("unavailable");
  });

  it("lists first, then asks the model once about everything that passed", async () => {
    const calls: unknown[] = [];
    const spy = { run: async (_m: string, input: unknown) => (calls.push(input), { response: { safe: true } }) };
    const fields = { displayName: { label: "name", value: "Ada" }, bio: { label: "bio", value: "Builds things." } };
    expect(await screenText(spy, fields)).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(JSON.stringify(calls[0])).toContain("name: Ada");

    const listed = await screenText(spy, { ...fields, bio: { label: "bio", value: "f u c k" } });
    expect(listed).toEqual([{ field: "bio", reason: "That bio isn't allowed here." }]);
    expect(calls).toHaveLength(1);
    expect(await screenText(spy, { bio: { label: "bio", value: " " } })).toEqual([]);
    expect(calls).toHaveLength(1);
  });
});
