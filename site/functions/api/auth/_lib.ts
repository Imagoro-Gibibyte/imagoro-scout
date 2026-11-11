import { json, type Env } from "../posts/_store";

export interface AuthEnv extends Env {
  /** The mail relay (`email-worker/`), and the bearer token it expects. Without them, no mail is sent. */
  MAIL_PROVIDER_URL?: string;
  MAIL_API_KEY?: string;
}

export interface Session {
  sessionId: string;
  accountId: string;
  email: string;
  emailVerified: boolean;
  role: Role;
  /** A fresh cookie when the session slid forward, for the caller to send back. */
  refresh: string | null;
}

export type Role = "member" | "moderator" | "admin";
/** Higher outranks lower: a tier can only act on accounts below it. */
export const RANK: Record<Role, number> = { member: 0, moderator: 1, admin: 2 };

export const SESSION_COOKIE = "__Host-session";
export const SESSION_TTL_MS = 7 * 24 * 3600_000;
/** Sliding stops here: a session is never extended past 30 days from sign-in. */
export const SESSION_MAX_MS = 30 * 24 * 3600_000;
/** Workers refuse PBKDF2 above 100,000 iterations. The count is stored with each hash. */
export const PBKDF2_ITERATIONS = 100_000;
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 256;
export const TOKEN_TTL_MS = { reset: 3600_000, verify: 48 * 3600_000 };

const MINUTE = 60_000;
export const LIMITS = {
  loginPerIp: { max: 20, windowMs: 15 * MINUTE },
  /** The lockout: this many wrong passwords for one account in the window. */
  failuresPerAccount: { max: 5, windowMs: 15 * MINUTE },
  registerPerIp: { max: 5, windowMs: 60 * MINUTE },
  resetPerIp: { max: 5, windowMs: 15 * MINUTE },
  resetPerEmail: { max: 3, windowMs: 60 * MINUTE },
  tokenPerIp: { max: 20, windowMs: 15 * MINUTE }
} as const;

const encoder = new TextEncoder();

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function unbase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

export async function sha256Hex(text: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text))));
}

/** Compares in full, so the time taken says nothing about where two values differ. */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  return a.reduce((diff, byte, i) => diff | (byte ^ b[i]!), 0) === 0;
}

/** 256 random bits, URL-safe. Used for session cookies and emailed tokens. */
export function randomToken(): string {
  return base64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

/** `pbkdf2-sha256$<iterations>$<salt>$<hash>`, so the cost can rise without breaking old hashes. */
export async function hashPassword(password: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${iterations}$${base64(salt)}$${base64(await derive(password, salt, iterations))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, rounds, salt, hash] = stored.split("$");
  const iterations = Number(rounds);
  if (scheme !== "pbkdf2-sha256" || !salt || !hash) return false;
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > PBKDF2_ITERATIONS) return false;
  try {
    return constantTimeEqual(await derive(password, unbase64(salt), iterations), unbase64(hash));
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | null = null;
/** Spends the same work as a real check, so an unknown email answers no faster than a wrong password. */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword("not-a-real-password");
  await verifyPassword(password, await dummyHash);
}

export function normalizeEmail(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase();
}

export function validEmail(email: string): boolean {
  return email.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `The password needs at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return `The password can be ${PASSWORD_MAX} characters at most.`;
  return null;
}

export function fail(reason: string, status: number, field = "form"): Response {
  return json({ ok: false, reasons: [{ field, reason }] }, status);
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

/** State-changing requests must come from this site's own pages. */
export function sameOrigin(request: Request): boolean {
  return request.headers.get("Origin") === new URL(request.url).origin;
}

/** A salted, purpose-bound hash, so IPs and emails are never stored or compared in the clear. */
export function salted(env: AuthEnv, purpose: string, value: string): Promise<string> {
  return sha256Hex(`${purpose}|${value}|${env.SKILL_SALT ?? ""}`);
}

export function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "";
}

function windowOf(windowMs: number, now = Date.now()): string {
  return String(Math.floor(now / windowMs));
}

/** Counts one more hit and says whether the key is now over its limit. */
export async function overLimit(db: D1Database, key: string, limit: { max: number; windowMs: number }): Promise<boolean> {
  const row = await db
    .prepare(
      "INSERT INTO auth_limits (key, window, n) VALUES (?, ?, 1) ON CONFLICT (key, window) DO UPDATE SET n = n + 1 RETURNING n"
    )
    .bind(key, windowOf(limit.windowMs))
    .first<{ n: number }>();
  return (row?.n ?? 0) > limit.max;
}

/** Reads a counter without counting, for the lockout check before a password is tried. */
export async function atLimit(db: D1Database, key: string, limit: { max: number; windowMs: number }): Promise<boolean> {
  const row = await db
    .prepare("SELECT n FROM auth_limits WHERE key = ? AND window = ?")
    .bind(key, windowOf(limit.windowMs))
    .first<{ n: number }>();
  return (row?.n ?? 0) >= limit.max;
}

export function logEvent(db: D1Database, accountId: string, kind: string, meta?: Record<string, unknown>): D1PreparedStatement {
  return db
    .prepare("INSERT INTO account_events (account_id, kind, at, meta) VALUES (?, ?, ?, ?)")
    .bind(accountId, kind, new Date().toISOString(), meta ? JSON.stringify(meta) : null);
}

function sessionCookie(token: string, maxAgeMs: number): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(maxAgeMs / 1000))}`;
}

export const clearedCookie = sessionCookie("", 0);

/** Stores the hash of a new session token and returns the cookie that carries the token. */
export async function issueSession(env: AuthEnv, request: Request, accountId: string): Promise<string> {
  const token = randomToken();
  const now = Date.now();
  await env.DB!.prepare(
    "INSERT INTO account_sessions (id, account_id, token_hash, created_at, expires_at, user_agent_hash, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(
      crypto.randomUUID(),
      accountId,
      await sha256Hex(token),
      new Date(now).toISOString(),
      new Date(now + SESSION_TTL_MS).toISOString(),
      await salted(env, "ua", request.headers.get("User-Agent") ?? ""),
      await salted(env, "ip", clientIp(request))
    )
    .run();
  return sessionCookie(token, SESSION_TTL_MS);
}

function cookieToken(request: Request): string | null {
  for (const part of (request.headers.get("Cookie") ?? "").split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === SESSION_COOKIE) return value.join("=") || null;
  }
  return null;
}

/**
 * The signed-in account, or null. A session older than a day slides forward to a full TTL,
 * up to SESSION_MAX_MS after sign-in.
 */
export async function readSession(env: AuthEnv, request: Request): Promise<Session | null> {
  const token = cookieToken(request);
  if (!token || !env.DB) return null;
  const now = Date.now();
  const row = await env.DB.prepare(
    "SELECT s.id, s.account_id, s.token_hash, s.created_at, s.expires_at, a.email, a.email_verified_at, a.role FROM account_sessions s " +
      "JOIN accounts a ON a.id = s.account_id " +
      "WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND a.suspended_at IS NULL"
  )
    .bind(await sha256Hex(token), new Date(now).toISOString())
    .first<{ id: string; account_id: string; created_at: string; expires_at: string; email: string; email_verified_at: string | null; role: Role }>();
  if (!row) return null;

  let refresh: string | null = null;
  const expires = Math.min(now + SESSION_TTL_MS, new Date(row.created_at).getTime() + SESSION_MAX_MS);
  if (expires - new Date(row.expires_at).getTime() > 24 * 3600_000) {
    await env.DB.prepare("UPDATE account_sessions SET expires_at = ? WHERE id = ?").bind(new Date(expires).toISOString(), row.id).run();
    refresh = sessionCookie(token, expires - now);
  }
  return {
    sessionId: row.id, accountId: row.account_id, email: row.email, emailVerified: !!row.email_verified_at,
    role: row.role ?? "member", refresh
  };
}

/** Revokes every live session of an account, except `keep` when given. */
export function revokeSessions(db: D1Database, accountId: string, keep: string | null = null): D1PreparedStatement {
  return db
    .prepare("UPDATE account_sessions SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL AND (?3 IS NULL OR id != ?3)")
    .bind(new Date().toISOString(), accountId, keep);
}

/** Creates a single-use emailed token, stored as a hash, and returns the plaintext for the link. */
export async function issueEmailToken(db: D1Database, table: "password_resets" | "email_verifications", accountId: string): Promise<string> {
  const token = randomToken();
  const ttl = table === "password_resets" ? TOKEN_TTL_MS.reset : TOKEN_TTL_MS.verify;
  await db
    .prepare(`INSERT INTO ${table} (token_hash, account_id, expires_at) VALUES (?, ?, ?)`)
    .bind(await sha256Hex(token), accountId, new Date(Date.now() + ttl).toISOString())
    .run();
  return token;
}

/**
 * Marks an emailed token used and returns its account, or null if it's unknown, used or expired.
 * The update is the check, so two requests racing with one token can't both succeed.
 */
export async function consumeEmailToken(db: D1Database, table: "password_resets" | "email_verifications", token: string): Promise<string | null> {
  if (!token) return null;
  const now = new Date().toISOString();
  const row = await db
    .prepare(`UPDATE ${table} SET used_at = ?1 WHERE token_hash = ?2 AND used_at IS NULL AND expires_at > ?1 RETURNING account_id`)
    .bind(now, await sha256Hex(token))
    .first<{ account_id: string }>();
  return row?.account_id ?? null;
}

/** Best effort through the mail relay. Returns whether the relay accepted the message. */
export async function sendMail(env: AuthEnv, to: string, subject: string, text: string): Promise<boolean> {
  if (!env.MAIL_PROVIDER_URL || !env.MAIL_API_KEY) return false;
  try {
    const res = await fetch(env.MAIL_PROVIDER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.MAIL_API_KEY}` },
      body: JSON.stringify({ to, subject, text })
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Links in emails use a fragment, so the token never reaches a server log. */
export function emailLink(request: Request, path: string, token: string): string {
  return `${new URL(request.url).origin}${path}#token=${token}`;
}

export function withCookie(response: Response, cookie: string | null): Response {
  if (cookie) response.headers.append("Set-Cookie", cookie);
  return response;
}
