import { describe, it, expect } from "vitest";
import {
  SIDEBAR_GROUPS,
  SIDEBAR_ICONS,
  sidebarGroupsFor,
  sidebarEntryById,
  sidebarEntryByIdFor,
  sidebarCapabilities,
  sidebarToolEntries,
  sidebarActivateEvent
} from "./sidebar.js";
import { TOOL_CAPABILITY, isDangerousTool } from "./intent.js";
import { ROLES } from "./acl.js";
import { roleCanCapability } from "./broker.js";

describe("sidebar model", () => {
  it("declares the five L2 groups with every entry icon-pinned", () => {
    expect(SIDEBAR_GROUPS.map((g) => g.id)).toEqual(["ask", "crew", "data", "explore", "system"]);
    for (const g of SIDEBAR_GROUPS) {
      for (const e of g.entries) {
        expect(e.id).toBeTruthy();
        expect(e.label).toBeTruthy();
        expect(SIDEBAR_ICONS[e.icon], `icon missing for ${e.id}`).toBeTruthy();
        expect(SIDEBAR_ICONS[e.icon]!.length).toBeGreaterThan(0);
      }
    }
  });

  it("every tool entry maps to a known harness tool and its dangerous flag agrees with the intent model", () => {
    for (const e of sidebarToolEntries()) {
      expect(TOOL_CAPABILITY[e.tool!], `tool ${e.tool} not in TOOL_CAPABILITY`).toBeTruthy();
      if (isDangerousTool(e.tool!)) {
        expect(e.dangerous, `entry ${e.id} must be flagged dangerous`).toBe(true);
      }
    }
  });

  it("every block entry references a real registered block id", () => {
    for (const g of SIDEBAR_GROUPS) {
      for (const e of g.entries) {
        if (e.block) expect(e.block).toMatch(/^imagoro\./);
        expect(e.tool !== undefined || e.block !== undefined, `entry ${e.id} must map a tool or a block`).toBe(true);
      }
    }
  });

  it("every referenced capability has an owning role in the matrix", () => {
    for (const cap of sidebarCapabilities()) {
      expect(ROLES.some((r) => roleCanCapability(r, cap)), `no role owns ${cap}`).toBe(true);
    }
  });

  it("audit (enterprise-only) is filtered away for personal and business, present for enterprise", () => {
    expect(sidebarEntryByIdFor("data.audit", "enterprise")).toBeDefined();
    expect(sidebarEntryByIdFor("data.audit", "business")).toBeUndefined();
    expect(sidebarEntryByIdFor("data.audit", "personal")).toBeUndefined();
    const bs = sidebarGroupsFor("business").flatMap((g) => g.entries).map((e) => e.id);
    expect(bs).toContain("crew.status");
    expect(bs).toContain("data.blackboard-write");
  });

  it("entry lookup is deterministic and the activate event carries the id", () => {
    const e = sidebarEntryById("crew.status");
    expect(e?.tool).toBe("scout_status");
    expect(e?.label).toBe("Status");
    const evt = sidebarActivateEvent(e!);
    expect(evt.type).toBe("sidebar/activate");
    expect(evt.payload.entryId).toBe("crew.status");
  });
});