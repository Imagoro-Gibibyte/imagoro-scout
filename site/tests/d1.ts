import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

// Vite's resolver drops the node: prefix from a static import of this newer built-in.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
type DatabaseSync = InstanceType<typeof DatabaseSync>;

/** Just enough of D1, over real SQLite, to run the real statements from the real migrations. */
export function fakeD1(sqlite: DatabaseSync) {
  const prepare = (sql: string) => {
    let args: unknown[] = [];
    const statement = {
      bind(...values: unknown[]) {
        args = values;
        return statement;
      },
      all: async () => ({ results: sqlite.prepare(sql).all(...(args as [])) }),
      first: async () => sqlite.prepare(sql).get(...(args as [])) ?? null,
      run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...(args as [])).changes) } })
    };
    return statement;
  };
  return {
    prepare,
    batch: async (statements: { run(): Promise<unknown> }[]) => Promise.all(statements.map((s) => s.run()))
  } as unknown as D1Database;
}

const MIGRATIONS = join(import.meta.dirname, "../migrations");

/** A fresh in-memory database with every schema migration applied in order. Seed data is left out. */
export function freshDb(): { db: D1Database; sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync(MIGRATIONS).sort()) {
    if (file.endsWith(".sql") && !file.includes("_seed_")) sqlite.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
  }
  return { db: fakeD1(sqlite), sqlite };
}
