import { describe, expect, it } from "vitest";
import {
  ACL_MATRIX,
  canRead,
  canWrite,
  maskSnapshot,
  normalizeRole,
  readableCategories,
  ROLE_LABEL,
  scopeFor,
  writableKinds,
  type Role
} from "./acl.js";

describe("acl", () => {
  it("defines all three roles with labels and full matrix", () => {
    for (const role of ["personal", "business", "enterprise"] as const) {
      expect(ROLE_LABEL[role]).toBeTruthy();
      expect(ACL_MATRIX[role].read).toBeTruthy();
      expect(ACL_MATRIX[role].write).toBeTruthy();
    }
  });

  it("hierarchy: enterprise reads audit, business and personal none", () => {
    expect(canRead("enterprise", "audit", "raw")).toBe(true);
    expect(canRead("enterprise", "audit", "rewrite")).toBe(true);
    expect(canRead("business", "audit", "summary")).toBe(false);
    expect(canRead("business", "audit", "raw")).toBe(false);
    expect(canRead("business", "audit", "rewrite")).toBe(false);
    expect(canRead("personal", "audit", "summary")).toBe(false);
  });

  it("write gating: enterprise rewrites everything, personal stays out of pipeline", () => {
    expect(canWrite("enterprise", "route", "rewrite")).toBe(true);
    expect(canWrite("enterprise", "analytics", "rewrite")).toBe(true);
    expect(canWrite("business", "pipeline", "summary")).toBe(true);
    expect(canWrite("business", "mesh", "rewrite")).toBe(false);
    expect(canWrite("personal", "pipeline", "raw")).toBe(false);
    expect(canWrite("personal", "crew", "summary")).toBe(true);
  });

  it("unknown category or kind is denied", () => {
    expect(canRead("enterprise", "not-a-category", "summary")).toBe(false);
    expect(canWrite("enterprise", "pipeline", "delete")).toBe(false);
  });

  it("readableCategories excludes audit for personal and business", () => {
    const p = readableCategories("personal");
    const b = readableCategories("business");
    expect(p).not.toContain("audit");
    expect(p).toContain("pipeline");
    expect(b).not.toContain("audit");
    expect(readableCategories("enterprise")).toContain("audit");
  });

  it("writableKinds and scopeFor mirror the matrix", () => {
    expect(writableKinds("business", "crew")).toEqual(["raw", "summary", "rewrite"]);
    expect(writableKinds("personal", "crew")).toEqual(["raw", "summary"]);
    expect(scopeFor("personal", "pipeline").read).toEqual(["raw", "summary"]);
    expect(scopeFor("business", "pipeline").write).toEqual(["raw", "summary"]);
  });

  it("maskSnapshot hides unreadable categories with a reason marker", () => {
    const values = { pipeline: { a: 1 }, audit: { secret: true } };
    const business = maskSnapshot("business", values);
    expect(business.pipeline).toEqual({ a: 1 });
    expect(business.audit).toEqual({ masked: true, reason: "acl:category" });
  });

  it("normalizeRole defaults unknown values to business", () => {
    expect(normalizeRole("enterprise" as unknown)).toBe("enterprise");
    expect(normalizeRole("admin" as unknown)).toBe("business");
    expect(normalizeRole(undefined)).toBe("business");
    const r: Role = "personal";
    expect(normalizeRole(r)).toBe("personal");
  });
});