import { readFile, readdir, mkdir, rm, writeFile, chmod } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';

const backendDir = fileURLToPath(new URL('..', import.meta.url));
const sourcePath = path.join(backendDir, 'src/index.ts');
const buildDir = path.join(backendDir, '.wrangler/local-build');
const stateDir = path.resolve(process.env.WRANGLER_STATE_DIR || path.join(backendDir, '.wrangler/local-state'));
const portArgIndex = process.argv.findIndex((arg) => arg === '--port');
const portFromArgs = portArgIndex >= 0 ? process.argv[portArgIndex + 1] : undefined;
const port = Number(process.env.BACKEND_PORT || process.env.PORT || portFromArgs || 8787);
const migrateOnly = process.argv.includes('--migrate-only');
const host = process.env.BACKEND_HOST || '127.0.0.1';

const explicitEnvKeys = new Set(Object.keys(process.env));
for (const envFile of ['.env', '.env.local']) {
  try {
    const text = await readFile(path.join(backendDir, envFile), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (!match || explicitEnvKeys.has(match[1])) continue;
      const raw = match[2];
      process.env[match[1]] = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
    }
  } catch {
    // Optional local env files.
  }
}

await mkdir(buildDir, { recursive: true });
await mkdir(stateDir, { recursive: true });

let localKey = process.env.ZPH_MASTER_KEY && process.env.ZPH_MASTER_KEY !== 'REPLACE_WITH_BASE64_32_BYTE_KEY'
  ? process.env.ZPH_MASTER_KEY
  : null;
if (!localKey) {
  const keyPath = path.join(stateDir, 'master-key');
  try {
    localKey = (await readFile(keyPath, 'utf8')).trim();
  } catch {
    localKey = randomBytes(32).toString('base64');
    await writeFile(keyPath, `${localKey}\n`, { mode: 0o600 });
    await chmod(keyPath, 0o600);
  }
}

const bundlePath = path.join(buildDir, 'worker.mjs');
await build({
  entryPoints: [sourcePath],
  outfile: bundlePath,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  sourcemap: 'inline',
  logLevel: 'warning',
});

const mf = new Miniflare(convertV4MiniflareOptions({
  modules: true,
  scriptPath: bundlePath,
  name: 'zenopher-api-local',
  host,
  port: migrateOnly ? 0 : port,
  compatibilityDate: '2025-01-01',
  d1Databases: { DB: 'zenopher-local' },
  r2Buckets: { BUCKET: 'zenopher-local' },
  bindings: {
    APP_ORIGIN: process.env.APP_ORIGIN || 'http://localhost:3000',
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || process.env.APP_ORIGIN || 'http://localhost:3000',
    ZPH_MASTER_KEY: localKey,
    EMAIL_API_URL: process.env.EMAIL_API_URL || '',
    EMAIL_API_KEY: process.env.EMAIL_API_KEY || '',
    EMAIL_FROM: process.env.EMAIL_FROM || 'Zenopher <login@localhost>',
    LOCAL_AUTH_ENABLED: process.env.LOCAL_AUTH_ENABLED || 'true',
    LOCAL_DEMO_CRITIQUE: process.env.LOCAL_DEMO_CRITIQUE || 'true',
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
    TURNSTILE_REQUIRED: process.env.TURNSTILE_REQUIRED || 'false',
    TURNSTILE_SECRET: process.env.TURNSTILE_SECRET || '',
    CRITIQUE_ENABLED: process.env.CRITIQUE_ENABLED || 'false',
    CRITIQUE_STARTING_CREDITS: process.env.CRITIQUE_STARTING_CREDITS || '150',
    CRITIQUE_RESERVE_CREDITS: process.env.CRITIQUE_RESERVE_CREDITS || '10',
    CRITIQUE_COST_PER_REVIEW: process.env.CRITIQUE_COST_PER_REVIEW || '1',
    CRITIQUE_DAILY_LIMIT: process.env.CRITIQUE_DAILY_LIMIT || '2',
    MUSE_API_URL: process.env.MUSE_API_URL || '',
    MUSE_API_KEY: process.env.MUSE_API_KEY || '',
    MUSE_MODEL: process.env.MUSE_MODEL || '',
    MUSE_ACCEPTS_IMAGES: process.env.MUSE_ACCEPTS_IMAGES || 'false',
    R2_HARD_LIMIT_BYTES: process.env.R2_HARD_LIMIT_BYTES || String(8 * 1024 * 1024 * 1024),
    R2_RESERVED_BYTES: process.env.R2_RESERVED_BYTES || '0',
    MAX_ASSET_BYTES: process.env.MAX_ASSET_BYTES || String(10 * 1024 * 1024),
    MAX_VERSION_BYTES: process.env.MAX_VERSION_BYTES || String(25 * 1024 * 1024),
    DELETION_GRACE_DAYS: process.env.DELETION_GRACE_DAYS || '14',
  },
  resourcePersistencePath: stateDir,
  telemetry: { enabled: false },
  logRequests: false,
}));

async function applyMigrations() {
  const db = await mf.getD1Database('DB');
  await db.exec('CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, applied_at TEXT NOT NULL);');

  const files = (await readdir(path.join(backendDir, 'migrations')))
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort();
  for (const file of files) {
    const id = Number(file.slice(0, 4));
    const applied = await db.prepare('SELECT id FROM d1_migrations WHERE id = ?1').bind(id).first();
    if (applied) continue;
    const sql = (await readFile(path.join(backendDir, 'migrations', file), 'utf8'))
      .replace(/^\s*--.*$/gm, '')
      .trim();
    for (const statement of sql.split(';').map((part) => part.trim()).filter(Boolean)) {
      await db.prepare(`${statement};`).run();
    }
    await db.prepare('INSERT INTO d1_migrations (id, name, applied_at) VALUES (?1, ?2, ?3)')
      .bind(id, file, new Date().toISOString())
      .run();
    console.log(`Applied local migration ${file}`);
  }
}

const canonical = (value) => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
    : value;

async function seedLocalCatalog() {
  const bucket = await mf.getR2Bucket('BUCKET');
  if (await bucket.head('catalog/index.json')) return;
  const patterns = {
    'colour.families': { target: [1, 3], tolerance: 1, weight: 0.2 },
    'colour.dominant_share': { target: [0.4, 0.8], tolerance: 0.2, weight: 0.2 },
    'colour.neutral_share': { target: [0.15, 0.5], tolerance: 0.15, weight: 0.1 },
    'colour.accent_share': { target: [0.0, 0.2], tolerance: 0.1, weight: 0.2 },
    'shape.geometric_share': { target: [0.7, 1.0], tolerance: 0.2, weight: 0.15 },
    'grid.edge_share': { target: [0.7, 1.0], tolerance: 0.2, weight: 0.15 },
  };
  const styleSpecs = [
    ['bauhaus', 'Bauhaus', 'Geometric forms, a strict grid, a few hues, and large colour blocks.', ['geometric', 'print'], ['poster', 'social']],
    ['swiss-modern', 'Swiss Modernism', 'Asymmetric layouts, mathematical grids, and objective hierarchy.', ['grid', 'typographic'], ['editorial', 'identity']],
    ['editorial-luxe', 'Editorial Luxe', 'Refined hierarchy, expansive whitespace, and quiet luxury.', ['editorial', 'typographic'], ['editorial', 'print']],
    ['cyber-brutalist', 'Brutalist Grid', 'Raw high-density structure with stark mono typography.', ['geometric', 'digital'], ['social', 'poster']],
    ['neo-corporate', 'Neo-Corporate', 'Clean executive clarity, measured rhythm, and enterprise-grade structure.', ['corporate', 'grid'], ['identity', 'presentation']],
  ];
  const styles = [];
  for (const [id, name, summary, families, uses] of styleSpecs) {
    const profile = {
      id, version: 3, name, summary, families, uses,
      principles: ['Use a deliberate visual hierarchy.', 'Keep spacing and alignment consistent.'],
      examples: [{ image: `${id}/example-1.webp`, source_url: 'https://example.org/source', license: 'CC-BY-4.0', attribution: 'Author, Title, Year' }],
      patterns,
      professional: { 'balance.asymmetry': { target: [0.1, 0.5], tolerance: 0.15, weight: 0.5 } },
      overrides: { 'spacing.cv_threshold': 0.12 },
      status: 'published',
    };
    const hashInput = JSON.stringify(canonical(profile));
    const finalProfile = { ...profile, content_hash: `sha256:${createHash('sha256').update(hashInput).digest('hex')}` };
    await bucket.put(`catalog/styles/${id}/3.json`, JSON.stringify(canonical(finalProfile)), { httpMetadata: { contentType: 'application/json' } });
    styles.push({ id, version: 3, name, summary, families, uses, status: 'published', content_hash: finalProfile.content_hash });
  }
  await bucket.put('catalog/index.json', JSON.stringify({ generated_at: new Date().toISOString(), styles }), { httpMetadata: { contentType: 'application/json' } });
  console.log(`Seeded local catalog (${styles.length} styles)`);
}

await mf.ready;
await applyMigrations();
await seedLocalCatalog();
if (migrateOnly) {
  await mf.dispose();
  await rm(buildDir, { recursive: true, force: true });
  console.log('Local D1 migrations and catalog are ready.');
  process.exit(0);
}
const url = await mf.ready;
console.log(`Zenopher backend: ${url.origin}`);
console.log('Local D1 and R2 state:', stateDir);
console.log('Press Ctrl+C to stop.');

const shutdown = async () => {
  await mf.dispose();
  await rm(buildDir, { recursive: true, force: true });
  process.exit(0);
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
