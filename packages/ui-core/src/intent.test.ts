import { describe, it, expect } from "vitest";
import {
  IntentSession,
  isDangerousTool,
  proposePlan,
  TOOL_CAPABILITY,
  type IntentProposal,
  type PlanStep
} from "./intent.js";

describe("proposePlan", () => {
  it("routes known intents to concrete tools with resolved args", () => {
    const p = proposePlan("show me the crew roster");
    expect(p.steps.length).toBeGreaterThan(0);
    expect(p.steps[0]!.tool).toBe("scout_roster");
    expect(p.steps[0]!.capability).toBe(TOOL_CAPABILITY["scout_roster"]);
    expect(p.role).toBe("business");
  });

  it("routes engine status and models", () => {
    expect(proposePlan("status of the engine").steps[0]!.tool).toBe("scout_status");
    expect(proposePlan("what models are installed").steps[0]!.tool).toBe("scout_models");
  });

  it("routes writes as dangerous and flagged", () => {
    const p = proposePlan("save this to the blackboard");
    const write = p.steps.find((s) => s.tool === "scout_blackboard_write");
    expect(write).toBeDefined();
    expect(write!.dangerous).toBe(true);
    expect(isDangerousTool("scout_blackboard_write")).toBe(true);
  });

  it("routes unclassified free text to chat without fabricating other tools", () => {
    const p = proposePlan("just a random thought to discuss");
    expect(p.steps.length).toBe(1);
    expect(p.steps[0]!.tool).toBe("scout_chat");
  });

  it("never fabricates a plan from empty/garbage input", () => {
    expect(proposePlan("").steps).toHaveLength(0);
    expect(proposePlan("  ").steps).toHaveLength(0);
    expect(proposePlan(undefined as unknown as string).steps).toHaveLength(0);
    expect(proposePlan(null as unknown as string).steps).toHaveLength(0);
  });

  it("caps plan steps and clamps text length", () => {
    const big = "status models roster crew".repeat(400);
    const p = proposePlan(big, { maxSteps: 2 });
    expect(p.steps.length).toBeLessThanOrEqual(2);
    expect(p.intent.length).toBeLessThanOrEqual(4000);
  });

  it("defaults dry-run on and makes proposals unconfirmed", () => {
    const p: IntentProposal = proposePlan("status");
    expect(p.dryRun).toBe(true);
    expect(p.confirmed).toBe(false);
    expect(p.role).toBe("business");
  });
});

describe("IntentSession", () => {
  it("records a capped transcript and confirms in place", () => {
    const s = new IntentSession({ maxTranscript: 5 });
    const p = s.propose("status", "enterprise", true);
    const confirmed = s.confirm(p);
    expect(confirmed.confirmed).toBe(true);
    expect(s.transcriptSize).toBe(1);
    expect(s.history()[0]!.confirmed).toBe(true);
    expect(s.history()[0]!.role).toBe("enterprise");
  });

  it("caps the transcript ring buffer", () => {
    const s = new IntentSession({ maxTranscript: 3 });
    for (let i = 0; i < 8; i++) s.propose("status", "personal", true);
    expect(s.transcriptSize).toBe(3);
  });

  it("session never executes anything (pure model)", () => {
    const s = new IntentSession();
    const steps: PlanStep[] = s.propose("write stuff").steps;
    expect(steps.some((st) => st.dangerous)).toBe(true);
    expect(steps.every((st) => !("ran" in st))).toBe(true);
  });
});