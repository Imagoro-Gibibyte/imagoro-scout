import { describe, it, expect } from "vitest";
import { ToolBroker, isBrokerOk, roleCanCapability } from "./broker.js";
import { IntentSession, proposePlan, type IntentProposal } from "./intent.js";
import type { Gateway } from "./gateway.js";

function fakeGateway(over: Partial<Record<string, unknown>> = {}) {
  let calls = 0;
  const impl = {
    rpc: async (_m: string, params: Record<string, unknown>) => {
      calls++;
      const name = String((params as { name?: string })?.name ?? "");
      if (name === "scout_blackboard_write") {
        return { result: { content: [{ type: "text", text: "wrote config/x" }], isError: false } };
      }
      if (name === "scout_chat") {
        return { result: { content: [{ type: "text", text: "ok: chat reply" }], isError: false } };
      }
      if (over[name]) return over[name];
      return { result: { content: [{ type: "text", text: `${name} ok` }], isError: false } };
    }
  };
  return { gateway: impl as unknown as Gateway, calls: () => calls };
}

describe("ToolBroker dispatch gates", () => {
  it("dry-run proposals never dispatch (hard denial, no gateway call)", async () => {
    const { gateway, calls } = fakeGateway();
    const broker = new ToolBroker(gateway as unknown as Gateway);
    const res = await broker.dispatch({ tool: "scout_chat", args: { prompt: "hi" } }, { role: "business", dryRun: true });
    expect(res.ok).toBe(false);
    expect((res as { denial: string }).denial).toContain("dry-run");
    expect(calls()).toBe(0);
  });

  it("unknown tools and unknown capabilities are denied before the wire", async () => {
    const { gateway, calls } = fakeGateway();
    const broker = new ToolBroker(gateway as unknown as Gateway);
    const unknown = await broker.dispatch({ tool: "scout_exec", args: {} }, { role: "business", confirmed: true });
    expect(unknown.ok).toBe(false);
    expect((unknown as { denial: string }).denial).toBe("unknown-tool");
    expect(calls()).toBe(0);
  });

  it("dangerous tools require an explicit confirmation", async () => {
    const { gateway, calls } = fakeGateway();
    const broker = new ToolBroker(gateway as unknown as Gateway);
    const unconfirmed = await broker.dispatch({ tool: "scout_blackboard_write", args: { category: "config", key: "x", value: {} } }, { role: "enterprise", dryRun: false });
    expect(unconfirmed.ok).toBe(false);
    expect((unconfirmed as { denial: string }).denial).toBe("confirm-required: dangerous tool");
    expect(calls()).toBe(0);
    const confirmed = await broker.dispatch({ tool: "scout_blackboard_write", args: { category: "config", key: "x", value: {} } }, { role: "enterprise", confirmed: true });
    expect(confirmed.ok).toBe(true);
    expect(calls()).toBe(1);
  });

  it("role capability theft is denied (system:kill is enterprise-only)", async () => {
    const { gateway, calls } = fakeGateway();
    const broker = new ToolBroker(gateway as unknown as Gateway);
    const res = await broker.dispatch({ tool: "system_kill", args: {} }, { role: "business", confirmed: true });
    expect(res.ok).toBe(false);
    expect((res as { denial: string }).denial).toContain("forbidden:capability");
    expect(calls()).toBe(0);
    expect(roleCanCapability("enterprise", "system:kill")).toBe(true);
    expect(roleCanCapability("personal", "system:kill")).toBe(false);
    expect(roleCanCapability("enterprise", "system:audit")).toBe(true);
    expect(roleCanCapability("business", "system:audit")).toBe(false);
    expect(roleCanCapability("business", "explore:graph")).toBe(true);
    expect(roleCanCapability("personal", "engine:chat")).toBe(true);
  });

  it("L5 control-plane tools are enterprise-only and require confirmation", async () => {
    const { gateway, calls } = fakeGateway();
    const broker = new ToolBroker(gateway as unknown as Gateway);
    // scout_killswitch/scout_budget are dangerous + enterprise (system:*)
    const kill = await broker.dispatch({ tool: "scout_killswitch", args: { op: "status" } }, { role: "business", confirmed: true });
    expect(kill.ok).toBe(false);
    expect((kill as { denial: string }).denial).toContain("forbidden:capability");
    expect(calls()).toBe(0);
    const budgetUnconfirmed = await broker.dispatch({ tool: "scout_budget", args: { op: "revoke" } }, { role: "enterprise" });
    expect(budgetUnconfirmed.ok).toBe(false);
    expect((budgetUnconfirmed as { denial: string }).denial).toBe("confirm-required: dangerous tool");
    expect(calls()).toBe(0);
    // scout_audit is enterprise-only but read-only (not dangerous)
    const audit = await broker.dispatch({ tool: "scout_audit", args: {} }, { role: "business", confirmed: true });
    expect(audit.ok).toBe(false);
    expect((audit as { denial: string }).denial).toContain("forbidden:capability");
    expect(roleCanCapability("enterprise", "system:budget")).toBe(true);
    expect(roleCanCapability("business", "system:budget")).toBe(false);
  });

  it("L5 arg shapes are enforced (op enums + trip reason)", async () => {
    const { gateway, calls } = fakeGateway();
    const broker = new ToolBroker(gateway as unknown as Gateway);
    const badOp = await broker.dispatch({ tool: "scout_killswitch", args: { op: "nuke" } }, { role: "enterprise", confirmed: true });
    expect(badOp.ok).toBe(false);
    expect((badOp as { denial: string }).denial).toContain("invalid-args");
    const noReason = await broker.dispatch({ tool: "scout_killswitch", args: { op: "trip" } }, { role: "enterprise", confirmed: true });
    expect(noReason.ok).toBe(false);
    expect((noReason as { denial: string }).denial).toContain("invalid-args");
    const badBudgetOp = await broker.dispatch({ tool: "scout_budget", args: { op: "reset" } }, { role: "enterprise", confirmed: true });
    expect(badBudgetOp.ok).toBe(false);
    expect((badBudgetOp as { denial: string }).denial).toContain("invalid-args");
    expect(calls()).toBe(0);
  });

  it("race window rate-limits a tool kind fail-closed (client-side pre-send)", async () => {
    const { gateway, calls } = fakeGateway();
    const broker = new ToolBroker(gateway as unknown as Gateway, { perMinute: 1 });
    await broker.dispatch({ tool: "scout_status", args: {} }, { role: "business", confirmed: true });
    const second = await broker.dispatch({ tool: "scout_status", args: {} }, { role: "business", confirmed: true });
    expect(second.ok).toBe(false);
    expect((second as { denial: string }).denial).toBe("rate-limited: scout_status");
    expect(calls()).toBe(1);
  });

  it("invalid args are denied before the wire (enum/grammar/size)", async () => {
    const { gateway, calls } = fakeGateway();
    const broker = new ToolBroker(gateway as unknown as Gateway);
    const badKey = await broker.dispatch(
      { tool: "scout_blackboard_write", args: { category: "config", kind: "raw", key: "has space!", value: {} } },
      { role: "enterprise", confirmed: true }
    );
    expect(badKey.ok).toBe(false);
    expect((badKey as { denial: string }).denial).toContain("invalid-args");
    expect(calls()).toBe(0);
    const unreadable = await broker.dispatch(
      { tool: "scout_blackboard_write", args: { category: "audit", kind: "raw", key: "k", value: {} } },
      { role: "business", confirmed: true }
    );
    expect(unreadable.ok).toBe(false); // business cannot write audit
    expect(calls()).toBe(0);
  });

  it("happy path dispatches once and surfaces the stripped text", async () => {
    const { gateway, calls } = fakeGateway();
    const broker = new ToolBroker(gateway as unknown as Gateway);
    const res = await broker.dispatch({ tool: "scout_chat", args: { prompt: "summarize" } }, { role: "business", confirmed: true });
    expect(isBrokerOk(res)).toBe(true);
    if (res.ok) expect(res.data).toBe("ok: chat reply");
    expect(calls()).toBe(1);
  });
});

describe("executeIntent (L1 -> L3 bridge)", () => {
  it("runs confirmed proposal steps in order and halts on a denial (fail-closed)", async () => {
    const { gateway, calls } = fakeGateway();
    const broker = new ToolBroker(gateway as unknown as Gateway);
    const session = new IntentSession();
    const proposal: IntentProposal = {
      id: "itest",
      ts: 1,
      intent: "status then chat",
      role: "business",
      dryRun: false,
      confirmed: true,
      steps: [
        { tool: "scout_status", label: "status", args: {}, dangerous: false, capability: "engine:view" },
        { tool: "scout_chat", label: "chat", args: { prompt: "hi" }, dangerous: false, capability: "engine:chat" }
      ]
    };
    const out = await broker.executeIntent(proposal);
    expect(out.length).toBe(2);
    expect(out[0]!.ok).toBe(true);
    expect(out[1]!.ok).toBe(true);
    expect(calls()).toBe(2);
  });

  it("a denied step stops the plan and reports the denial", async () => {
    const { gateway, calls } = fakeGateway();
    const broker = new ToolBroker(gateway as unknown as Gateway);
    const proposal: IntentProposal = {
      id: "itest2",
      ts: 1,
      intent: "write",
      role: "personal",
      dryRun: false,
      confirmed: true,
      steps: [
        { tool: "scout_blackboard_write", label: "write", args: { category: "config", key: "x", value: {} }, dangerous: true, capability: "data:write" }
      ]
    };
    const out = await broker.executeIntent(proposal);
    expect(out.length).toBe(1);
    expect(out[0]!.ok).toBe(false);
    expect((out[0]! as { denial: string }).denial).toContain("invalid-args"); // personal cannot write config
    expect(calls()).toBe(0);
  });

  it("dry-run proposal never dispatches through executeIntent", async () => {
    const { gateway, calls } = fakeGateway();
    const broker = new ToolBroker(gateway as unknown as Gateway);
    const proposal = proposePlan("status", { role: "business", dryRun: true });
    const out = await broker.executeIntent(proposal, { confirmed: true });
    expect(out[0]!.ok).toBe(false);
    expect((out[0]! as { denial: string }).denial).toContain("dry-run");
    expect(calls()).toBe(0);
  });
});