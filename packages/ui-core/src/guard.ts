/**
 * guard.ts — minimal one-line text sanitizer for the Imagoro client.
 *
 * Server/harness run the authoritative guard.mjs; the client mirrors only the
 * wire-facing bits: collapse any string crossing a UI/log/JSON boundary to a
 * single bounded line with control/format characters stripped. Prevents log
 * spoofing (CR/LF injection) and Bidi/zero-width UI spoofing without pulling
 * the full server guard surface into the browser bundle.
 */

const LINE_UNSAFE_RE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u200b-\u200f\ufeff\u{e0000}-\u{e007f}]/gu;
const CRLF_RE = /\r\n?|\n/g;

export function stripUnsafe(s: unknown, { max = 2000 } = {}): string {
  let out = typeof s === "string" ? s : String(s ?? "");
  out = out.replace(CRLF_RE, "\uFFFD");
  out = out.replace(LINE_UNSAFE_RE, "\uFFFD");
  return out.length > max ? `${out.slice(0, max)}…` : out;
}

/** ASCII identifier check (broker arg grammar mirror). */
const IDENT_RE = /^[A-Za-z0-9_.:-]{1,128}$/;

export function isSafeIdent(s: unknown): s is string {
  return typeof s === "string" && IDENT_RE.test(s);
}