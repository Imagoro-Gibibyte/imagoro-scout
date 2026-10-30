import {
  ACL_MATRIX,
  BLACKBOARD_KINDS,
  CATEGORIES,
  ROLES,
  type BlackboardCategory,
  type BlackboardKind,
  type BlackboardKindACL,
  type Role,
  type RoleScope
} from "./acl-matrix.gen.js";

// L0.6: the matrix + closed enums are now single-sourced from server/acl-matrix.json
// via scripts/gen-client-acl.mjs — acl.ts only carries derived helpers + labels.

export type { BlackboardCategory, BlackboardKind, BlackboardKindACL, Role, RoleScope } from "./acl-matrix.gen.js";
export { ACL_MATRIX, BLACKBOARD_KINDS, CATEGORIES, ROLES } from "./acl-matrix.gen.js";

export const RC_ROLE = "role" as const;

export const ROLE_LABEL: Record<Role, string> = {
  personal: "Personal",
  business: "Business + Analytics",
  enterprise: "Enterprise + Audit"
};

export const DEFAULT_ROLE: Role = "business";

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function normalizeRole(value: unknown): Role {
  return isRole(value) ? value : DEFAULT_ROLE;
}

function lookup(
  table: Partial<Record<BlackboardCategory, BlackboardKindACL>>,
  category: string
): BlackboardKindACL | undefined {
  return (table as unknown as Record<string, BlackboardKindACL | undefined>)[category];
}

export function canRead(role: Role, category: string, kind: string): boolean {
  return lookup(ACL_MATRIX[role].read, category)?.[kind as BlackboardKind] ?? false;
}

export function canWrite(role: Role, category: string, kind: string): boolean {
  return lookup(ACL_MATRIX[role].write, category)?.[kind as BlackboardKind] ?? false;
}

export function readableCategories(role: Role): string[] {
  return CATEGORIES.filter((c) => {
    const acl = ACL_MATRIX[role].read[c];
    return acl ? BLACKBOARD_KINDS.some((k) => acl[k]) : false;
  });
}

export function writableKinds(role: Role, category: string): BlackboardKind[] {
  const acl = lookup(ACL_MATRIX[role].write, category);
  if (!acl) return [];
  return BLACKBOARD_KINDS.filter((k) => acl[k]);
}

/**
 * Drop blackboard categories a role may not read. `values` is a category->kv map
 * (shape of a blackboard snapshot); categories not readable are replaced with a
 * masked placeholder so callers never see the material.
 */
export function maskSnapshot(
  role: Role,
  values: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const readable = new Set(readableCategories(role));
  for (const [category, value] of Object.entries(values)) {
    out[category] = readable.has(category) ? value : { masked: true, reason: "acl:category" };
  }
  return out;
}

export function scopeFor(role: Role, category: string): { read: BlackboardKind[]; write: BlackboardKind[] } {
  const read = lookup(ACL_MATRIX[role].read, category);
  const write = lookup(ACL_MATRIX[role].write, category);
  return {
    read: read ? BLACKBOARD_KINDS.filter((k) => read[k]) : [],
    write: write ? BLACKBOARD_KINDS.filter((k) => write[k]) : []
  };
}