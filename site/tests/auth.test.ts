import { beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestPost as approve } from "../functions/api/admin/posts/[id]/approve";
import { onRequestGet as queue } from "../functions/api/admin/posts/index";
import { onRequest as authGate } from "../functions/api/auth/_middleware";
import {
  LIMITS, PBKDF2_ITERATIONS, SESSION_COOKIE, constantTimeEqual, hashPassword, verifyPassword
} from "../functions/api/auth/_lib";
import { onRequestDelete as deleteAccount, onRequestGet as exportAccount } from "../functions/api/auth/account";
import { onRequestPost as changePassword } from "../functions/api/auth/change-password";
import { onRequestPost as login } from "../functions/api/auth/login";
import { onRequestPost as logout } from "../functions/api/auth/logout";
import { onRequestGet as me } from "../functions/api/auth/me";
import { onRequestGet as ownPosts } from "../functions/api/auth/posts";
import { onRequestPatch as profile } from "../functions/api/auth/profile";
import { onRequestPost as register } from "../functions/api/auth/register";
import { onRequestPost as requestReset } from "../functions/api/auth/request-reset";
import { onRequestPost as reset } from "../functions/api/auth/reset";
import { onRequestPost as verifyEmail } from "../functions/api/auth/verify-email";
import { onRequestPost as editApply } from "../functions/api/posts/[slug]/edit-apply";
import { onRequestPost as editRequest } from "../functions/api/posts/[slug]/edit-request";
import { onRequestPost as editVerify } from "../functions/api/posts/[slug]/edit-verify";
import { onRequestPost as submit } from "../functions/api/posts/index";
import { freshDb } from "./d1";

const ORIGIN = "https://site.test";
const MAIL = "https://mail.test/send";
const PASSWORD = "correct horse battery";

let env: Record<string, unknown>;
let sqlite: ReturnType<typeof freshDb>["sqlite"];
let mail: { to: string; subject: string; text: string }[];

const call = (handler: unknown, request: Request, params: Record<string, string> = {}) =>
  (handler as (ctx: unknown) => Promise<Response>)({ env, request, params, next: async () => new Response("reached") });

function req(path: string, { body, cookie, method = "POST", ip = "192.0.2.1" }: { body?: unknown; cookie?: string; method?: string; ip?: string } = {}) {
  const headers: Record<string, string> = { Origin: ORIGIN, "CF-Connecting-IP": ip, "User-Agent": "test" };
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return new Request(`${ORIGIN}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

/** The `name=value` part of the session cookie a response set. */
function cookieOf(res: Response): string {
  const header = res.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (!header) throw new Error("no session cookie");
  return header.split(";")[0]!;
}

async function signUp(email = "ada@example.com", password = PASSWORD, displayName = "Ada Lovelace"): Promise<string> {
  const res = await call(register, req("/api/auth/register", { body: { email, password, displayName } }));
  expect(res.status).toBe(201);
  return cookieOf(res);
}

const signIn = (email: string, password: string, ip?: string) => call(login, req("/api/auth/login", { body: { email, password }, ip }));
const whoami = (cookie: string) => call(me, req("/api/auth/me", { method: "GET", cookie }));
const tokenIn = (text: string) => /#token=([\w-]+)/.exec(text)?.[1] ?? /Token: (\w+)/.exec(text)?.[1] ?? "";

function postForm(fields: Record<string, string>, cookie?: string): Request {
  const body = new FormData();
  for (const [key, value] of Object.entries({ title: "A title", summary: "A summary", body: "Some text.", ...fields })) body.set(key, value);
  const headers: Record<string, string> = { Origin: ORIGIN };
  if (cookie) headers.Cookie = cookie;
  return new Request(`${ORIGIN}/api/posts`, { method: "POST", body, headers });
}

const admin = (path: string) => new Request(`${ORIGIN}${path}`, { method: "POST", headers: { Authorization: "Bearer secret" } });

beforeEach(() => {
  const fresh = freshDb();
  sqlite = fresh.sqlite;
  mail = [];
  env = { DB: fresh.db, SKILL_SALT: "salt", POSTS_ADMIN_TOKEN: "secret", MAIL_PROVIDER_URL: MAIL, MAIL_API_KEY: "relay" };
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (url === MAIL) {
      mail.push(JSON.parse(String(init?.body)));
      return Response.json({ ok: true });
    }
    return Response.json({ Status: 0, Answer: [{ type: 1, data: "192.0.2.1" }] });
  });
});

describe("password hashing", () => {
  it("verifies the right password and nothing else", async () => {
    const stored = await hashPassword(PASSWORD);
    expect(stored).toMatch(new RegExp(`^pbkdf2-sha256\\$${PBKDF2_ITERATIONS}\\$`));
    expect(stored).not.toContain(PASSWORD);
    expect(await verifyPassword(PASSWORD, stored)).toBe(true);
    expect(await verifyPassword(`${PASSWORD} `, stored)).toBe(false);
    expect(await hashPassword(PASSWORD)).not.toBe(stored);
  });

  it("reads the cost from the hash, and refuses malformed or over-cost hashes", async () => {
    expect(await verifyPassword("pw", await hashPassword("pw", 1000))).toBe(true);
    expect(await verifyPassword("pw", "plain")).toBe(false);
    expect(await verifyPassword("pw", "pbkdf2-sha256$abc$AA==$AA==")).toBe(false);
    const [, , salt, hash] = (await hashPassword("pw", 1000)).split("$");
    expect(await verifyPassword("pw", `pbkdf2-sha256$${PBKDF2_ITERATIONS + 1}$${salt}$${hash}`)).toBe(false);
  });

  it("compares bytes without stopping early", () => {
    expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
    expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
    expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false);
  });
});

describe("the auth gate", () => {
  const through = (method: string, origin?: string) =>
    call(authGate, new Request(`${ORIGIN}/api/auth/login`, { method, headers: origin ? { Origin: origin } : {} }));

  it("refuses state changes from other origins, or with no origin", async () => {
    expect((await through("POST", "https://evil.example")).status).toBe(403);
    expect((await through("POST")).status).toBe(403);
    expect((await through("DELETE", "https://evil.example")).status).toBe(403);
    expect(await (await through("POST", ORIGIN)).text()).toBe("reached");
    expect(await (await through("GET")).text()).toBe("reached");
  });

  it("stays shut without the database or the salt", async () => {
    delete env.SKILL_SALT;
    expect((await through("POST", ORIGIN)).status).toBe(503);
  });
});

describe("registration and sessions", () => {
  it("issues a hardened cookie and stores only hashes", async () => {
    const res = await call(register, req("/api/auth/register", { body: { email: " Ada@Example.com ", password: PASSWORD } }));
    expect(res.status).toBe(201);
    const header = res.headers.getSetCookie()[0]!;
    expect(header).toMatch(/^__Host-session=[\w-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800$/);

    const token = cookieOf(res).split("=")[1]!;
    const session = sqlite.prepare("SELECT * FROM account_sessions").get() as Record<string, string>;
    expect(JSON.stringify(session)).not.toContain(token);
    expect(JSON.stringify(session)).not.toContain("192.0.2.1");
    const account = sqlite.prepare("SELECT email, password_hash FROM accounts").get() as Record<string, string>;
    expect(account.email).toBe("ada@example.com");
    expect(account.password_hash).not.toContain(PASSWORD);

    const reply = (await (await whoami(cookieOf(res))).json()) as { account: { email: string; emailVerified: boolean } };
    expect(reply.account).toEqual({ email: "ada@example.com", emailVerified: false });
  });

  it("checks the email and password, and refuses a taken email in any case", async () => {
    const bad = (body: unknown) => call(register, req("/api/auth/register", { body })).then((r) => r.status);
    expect(await bad({ email: "nope", password: PASSWORD })).toBe(422);
    expect(await bad({ email: "a@example.com", password: "short" })).toBe(422);
    await signUp("a@example.com");
    expect(await bad({ email: "A@EXAMPLE.COM", password: PASSWORD })).toBe(409);
  });

  it("answers 401 without a session, with a made-up one, and after logout", async () => {
    expect((await whoami("")).status).toBe(401);
    expect((await whoami(`${SESSION_COOKIE}=made-up`)).status).toBe(401);
    const cookie = await signUp();
    const out = await call(logout, req("/api/auth/logout", { cookie }));
    expect(out.headers.getSetCookie()[0]).toContain("Max-Age=0");
    expect((await whoami(cookie)).status).toBe(401);
  });

  it("expires sessions, and slides an active one forward", async () => {
    const cookie = await signUp();
    const soon = new Date(Date.now() + 3600_000).toISOString();
    sqlite.prepare("UPDATE account_sessions SET expires_at = ?").run(soon);
    const slid = await whoami(cookie);
    expect(slid.status).toBe(200);
    expect(slid.headers.getSetCookie()[0]).toContain("Max-Age=");
    const { expires_at } = sqlite.prepare("SELECT expires_at FROM account_sessions").get() as { expires_at: string };
    expect(new Date(expires_at).getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 3600_000);

    // A fresh session doesn't rewrite its cookie on every request.
    expect((await whoami(cookie)).headers.getSetCookie()).toEqual([]);

    sqlite.prepare("UPDATE account_sessions SET expires_at = ?").run(new Date(Date.now() - 1000).toISOString());
    expect((await whoami(cookie)).status).toBe(401);
  });

  it("never slides a session past 30 days from sign-in", async () => {
    const cookie = await signUp();
    const old = new Date(Date.now() - 29.5 * 24 * 3600_000).toISOString();
    sqlite.prepare("UPDATE account_sessions SET created_at = ?, expires_at = ?").run(old, new Date(Date.now() + 3600_000).toISOString());
    await whoami(cookie);
    const { expires_at } = sqlite.prepare("SELECT expires_at FROM account_sessions").get() as { expires_at: string };
    expect(new Date(expires_at).getTime()).toBeLessThan(Date.now() + 24 * 3600_000);
  });
});

describe("login", () => {
  it("gives one message for a wrong password and an unknown email", async () => {
    await signUp();
    const wrong = await signIn("ada@example.com", "wrong password!");
    const unknown = await signIn("bob@example.com", PASSWORD);
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.json()).toEqual(await unknown.json());
    expect((await signIn("ADA@example.com", PASSWORD)).status).toBe(200);
  });

  it("locks an account after five wrong passwords, even for the right one", async () => {
    await signUp();
    for (let i = 0; i < LIMITS.failuresPerAccount.max; i++) {
      expect((await signIn("ada@example.com", "wrong password!", `192.0.2.${i + 10}`)).status).toBe(401);
    }
    expect((await signIn("ada@example.com", PASSWORD, "192.0.2.99")).status).toBe(429);
    // Another account isn't affected.
    await signUp("bob@example.com");
    expect((await signIn("bob@example.com", PASSWORD, "192.0.2.99")).status).toBe(200);
  });

  it("limits attempts per address", async () => {
    for (let i = 0; i < LIMITS.loginPerIp.max; i++) await signIn(`u${i}@example.com`, "whatever password");
    expect((await signIn("ada@example.com", PASSWORD)).status).toBe(429);
    expect((await signIn("ada@example.com", PASSWORD, "198.51.100.7")).status).toBe(401);
  });

  it("logs events without addresses or secrets", async () => {
    await signUp();
    await signIn("ada@example.com", "wrong password!");
    await signIn("ada@example.com", PASSWORD);
    const events = sqlite.prepare("SELECT kind, meta FROM account_events ORDER BY id").all() as { kind: string; meta: string | null }[];
    expect(events.map((e) => e.kind)).toEqual(["register", "login-failed", "login"]);
    expect(events.every((e) => e.meta === null)).toBe(true);
  });
});

describe("email confirmation and password reset", () => {
  it("confirms the email once with the mailed link", async () => {
    const cookie = await signUp();
    expect(mail).toHaveLength(1);
    expect(mail[0]!.text).toContain(`${ORIGIN}/verify#token=`);
    const token = tokenIn(mail[0]!.text);
    expect((await call(verifyEmail, req("/api/auth/verify-email", { body: { token } }))).status).toBe(200);
    expect(((await (await whoami(cookie)).json()) as { account: { emailVerified: boolean } }).account.emailVerified).toBe(true);
    expect((await call(verifyEmail, req("/api/auth/verify-email", { body: { token } }))).status).toBe(410);
  });

  it("answers a reset request the same way whether or not the account exists", async () => {
    await signUp();
    mail = [];
    const unknown = await call(requestReset, req("/api/auth/request-reset", { body: { email: "nobody@example.com" } }));
    expect(unknown.status).toBe(202);
    expect(mail).toEqual([]);
    const known = await call(requestReset, req("/api/auth/request-reset", { body: { email: "ada@example.com" } }));
    expect(known.status).toBe(202);
    expect(await known.json()).toEqual(await unknown.json());
    expect(mail).toHaveLength(1);
  });

  it("resets the password once, and signs out every session", async () => {
    const cookie = await signUp();
    await call(requestReset, req("/api/auth/request-reset", { body: { email: "ada@example.com" } }));
    const token = tokenIn(mail.at(-1)!.text);
    const next = "a brand new passphrase";
    expect((await call(reset, req("/api/auth/reset", { body: { token, password: next } }))).status).toBe(200);
    expect((await whoami(cookie)).status).toBe(401);
    expect((await signIn("ada@example.com", PASSWORD)).status).toBe(401);
    expect((await signIn("ada@example.com", next)).status).toBe(200);
    expect((await call(reset, req("/api/auth/reset", { body: { token, password: next } }))).status).toBe(410);
  });

  it("refuses an expired reset link", async () => {
    await signUp();
    await call(requestReset, req("/api/auth/request-reset", { body: { email: "ada@example.com" } }));
    sqlite.prepare("UPDATE password_resets SET expires_at = ?").run(new Date(Date.now() - 1000).toISOString());
    const token = tokenIn(mail.at(-1)!.text);
    expect((await call(reset, req("/api/auth/reset", { body: { token, password: "a brand new passphrase" } }))).status).toBe(410);
  });

  it("changes the password with the current one, keeping only this session", async () => {
    const here = await signUp();
    const elsewhere = cookieOf(await signIn("ada@example.com", PASSWORD));
    const change = (current: string) =>
      call(changePassword, req("/api/auth/change-password", { cookie: here, body: { current, next: "a brand new passphrase" } }));
    expect((await change("wrong password!")).status).toBe(401);
    expect((await change(PASSWORD)).status).toBe(200);
    expect((await whoami(here)).status).toBe(200);
    expect((await whoami(elsewhere)).status).toBe(401);
  });
});

describe("profile and account", () => {
  it("updates the profile, keeping fields left out, and only allows https sites", async () => {
    const cookie = await signUp();
    const patch = (body: unknown) => call(profile, req("/api/auth/profile", { method: "PATCH", cookie, body }));
    expect((await patch({ bio: "Notes." })).status).toBe(200);
    expect((await patch({ website: "javascript:alert(1)" })).status).toBe(422);
    expect((await patch({ website: "http://a.example" })).status).toBe(422);
    expect((await patch({ website: "https://a.example" })).status).toBe(200);
    const { profile: saved } = (await (await whoami(cookie)).json()) as { profile: unknown };
    expect(saved).toEqual({ displayName: "Ada Lovelace", bio: "Notes.", website: "https://a.example/" });
    expect((await call(profile, req("/api/auth/profile", { method: "PATCH", body: {} }))).status).toBe(401);
  });

  it("exports the account, and deletes it with every post it owns", async () => {
    const cookie = await signUp();
    await call(submit, postForm({ title: "Mine" }, cookie));
    const exported = (await (await call(exportAccount, req("/api/auth/account", { method: "GET", cookie }))).json()) as {
      account: { email: string };
      posts: { title: string }[];
    };
    expect(exported.account.email).toBe("ada@example.com");
    expect(exported.posts.map((p) => p.title)).toEqual(["Mine"]);
    expect(JSON.stringify(exported)).not.toContain("pbkdf2");

    const remove = (password: string) => call(deleteAccount, req("/api/auth/account", { method: "DELETE", cookie, body: { password } }));
    expect((await remove("wrong password!")).status).toBe(401);
    expect((await remove(PASSWORD)).status).toBe(200);
    expect((await whoami(cookie)).status).toBe(401);
    for (const table of ["accounts", "account_profiles", "account_sessions", "account_events", "email_verifications", "posts"]) {
      expect(sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()).toEqual({ n: 0 });
    }
  });
});

describe("posts under an account", () => {
  it("smoke: register, confirm, log in, edit profile, post, edit by session, log out", async () => {
    await signUp("ada@example.com", PASSWORD, "Ada");
    await call(verifyEmail, req("/api/auth/verify-email", { body: { token: tokenIn(mail[0]!.text) } }));
    const cookie = cookieOf(await signIn("ada@example.com", PASSWORD));
    await call(profile, req("/api/auth/profile", { method: "PATCH", cookie, body: { displayName: "Ada L." } }));

    expect((await call(submit, postForm({ title: "Owned" }, cookie))).status).toBe(202);
    const [mine] = (await (await call(ownPosts, req("/api/auth/posts", { method: "GET", cookie }))).json()) as { slug: string; status: string }[];
    expect(mine!.status).toBe("pending");
    const row = sqlite.prepare("SELECT id, author, account_id, edit_email_hash FROM posts").get() as Record<string, string | null>;
    expect(row.author).toBe("Ada L.");
    expect(row.account_id).not.toBeNull();
    expect(row.edit_email_hash).toBeNull();
    await call(approve, admin(`/api/admin/posts/${row.id}/approve`), { id: row.id! });

    const edit = (as?: string) => call(editApply, req(`/api/posts/${mine!.slug}/edit-apply`, { cookie: as, body: { title: "Edited" } }), { slug: mine!.slug });
    const stranger = await signUp("eve@example.com");
    expect((await edit(stranger)).status).toBe(422);
    expect((await edit()).status).toBe(422);
    expect((await edit(cookie)).status).toBe(200);
    expect(sqlite.prepare("SELECT title FROM posts").get()).toEqual({ title: "Edited" });

    await call(logout, req("/api/auth/logout", { cookie }));
    expect((await edit(cookie)).status).toBe(422);
  });
});

describe("edit tokens for anonymous posts", () => {
  async function anonymousPost(email: string) {
    await call(submit, postForm({ email }));
    const [post] = (await (await call(queue, new Request(`${ORIGIN}/api/admin/posts`, { headers: { Authorization: "Bearer secret" } }))).json()) as {
      id: string;
      slug: string;
    }[];
    return post!;
  }

  const ask = (slug: string, email: string) => call(editRequest, req(`/api/posts/${slug}/edit-request`, { body: { email } }), { slug });

  it("stores only a hash of the email, and mails a token only to that address", async () => {
    const post = await anonymousPost("Writer@example.com");
    expect(JSON.stringify(sqlite.prepare("SELECT * FROM posts").get())).not.toContain("example.com");

    const other = await ask(post.slug, "eve@example.com");
    expect(other.status).toBe(202);
    expect(mail).toEqual([]);
    const owner = await ask(post.slug, "writer@example.com");
    expect(await owner.json()).toEqual(await other.json());
    expect(mail.map((m) => m.to)).toEqual(["writer@example.com"]);
    expect(JSON.stringify(sqlite.prepare("SELECT * FROM edit_tokens").all())).not.toContain("example.com");
  });

  it("checks a token without spending it, then spends it on save", async () => {
    const post = await anonymousPost("writer@example.com");
    await ask(post.slug, "writer@example.com");
    const token = tokenIn(mail[0]!.text);
    const body = { email: "writer@example.com", token };
    const at = (handler: unknown, path: string, extra = {}) =>
      call(handler, req(`/api/posts/${post.slug}/${path}`, { body: { ...body, ...extra } }), { slug: post.slug });

    expect((await at(editVerify, "edit-verify")).status).toBe(200);
    expect((await at(editVerify, "edit-verify")).status).toBe(200);
    expect((await at(editApply, "edit-apply", { title: "" })).status).toBe(422);
    expect((await at(editApply, "edit-apply", { title: "Fixed" })).status).toBe(200);
    expect((await at(editApply, "edit-apply", { title: "Again" })).status).toBe(409);
    expect((await at(editVerify, "edit-verify", { email: "eve@example.com" })).status).toBe(401);
  });

  it("refuses edit requests from other origins", async () => {
    const foreign = new Request(`${ORIGIN}/api/posts/x/edit-request`, { method: "POST", headers: { Origin: "https://evil.example" }, body: "{}" });
    expect((await call(editRequest, foreign, { slug: "x" })).status).toBe(403);
  });
});
