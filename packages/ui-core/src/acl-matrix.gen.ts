/**
 * GENERATED FILE — do not edit by hand.
 * Derived from server/acl-matrix.json by scripts/gen-client-acl.mjs (L0.6
 * single-source parity, with server/src/policy.mjs + harness/src/policy.mjs).
 * Regenerate after any matrix change: node scripts/gen-client-acl.mjs
 */
export const ROLES = ["personal","business","enterprise"] as const;
export type Role = (typeof ROLES)[number];

export const BLACKBOARD_KINDS = ["raw","summary","rewrite"] as const;
export type BlackboardKind = (typeof BLACKBOARD_KINDS)[number];
export type BlackboardKindACL = Record<BlackboardKind, boolean>;

export const CATEGORIES = ["pipeline","crew","mesh","route","analytics","audit","config"] as const;
export type BlackboardCategory = (typeof CATEGORIES)[number];

export interface RoleScope {
  read: Partial<Record<BlackboardCategory, BlackboardKindACL>>;
  write: Partial<Record<BlackboardCategory, BlackboardKindACL>>;
}

export const ACL_MATRIX: Record<Role, RoleScope> = {
  "personal": {
    read: {
      "pipeline": { "raw": true, "summary": true, "rewrite": false },
      "crew": { "raw": false, "summary": true, "rewrite": false },
      "mesh": { "raw": false, "summary": true, "rewrite": false },
      "route": { "raw": false, "summary": true, "rewrite": false },
      "analytics": { "raw": false, "summary": false, "rewrite": false },
      "audit": { "raw": false, "summary": false, "rewrite": false },
      "config": { "raw": true, "summary": true, "rewrite": false },
    },
    write: {
      "pipeline": { "raw": false, "summary": false, "rewrite": false },
      "crew": { "raw": true, "summary": true, "rewrite": false },
      "mesh": { "raw": false, "summary": false, "rewrite": false },
      "route": { "raw": true, "summary": false, "rewrite": false },
      "analytics": { "raw": false, "summary": false, "rewrite": false },
      "audit": { "raw": false, "summary": false, "rewrite": false },
      "config": { "raw": false, "summary": false, "rewrite": false },
    },
  },
  "business": {
    read: {
      "pipeline": { "raw": true, "summary": true, "rewrite": true },
      "crew": { "raw": false, "summary": true, "rewrite": true },
      "mesh": { "raw": false, "summary": true, "rewrite": true },
      "route": { "raw": true, "summary": true, "rewrite": false },
      "analytics": { "raw": true, "summary": true, "rewrite": false },
      "audit": { "raw": false, "summary": false, "rewrite": false },
      "config": { "raw": true, "summary": true, "rewrite": true },
    },
    write: {
      "pipeline": { "raw": true, "summary": true, "rewrite": false },
      "crew": { "raw": true, "summary": true, "rewrite": true },
      "mesh": { "raw": true, "summary": false, "rewrite": false },
      "route": { "raw": true, "summary": false, "rewrite": false },
      "analytics": { "raw": true, "summary": true, "rewrite": false },
      "audit": { "raw": false, "summary": false, "rewrite": false },
      "config": { "raw": true, "summary": false, "rewrite": true },
    },
  },
  "enterprise": {
    read: {
      "pipeline": { "raw": true, "summary": true, "rewrite": true },
      "crew": { "raw": true, "summary": true, "rewrite": true },
      "mesh": { "raw": true, "summary": true, "rewrite": true },
      "route": { "raw": true, "summary": true, "rewrite": true },
      "analytics": { "raw": true, "summary": true, "rewrite": true },
      "audit": { "raw": true, "summary": true, "rewrite": true },
      "config": { "raw": true, "summary": true, "rewrite": true },
    },
    write: {
      "pipeline": { "raw": true, "summary": true, "rewrite": true },
      "crew": { "raw": true, "summary": true, "rewrite": true },
      "mesh": { "raw": true, "summary": true, "rewrite": true },
      "route": { "raw": true, "summary": true, "rewrite": true },
      "analytics": { "raw": true, "summary": true, "rewrite": true },
      "audit": { "raw": true, "summary": true, "rewrite": true },
      "config": { "raw": true, "summary": true, "rewrite": true },
    },
  },
};
