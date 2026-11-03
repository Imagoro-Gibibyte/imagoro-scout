// Zips each catalog entry's folder into public/downloads/, so a download is always
// built from the reviewed source in skills/. Fixed timestamps keep the output reproducible.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(readFileSync(join(root, "catalog", "skills.json"), "utf8"));
const out = join(root, "public", "downloads");
mkdirSync(out, { recursive: true });

const mtime = new Date("2026-01-01T00:00:00Z");
for (const entry of catalog.entries) {
  const files = {};
  for (const name of entry.contents) {
    files[`${entry.id}/${name}`] = [readFileSync(join(root, "skills", entry.id, name)), { mtime }];
  }
  writeFileSync(join(out, `${entry.id}.zip`), zipSync(files, { level: 9 }));
}
