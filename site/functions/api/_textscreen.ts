import type { AiBinding, Rejection } from "./posts/_screen";

/**
 * Screening for short public text: display names, handles, bios and author names.
 *
 * Two layers, and like the image screen, both fail closed:
 * 1. A term list matched after normalizing the text the way trolls disguise it: look-alike
 *    letters from other alphabets, accents, full-width and styled letters, leet digits and
 *    symbols, letters spaced out or split by dots and invisible characters, and letters repeated.
 * 2. Llama Guard on Workers AI, which reads the text in context and catches what a list can't.
 *
 * The lists are base64 so the repository doesn't display them; decode one with atob() to read it.
 * "strong" terms match anywhere, even inside other words. "word" terms only match as a whole
 * word (with common endings), because they also occur inside innocent words.
 */
const TERMS = {
  strong:
    "WyJmdWNrIiwgIm5pZ2dlciIsICJuaWdnYSIsICJmYWdnb3QiLCAid2hvcmUiLCAic2x1dCIsICJwb3JuIiwgImhlbnRhaSIsICJwZWRvcGhpbCIsICJwYWVkb3BoaWwiLCAid2V0YmFjayIsICJraWxseW91cnNlbGYiLCAiaGVpbGhpdGxlciIsICJzaWVnaGVpbCIsICJibG93am9iIiwgImhhbmRqb2IiLCAiZGlsZG8iLCAiaml6eiIsICJjdW1zaG90IiwgIm1pbGYiLCAiYml0Y2giLCAiYXNzaG9sZSIsICJza2FuayIsICJjb2Nrc3VjayIsICJvbmx5ZmFucyJd",
  word:
    "WyJhc3MiLCAiY3VudCIsICJ0d2F0IiwgInByaWNrIiwgImNvY2siLCAiY3VtIiwgInBlbmlzIiwgInZhZ2luYSIsICJwdXNzeSIsICJ0aXRzIiwgInRpdHR5IiwgImJvb2IiLCAiYW5hbCIsICJzaGl0IiwgImJhc3RhcmQiLCAiZmFnIiwgInJldGFyZCIsICJyYXBlIiwgInJhcGVkIiwgInJhcGluZyIsICJyYXBpc3QiLCAicGVkbyIsICJraWtlIiwgImNoaW5rIiwgInNwaWMiLCAidHJhbm55IiwgImR5a2UiLCAiY29vbiIsICJnb29rIiwgImJlYW5lciIsICJreXMiLCAibmF6aSIsICJoaXRsZXIiLCAid2FuayIsICJudWRlIiwgInNleCIsICJzZW1lbiIsICJvcmdhc20iLCAiaG9ybnkiLCAibnNmdyIsICJwb3JubyIsICJjdWNrIl0="
};
/** Raw sequences checked before any letter mapping. */
const RAW = ["1488"];

const TEXT_MODEL = "@cf/meta/llama-guard-3-8b";

const decode = (b64: string): string[] => JSON.parse(atob(b64)) as string[];

/** A term as a pattern where each letter may repeat: "ass" becomes a+s{2,}. */
function pattern(term: string): string {
  return (term.match(/(.)\1*/g) ?? []).map((run) => `${run[0]}{${run.length},}`).join("");
}

const ENDINGS = "(?:s|es|ed|er|ers|ing|y|ies|z)?";
const STRONG = decode(TERMS.strong).map((term) => new RegExp(pattern(term)));
const WORD = decode(TERMS.word).map((term) => new RegExp(`^${pattern(term)}${ENDINGS}$`));

const INVISIBLE = /[­͏؜ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁯﻿]/g;

// Letters from other alphabets that look Latin. NFKD below handles full-width and styled letters.
const HOMOGLYPHS: Record<string, string> = {
  а: "a", в: "b", е: "e", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c", т: "t", у: "y", х: "x",
  і: "i", ј: "j", ѕ: "s", ԁ: "d", ӏ: "l", ѵ: "v", ɡ: "g", ɑ: "a", ı: "i", α: "a", β: "b", ε: "e",
  η: "n", ι: "i", κ: "k", ν: "v", ο: "o", ƒ: "f", ρ: "p", τ: "t", υ: "u", χ: "x", ω: "w"
};

const LEET: Record<string, string> = {
  "0": "o", "2": "z", "3": "e", "4": "a", "5": "s", "6": "g", "7": "t", "8": "b", "9": "g",
  "@": "a", "$": "s", "+": "t", "!": "i", "(": "c", "<": "c", "€": "e", "¢": "c", "£": "l", "ß": "ss", "×": "x"
};

export interface Normalized {
  /** Words, with runs of single letters ("f u c k") joined back into one. */
  tokens: string[];
  /**
   * Each space-separated chunk with everything but letters removed, so "f.u.c.k" and "fu_ck" read
   * whole. Chunks don't run across spaces: joining real words makes false matches ("is lutz").
   */
  chunks: string[];
}

/**
 * The forms of a text the term list is matched against. "1" and "|" read as either i or l, and a
 * third reading also takes "v" as "u" and "ph" as "f" ("fvck", "phuck"), which would mangle
 * ordinary words if it were the only reading.
 */
export function normalize(text: string): Normalized[] {
  const base = [...text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(INVISIBLE, "")]
    .map((ch) => HOMOGLYPHS[ch] ?? LEET[ch] ?? ch)
    .join("");
  const readings = [
    (t: string) => t.replace(/[1|]/g, "i"),
    (t: string) => t.replace(/[1|]/g, "l"),
    (t: string) => t.replace(/[1|]/g, "i").replace(/ph/g, "f").replace(/v/g, "u")
  ];
  return readings.map((read) => {
    const letters = read(base);
    const tokens: string[] = [];
    let singles = "";
    for (const token of letters.split(/[^a-z]+/).filter(Boolean)) {
      if (token.length === 1) {
        singles += token;
        continue;
      }
      if (singles.length > 1) tokens.push(singles);
      singles = "";
      tokens.push(token);
    }
    if (singles.length > 1) tokens.push(singles);
    const chunks = letters.split(/\s+/).map((chunk) => chunk.replace(/[^a-z]/g, "")).filter(Boolean);
    return { tokens, chunks };
  });
}

/** Whether the term list catches the text. Says nothing about which term, so it can't be probed. */
export function blocked(text: string): boolean {
  if (RAW.some((raw) => text.replace(/\D/g, "").includes(raw))) return true;
  return normalize(text).some(({ tokens, chunks }) => {
    const words = [...tokens, ...chunks];
    return words.some((w) => STRONG.some((re) => re.test(w)) || WORD.some((re) => re.test(w)));
  });
}

/** Llama Guard's verdict on the text: null when safe, otherwise the reason it can't be accepted. */
export async function classifyText(ai: AiBinding | undefined, text: string): Promise<string | null> {
  const unavailable = "Text screening is unavailable right now, so this can't be saved. Try again later.";
  if (!ai) return unavailable;
  try {
    const result = (await ai.run(TEXT_MODEL, {
      messages: [{ role: "user", content: `A public profile on a website shows this text:\n\n${text}` }],
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 32
    })) as { response?: unknown };
    const response = result.response;
    if (response && typeof response === "object" && typeof (response as { safe?: unknown }).safe === "boolean") {
      return (response as { safe: boolean }).safe ? null : "That text was flagged as explicit or hateful content.";
    }
    const answer = String(response ?? "").trim().toLowerCase();
    if (answer.startsWith("unsafe")) return "That text was flagged as explicit or hateful content.";
    if (answer.startsWith("safe")) return null;
    return unavailable;
  } catch {
    return unavailable;
  }
}

/**
 * Screens labelled fields, list first, then the model on everything that passed.
 * Empty fields are skipped, and nothing calls the model when every field is empty.
 */
export async function screenText(ai: AiBinding | undefined, fields: Record<string, { label: string; value: string | null }>): Promise<Rejection[]> {
  const present = Object.entries(fields).filter(([, f]) => f.value && f.value.trim());
  const reasons: Rejection[] = present
    .filter(([, f]) => blocked(f.value!))
    .map(([field, f]) => ({ field, reason: `That ${f.label} isn't allowed here.` }));
  if (reasons.length > 0 || present.length === 0) return reasons;
  const flagged = await classifyText(ai, present.map(([, f]) => `${f.label}: ${f.value}`).join("\n"));
  return flagged ? [{ field: "form", reason: flagged }] : [];
}
