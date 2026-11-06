import { beforeEach, describe, expect, it, vi } from "vitest";
import { onRequest as adminGate } from "../functions/api/admin/_middleware";
import { onRequestPost as approve } from "../functions/api/admin/posts/[id]/approve";
import { onRequestPatch as edit } from "../functions/api/admin/posts/[id]/index";
import { onRequestPost as reject } from "../functions/api/admin/posts/[id]/reject";
import { onRequestGet as queue } from "../functions/api/admin/posts/index";
import { onRequestGet as readPost } from "../functions/api/posts/[slug]";
import { checkHost, checkImageFile, checkLinkShape, classifyImage } from "../functions/api/posts/_screen";
import { onRequestGet as readImage } from "../functions/api/posts/images/[id]/[position]";
import { onRequestGet as list, onRequestPost as submit } from "../functions/api/posts/index";
import { imagesIn, linksIn, parseBody } from "../src/post-body";
import { freshDb } from "./d1";

const ORIGIN = "https://site.test";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const safeAi = { run: async () => ({ description: " SAFE. " }) };

let env: Record<string, unknown>;
const call = (handler: unknown, request: Request, params: Record<string, string> = {}) =>
  (handler as (ctx: unknown) => Promise<Response>)({ env, request, params, next: async () => new Response("reached") });

function form(fields: Record<string, string>, files: File[] = []): Request {
  const body = new FormData();
  for (const [key, value] of Object.entries({ title: "A title", summary: "A summary", body: "Some text.", ...fields })) {
    body.set(key, value);
  }
  for (const file of files) body.append("images", file);
  return new Request(`${ORIGIN}/api/posts`, { method: "POST", body, headers: { Origin: ORIGIN } });
}

const admin = (path: string, init: RequestInit = {}) =>
  new Request(`${ORIGIN}${path}`, { ...init, headers: { Authorization: "Bearer secret" } });

const pendingPosts = async () =>
  (await (await call(queue, admin("/api/admin/posts"))).json()) as { id: string; slug: string; title: string }[];

function resolver(answer: unknown) {
  vi.stubGlobal("fetch", async () => Response.json(answer));
}

beforeEach(() => {
  env = { DB: freshDb().db, AI: safeAi, SKILL_SALT: "salt", POSTS_ADMIN_TOKEN: "secret" };
  resolver({ Status: 0, Answer: [{ type: 1, data: "192.0.2.1" }] });
});

describe("post format", () => {
  it("parses headings, links and images without producing markup", () => {
    const blocks = parseBody("## Head\n\nSee [a](https://a.example/x) now\n\n![Alt](image:2)\n\n<script>alert(1)</script>");
    expect(blocks[0]).toEqual({ kind: "heading", text: "Head" });
    expect(blocks[2]).toEqual({ kind: "image", position: 2, alt: "Alt" });
    expect(blocks[3]).toEqual({ kind: "paragraph", parts: [{ kind: "text", text: "<script>alert(1)</script>" }] });
    expect(linksIn("[a](https://a.example/x)")).toEqual(["https://a.example/x"]);
    expect(imagesIn("![x](image:1)")).toEqual([1]);
  });
});

describe("post format blocks", () => {
  it("keeps code blocks whole and doesn't read them as markup", () => {
    const blocks = parseBody("Before\n\n```sh\npip install x\n\n[not](http://a.example)\n```\n\nAfter");
    expect(blocks).toEqual([
      { kind: "paragraph", parts: [{ kind: "text", text: "Before" }] },
      { kind: "code", text: "pip install x\n\n[not](http://a.example)" },
      { kind: "paragraph", parts: [{ kind: "text", text: "After" }] }
    ]);
    expect(linksIn("```\n[not](http://a.example)\n```")).toEqual([]);
  });

  it("parses lists, and screens the links inside them", () => {
    const body = "- One\n- See [two](http://a.example)";
    expect(parseBody(body)[0]!.kind).toBe("list");
    expect(linksIn(body)).toEqual(["http://a.example"]);
  });

  it("parses bold and inline code, and doesn't read links inside code", () => {
    expect(parseBody("Run **this** with `[x](http://a.example)`")[0]).toEqual({
      kind: "paragraph",
      parts: [
        { kind: "text", text: "Run " },
        { kind: "bold", text: "this" },
        { kind: "text", text: " with " },
        { kind: "code", text: "[x](http://a.example)" }
      ]
    });
    expect(linksIn("`[x](http://a.example)`")).toEqual([]);
  });

  it("leaves an unclosed fence as text", () => {
    expect(parseBody("```\ncode")[0]!.kind).toBe("paragraph");
  });
});

describe("image screening", () => {
  it("accepts a real PNG and names the sniffed type", () => {
    expect(checkImageFile(PNG, "image/png")).toEqual({ mime: "image/png" });
  });

  it.each([
    ["SVG", new TextEncoder().encode("<svg onload=alert(1)>"), "image/svg+xml", "Only PNG"],
    ["an executable named as an image", new Uint8Array([0x4d, 0x5a, 0x90, 0]), "image/png", "Only PNG"],
    ["a mismatched label", PNG, "image/jpeg", "labelled"],
    ["script hidden after a PNG header", new Uint8Array([...PNG, ...new TextEncoder().encode("<ScRiPt>")]), "image/png", "embedded"],
    ["a zip appended to a PNG", new Uint8Array([...PNG, 0x50, 0x4b, 3, 4]), "image/png", "embedded"],
    ["an oversized file", new Uint8Array([...PNG, ...new Uint8Array(1_000_001)]), "image/png", "1 MB"]
  ])("rejects %s", (_name, bytes, type, reason) => {
    expect(checkImageFile(bytes, type)).toEqual({ reason: expect.stringContaining(reason) });
  });

  it("fails closed unless the classifier says exactly SAFE", async () => {
    expect(await classifyImage(safeAi, PNG)).toBeNull();
    expect(await classifyImage({ run: async () => ({ description: "EXPLICIT" }) }, PNG)).toContain("explicit");
    expect(await classifyImage({ run: async () => ({ description: "Safe to say this is explicit" }) }, PNG)).toContain("explicit");
    expect(await classifyImage({ run: async () => ({}) }, PNG)).toContain("explicit");
    expect(await classifyImage(undefined, PNG)).toContain("unavailable");
    expect(await classifyImage({ run: () => Promise.reject(new Error("down")) }, PNG)).toContain("unavailable");
  });
});

describe("link screening", () => {
  it.each([
    ["http://a.example/", "https"],
    ["javascript:alert(1)", "https"],
    ["https://user:pw@a.example/", "password"],
    ["https://a.example:8443/", "port"],
    ["https://192.0.2.1/", "IP"],
    ["https://xn--pple-43d.com/", "punycode"],
    ["https://bit.ly/x", "shorteners"],
    ["https://a.example/setup.EXE", "executable"],
    ["//a.example/x", "valid"]
  ])("rejects %s", (href, reason) => {
    expect(checkLinkShape(href)).toEqual({ reason: expect.stringContaining(reason) });
  });

  it("keeps same-site links off the network and passes normal domains on to it", () => {
    expect(checkLinkShape("/skills#vault-memory")).toBeNull();
    expect(checkLinkShape("https://obsidian.md/plugins")).toEqual({ host: "obsidian.md" });
  });

  it("reads the resolver's answers, and fails closed", async () => {
    const reply = (body: unknown) => (async () => Response.json(body)) as unknown as typeof fetch;
    expect(await checkHost("a.example", reply({ Status: 0, Answer: [{ type: 1, data: "192.0.2.1" }] }))).toBeNull();
    expect(await checkHost("a.example", reply({ Status: 0, Answer: [{ type: 1, data: "0.0.0.0" }] }))).toContain("malware");
    expect(await checkHost("a.example", reply({ Status: 3 }))).toContain("doesn't exist");
    expect(await checkHost("a.example", reply({ Status: 2 }))).toContain("unavailable");
    expect(await checkHost("a.example", (() => Promise.reject(new Error())) as typeof fetch)).toContain("unavailable");
  });
});

describe("the approval gate", () => {
  it("keeps a submission out of public view until it is approved", async () => {
    const png = new File([PNG], "a.png", { type: "image/png" });
    const res = await call(submit, form({ title: "My Post!", body: "Text\n\n![Alt](image:1)" }, [png]));
    expect(res.status).toBe(202);

    const [post] = await pendingPosts();
    expect(await (await call(list, new Request(`${ORIGIN}/api/posts`))).json()).toEqual([]);
    expect((await call(readPost, new Request(ORIGIN), { slug: post!.slug })).status).toBe(404);
    expect((await call(readImage, new Request(ORIGIN), { id: post!.id, position: "1" })).status).toBe(404);

    const editReq = admin("/x", { method: "PATCH", body: JSON.stringify({ title: "Edited" }) });
    expect((await call(edit, editReq, { id: post!.id })).status).toBe(200);
    expect((await call(approve, admin("/x"), { id: post!.id })).status).toBe(200);

    const live = (await (await call(readPost, new Request(ORIGIN), { slug: post!.slug })).json()) as { title: string; images: object };
    expect(live.title).toBe("Edited");
    expect(Object.keys(live.images)).toEqual(["1"]);
    const image = await call(readImage, new Request(ORIGIN), { id: post!.id, position: "1" });
    expect(image.headers.get("Content-Type")).toBe("image/png");
    expect(image.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await pendingPosts()).toEqual([]);
  });

  it("never stores rejected content, and says why", async () => {
    env.AI = { run: async () => ({ description: "EXPLICIT" }) };
    const png = new File([PNG], "a.png", { type: "image/png" });
    resolver({ Status: 0, Answer: [{ type: 1, data: "0.0.0.0" }] });
    const res = await call(submit, form({ body: "[bad](https://malware.example/)" }, [png]));
    expect(res.status).toBe(422);
    const { reasons } = (await res.json()) as { reasons: { field: string; reason: string }[] };
    expect(reasons.map((r) => r.field)).toEqual(["a.png", "https://malware.example/"]);
    expect(reasons[0]!.reason).toContain("explicit");
    expect(reasons[1]!.reason).toContain("malware");
    expect(await pendingPosts()).toEqual([]);
  });

  it("rejects an image when no classifier is bound", async () => {
    delete env.AI;
    const png = new File([PNG], "a.png", { type: "image/png" });
    expect((await call(submit, form({}, [png]))).status).toBe(422);
    expect(await pendingPosts()).toEqual([]);
  });

  it("screens an editor's links too", async () => {
    await call(submit, form({}));
    const [post] = await pendingPosts();
    const body = JSON.stringify({ body: "[x](http://a.example)" });
    expect((await call(edit, admin("/x", { method: "PATCH", body }), { id: post!.id })).status).toBe(422);
  });

  it("takes a published post down on reject, and can't re-approve it", async () => {
    await call(submit, form({}));
    const [post] = await pendingPosts();
    await call(approve, admin("/x"), { id: post!.id });
    expect((await call(reject, admin("/x", { method: "POST", body: "{}" }), { id: post!.id })).status).toBe(200);
    expect((await call(readPost, new Request(ORIGIN), { slug: post!.slug })).status).toBe(404);
    expect((await call(approve, admin("/x"), { id: post!.id })).status).toBe(409);
  });

  it("refuses other origins, bots and floods", async () => {
    const foreign = new Request(`${ORIGIN}/api/posts`, { method: "POST", headers: { Origin: "https://evil.example" } });
    expect((await call(submit, foreign)).status).toBe(403);

    await call(submit, form({ website: "bot" }));
    expect(await pendingPosts()).toEqual([]);

    await call(submit, form({ title: "" }));
    await call(submit, form({ title: "" }));
    expect((await call(submit, form({}))).status).toBe(429);
  });
});

describe("the admin gate", () => {
  const guarded = (headers: HeadersInit = {}, method = "GET") =>
    call(adminGate, new Request(`${ORIGIN}/api/admin/posts`, { headers, method }));

  it("needs the exact token", async () => {
    expect((await guarded()).status).toBe(401);
    expect((await guarded({ Authorization: "Bearer wrong" })).status).toBe(401);
    expect(await (await guarded({ Authorization: "Bearer secret" })).text()).toBe("reached");
  });

  it("stays shut when no token is configured, even for an empty one", async () => {
    delete env.POSTS_ADMIN_TOKEN;
    expect((await guarded({ Authorization: "Bearer " })).status).toBe(503);
  });

  it("only allows listed origins", async () => {
    env.POSTS_ADMIN_ORIGINS = "http://localhost:8790";
    const ok = await guarded({ Origin: "http://localhost:8790" }, "OPTIONS");
    expect(ok.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:8790");
    const other = await guarded({ Origin: "https://evil.example" }, "OPTIONS");
    expect(other.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
