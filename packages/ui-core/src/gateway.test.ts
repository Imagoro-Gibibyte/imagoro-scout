import { describe, it, expect, vi, afterEach, type Mock } from "vitest";
import { Gateway, isGatewayError, gatewayErrorText } from "./gateway.js";

type FetchSig = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function fakeFetch(body: unknown = {}, status = 200, headers: Record<string, string> = {}) {
  return vi.fn<FetchSig>(() =>
    Promise.resolve(new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headers }
    }))
  );
}

describe("Gateway", () => {
  const prev = globalThis.fetch;
  afterEach(() => { globalThis.fetch = prev; });

  it("rpc() posts to base/rpc with Bearer when token given", async () => {
    const fn = fakeFetch({ jsonrpc: "2.0", id: 1, result: { ok: true } });
    globalThis.fetch = fn;
    const g = new Gateway({ base: "http://localhost:19001", token: "tok123", fetchImpl: fn });
    const res = await g.rpc<{ result: { ok: boolean } }>("tools/list", {});
    expect(res.result?.ok).toBe(true);
    expect(fn).toHaveBeenCalledOnce();
    const [input, init] = fn.mock.calls[0]!;
    expect(String(input)).toBe("http://localhost:19001/rpc");
    expect(String(init?.body)).toContain("tools/list");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer tok123" });
  });

  it("unauthorized is a stable http error (not a throw of the raw body)", async () => {
    const fn = fakeFetch({ error: "unauthorized" }, 401);
    globalThis.fetch = fn;
    const g = new Gateway({ fetchImpl: fn });
    await expect(g.rpc("tools/list")).rejects.toSatisfy((e) => isGatewayError(e) && e.kind === "http" && e.status === 401);
  });

  it("timeout abort yields a stable timeout error", async () => {
    const fn = vi.fn<FetchSig>(() => new Promise((_, reject) => setTimeout(() => reject(new DOMException("aborted", "AbortError")), 50)));
    const g = new Gateway({ timeoutMs: 10, fetchImpl: fn });
    await expect(g.rpc("tools/list")).rejects.toSatisfy((e) => isGatewayError(e) && e.kind === "timeout");
  });

  it("non-JSON body is a parse error (never a raw dump)", async () => {
    const fn = vi.fn<FetchSig>(() => Promise.resolve(new Response("<html>bad</html>", { status: 200 })));
    const g = new Gateway({ fetchImpl: fn });
    await expect(g.rpc("tools/list")).rejects.toSatisfy((e) => isGatewayError(e) && e.kind === "parse");
  });

  it("response larger than cap is payload-too-large", async () => {
    const fn = vi.fn<FetchSig>(() => Promise.resolve(new Response("x".repeat(4_000_000), { status: 200 })));
    const g = new Gateway({ maxBodyBytes: 2048, fetchImpl: fn });
    await expect(g.rpc("tools/list")).rejects.toSatisfy((e) => isGatewayError(e) && e.kind === "payload-too-large");
  });

  it("gatewayErrorText is always single-line and bounded", () => {
    const t = gatewayErrorText(new DOMException("aborted", "AbortError"));
    expect(t).toContain("[gateway]");
    expect(t).toMatch(/^[^\n]+$/);
    expect(t.length).toBeLessThan(300);
  });
});