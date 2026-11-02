#!/usr/bin/env node
// Turns style profile sources into the versioned catalog files served by /v1/catalog/*.
//
//   node scripts/build-catalog.mjs styles/bauhaus.json [styles/other.json ...]  --out catalog-dist
//
// For each profile it writes catalog-dist/catalog/styles/<id>/<version>.json with content_hash filled in, and rebuilds
// catalog-dist/catalog/index.json. Upload the folder to R2 with:
//   for f in $(cd catalog-dist && find catalog -type f); do wrangler r2 object put zenopher/$f --file catalog-dist/$f --content-type application/json; done
//
// The hash covers the profile as canonical JSON (keys sorted, no whitespace) without content_hash. The teacher engine
// recomputes it the same way before it uses a profile, so any edit after this step makes the profile unusable.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const out = outIdx >= 0 ? args.splice(outIdx, 2)[1] : "catalog-dist";
if (!args.length) { console.error("usage: build-catalog.mjs <profile.json>... [--out dir]"); process.exit(1); }

const canonical = (v) => Array.isArray(v) ? v.map(canonical) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])])) : v;
const ALLOWED_LICENCES = ["CC0-1.0", "CC-BY-4.0", "CC-BY-SA-4.0", "PDM-1.0"];
const index = [];

for (const file of args) {
  const p = JSON.parse(readFileSync(file, "utf8"));
  delete p.content_hash;
  for (const ex of p.examples ?? []) if (!ALLOWED_LICENCES.includes(ex.license) || !ex.attribution) throw new Error(`${file}: example ${ex.image} needs an allowed licence and attribution`);
  const hash = createHash("sha256").update(JSON.stringify(canonical(p))).digest("hex");
  const final = canonical({ ...p, content_hash: `sha256:${hash}` });
  const path = join(out, "catalog", "styles", p.id, `${p.version}.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(final));
  index.push({ id: p.id, version: p.version, name: p.name, summary: p.summary, families: p.families, uses: p.uses, status: p.status, content_hash: final.content_hash });
  console.log(`${p.id}@${p.version} ${final.content_hash}`);
}
mkdirSync(join(out, "catalog"), { recursive: true });
writeFileSync(join(out, "catalog", "index.json"), JSON.stringify({ generated_at: new Date().toISOString(), styles: index }));
