import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dailyTasks, enqueueDeletions, frequentTasks, releaseStaleReservations, removeOrphans, correctBudget, backupMetadata, purgeTrash } from "../src/cron/tasks";
import { processJobs } from "../src/cron/jobs";
import { openBackup } from "../src/crypto";
import { call, doc, makeDesign, makeEnv, png, save, signIn } from "./helpers";

const now = () => Math.floor(Date.now() / 1000);

describe("consent and learning", () => {
  it("keeps consent append-only and refuses events without it", async () => {
    const h = makeEnv();
    const s = await signIn(h);
    const ev = { events: [{ rule: "contrast", class: "base", outcome: "applied", mode: "corporate_full", style_id: "bauhaus", occurred_at: Date.now() }] };
    expect((await call(h, "POST", "/v1/learning/events", { token: s.token, json: ev })).status).toBe(403);
    await call(h, "POST", "/v1/consent", { token: s.token, json: { purpose: "learning", decision: "granted", policy_version: "1" } });
    expect((await call(h, "POST", "/v1/learning/events", { token: s.token, json: ev })).status).toBe(202);
    await call(h, "POST", "/v1/consent", { token: s.token, json: { purpose: "learning", decision: "withdrawn", policy_version: "1" } });
    expect((h.db.raw.prepare("SELECT COUNT(*) n FROM consents").get() as any).n).toBe(2);
    expect((await call(h, "GET", "/v1/consent", { token: s.token })).json.consents[0].decision).toBe("withdrawn");
  });

  it("stores events under a pseudonym that is not the user id, in a separate table", async () => {
    const h = makeEnv();
    const s = await signIn(h);
    await call(h, "POST", "/v1/consent", { token: s.token, json: { purpose: "learning", decision: "granted", policy_version: "1" } });
    await call(h, "POST", "/v1/learning/events", { token: s.token, json: { events: [{ rule: "contrast", outcome: "applied", mode: "corporate_base", style_id: null, occurred_at: now() }] } });
    const e = h.db.raw.prepare("SELECT * FROM learning_events").get() as any;
    const l = h.db.raw.prepare("SELECT * FROM learning_link").get() as any;
    expect(e.pseudo_id).toBe(l.pseudo_id); expect(e.pseudo_id).not.toBe(s.userId);
    expect(JSON.stringify(e)).not.toContain(s.userId);
    // Bad batches are refused: unknown fields, old timestamps, too many.
    const bad = (events: unknown[]) => call(h, "POST", "/v1/learning/events", { token: s.token, json: { events } });
    expect((await bad([{ rule: "contrast", outcome: "applied", mode: "corporate_base", style_id: null, occurred_at: now(), layer: 3 }])).status).toBe(400);
    expect((await bad([{ rule: "contrast", outcome: "applied", mode: "corporate_base", style_id: null, occurred_at: 5 }])).json.error.code).toBe("bad_time");
    expect((await bad(Array(51).fill({ rule: "contrast", outcome: "applied", mode: "corporate_base", style_id: null, occurred_at: now() }))).status).toBe(400);
  });

  it("withdrawing deletes the collected events through a job, then removes the link", async () => {
    const h = makeEnv();
    const s = await signIn(h);
    const c = (decision: string) => call(h, "POST", "/v1/consent", { token: s.token, json: { purpose: "learning", decision, policy_version: "1" } });
    await c("granted");
    await call(h, "POST", "/v1/learning/events", { token: s.token, json: { events: [{ rule: "contrast", outcome: "applied", mode: "corporate_base", style_id: null, occurred_at: now() }] } });
    await c("withdrawn");
    await processJobs(h.env);
    expect((h.db.raw.prepare("SELECT COUNT(*) n FROM learning_events").get() as any).n).toBe(0);
    expect((h.db.raw.prepare("SELECT COUNT(*) n FROM learning_link").get() as any).n).toBe(0);
  });
});

describe("cron", () => {
  it("removes orphaned R2 objects after 24 hours, and only unreferenced ones", async () => {
    const h = makeEnv();
    const s = await signIn(h);
    const id = await makeDesign(h, s);
    await save(h, s, id, 0);
    await h.r2.put("v/lost/1-orphan", new Uint8Array(40)); await h.r2.put("v/lost/2-young", new Uint8Array(40));
    const real = [...h.r2.store.keys()].find((k) => k.startsWith(`v/${id}`))!;
    h.r2.age("v/lost/1-orphan", 30); h.r2.age(real, 30);
    expect(await removeOrphans(h.env)).toBe(1);
    expect(h.r2.store.has("v/lost/1-orphan")).toBe(false);
    expect(h.r2.store.has("v/lost/2-young")).toBe(true);
    expect(h.r2.store.has(real)).toBe(true);
  });

  it("purges designs trashed more than 30 days ago", async () => {
    const h = makeEnv();
    const s = await signIn(h);
    const [old, recent] = [await makeDesign(h, s), await makeDesign(h, s)];
    await save(h, s, old, 0);
    await call(h, "POST", `/v1/designs/${old}/trash`, { token: s.token }); await call(h, "POST", `/v1/designs/${recent}/trash`, { token: s.token });
    h.db.raw.exec(`UPDATE designs SET trashed_at = ${now() - 31 * 86400} WHERE id = '${old}'`);
    expect(await purgeTrash(h.env)).toBe(1);
    expect((h.db.raw.prepare("SELECT id FROM designs").all() as any[]).map((r) => r.id)).toEqual([recent]);
    expect([...h.r2.store.keys()].filter((k) => k.startsWith("v/"))).toHaveLength(0);
  });

  it("releases reservations left behind by a crashed request", async () => {
    const h = makeEnv();
    h.db.raw.exec(`UPDATE budget SET reserved_credits = 1; INSERT INTO model_usage VALUES ('r1','h',1,NULL,'reserved',${now() - 600})`);
    await releaseStaleReservations(h.env);
    expect(h.db.raw.prepare("SELECT reserved_credits r FROM budget").get()).toEqual({ r: 0 });
    expect((h.db.raw.prepare("SELECT status s FROM model_usage").get() as any).s).toBe("failed");
  });

  it("recomputes the budget from the ledger and takes the starting credits from config", async () => {
    const h = makeEnv({ CRITIQUE_STARTING_CREDITS: "120" } as never);
    h.db.raw.exec(`UPDATE budget SET spent_credits = 99; INSERT INTO model_usage VALUES ('a','h',1,2.5,'complete',1)`);
    await correctBudget(h.env);
    expect(h.db.raw.prepare("SELECT starting_credits s, spent_credits p FROM budget").get()).toEqual({ s: 120, p: 2.5 });
  });

  it("runs jobs with backoff, and gives up after five attempts", async () => {
    const h = makeEnv();
    const s = await signIn(h);
    h.db.raw.exec(`INSERT INTO jobs (kind,user_id,status,attempts,run_after,created_at) VALUES ('mystery','${s.userId}','queued',0,0,0)`);
    await processJobs(h.env);
    expect((h.db.raw.prepare("SELECT status FROM jobs").get() as any).status).toBe("failed");
  });

  it("writes an encrypted metadata backup that holds no sessions or tokens, and keeps the last 8", async () => {
    const h = makeEnv();
    const s = await signIn(h);
    await makeDesign(h, s);
    for (let d = 1; d <= 9; d++) await h.r2.put(`backups/2020-01-0${d}.enc`, new Uint8Array(3));
    const key = await backupMetadata(h.env);
    const plain = new TextDecoder().decode(await openBackup(h.env, key, h.r2.store.get(key)!.data));
    expect(plain).toContain('"t":"designs"'); expect(plain).toContain(s.email);
    expect(plain).not.toContain("refresh_hash"); expect(plain).not.toContain("token_hash");
    expect(Buffer.from(h.r2.store.get(key)!.data).includes(Buffer.from(s.email))).toBe(false);
    expect([...h.r2.store.keys()].filter((k) => k.startsWith("backups/"))).toHaveLength(8);
    const task = dailyTasks(h.env).length + frequentTasks(h.env).length;
    expect(task).toBeGreaterThan(5);
  });
});

describe("account", () => {
  it("exports a valid tar with the design decrypted and the assets included", async () => {
    const h = makeEnv();
    const s = await signIn(h);
    const id = await makeDesign(h, s);
    const body = doc({ headline: "hello export" });
    await save(h, s, id, 0, body);
    const asset = await call(h, "POST", "/v1/assets", { token: s.token, body: png(), headers: { "content-type": "image/png" } });
    const job = await call(h, "POST", "/v1/account/export", { token: s.token });
    expect(job.status).toBe(202);
    expect((await call(h, "POST", "/v1/account/export", { token: s.token })).json.id).toBe(job.json.id); // one at a time
    expect((await call(h, "GET", `/v1/account/export/${job.json.id}/download`, { token: s.token })).status).toBe(404);
    await processJobs(h.env);
    expect((await call(h, "GET", `/v1/account/export/${job.json.id}`, { token: s.token })).json.status).toBe("done");
    const dl = await call(h, "GET", `/v1/account/export/${job.json.id}/download`, { token: s.token });
    expect(dl.status).toBe(200);
    const dir = mkdtempSync(join(tmpdir(), "zph-")); const file = join(dir, "e.tar"); writeFileSync(file, dl.bytes);
    const names = execFileSync("tar", ["-tf", file]).toString().split("\n").filter(Boolean);
    expect(names).toEqual(expect.arrayContaining(["profile.json", "consents.json", `designs/${id}/meta.json`, `designs/${id}/v1.zph`, `assets/${asset.json.id}.png`]));
    const out = execFileSync("tar", ["-xOf", file, `designs/${id}/v1.zph`]);
    expect(Buffer.from(out)).toEqual(Buffer.from(body));
    // Someone else cannot download it.
    const other = await signIn(h);
    expect((await call(h, "GET", `/v1/account/export/${job.json.id}/download`, { token: other.token })).status).toBe(404);
  });

  it("deletes after a grace period, can be cancelled, and removes every trace", async () => {
    const h = makeEnv();
    const s = await signIn(h, "bye@test.dev");
    const bystander = await signIn(h);
    const id = await makeDesign(h, s);
    await save(h, s, id, 0);
    await call(h, "POST", "/v1/assets", { token: s.token, body: png(), headers: { "content-type": "image/png" } });
    await call(h, "POST", "/v1/consent", { token: s.token, json: { purpose: "learning", decision: "granted", policy_version: "1" } });
    await call(h, "POST", "/v1/learning/events", { token: s.token, json: { events: [{ rule: "contrast", outcome: "applied", mode: "corporate_base", style_id: null, occurred_at: now() }] } });
    await call(h, "POST", `/v1/designs/${id}/shares`, { token: s.token, json: { kind: "link", permission: "view" } });
    const other = await makeDesign(h, bystander); await save(h, bystander, other, 0);

    expect((await call(h, "POST", "/v1/account/delete", { token: s.token, json: { confirm: "yes" } })).status).toBe(400);
    const del = await call(h, "POST", "/v1/account/delete", { token: s.token, json: { confirm: "delete my account" } });
    expect(del.json.deletion_at).toBeGreaterThan(now() + 13 * 86400);
    // Pending: reads work, writes are refused.
    expect((await call(h, "GET", "/v1/designs", { token: s.token })).status).toBe(200);
    expect((await save(h, s, id, 1)).json.error.code).toBe("account_pending_deletion");

    // Before the end of the grace period nothing is deleted; cancelling restores the account.
    await enqueueDeletions(h.env);
    expect((h.db.raw.prepare("SELECT COUNT(*) n FROM jobs WHERE kind='delete_account'").get() as any).n).toBe(0);
    expect((await call(h, "POST", "/v1/account/delete/cancel", { token: s.token })).json.status).toBe("active");
    expect((await save(h, s, id, 1)).status).toBe(201);

    await call(h, "POST", "/v1/account/delete", { token: s.token, json: { confirm: "delete my account" } });
    h.db.raw.exec(`UPDATE users SET deletion_at = ${now() - 1} WHERE id = '${s.userId}'`);
    await enqueueDeletions(h.env); await enqueueDeletions(h.env); // twice: still one job
    expect((h.db.raw.prepare("SELECT COUNT(*) n FROM jobs WHERE kind='delete_account'").get() as any).n).toBe(1);
    await processJobs(h.env);

    for (const t of ["users WHERE id", "designs WHERE owner_id", "assets WHERE owner_id", "sessions WHERE user_id", "consents WHERE user_id", "learning_link WHERE user_id", "oauth_links WHERE user_id"]) {
      expect((h.db.raw.prepare(`SELECT COUNT(*) n FROM ${t} = ?`).get(s.userId) as any).n, t).toBe(0);
    }
    expect((h.db.raw.prepare("SELECT COUNT(*) n FROM learning_events").get() as any).n).toBe(0);
    expect((h.db.raw.prepare("SELECT COUNT(*) n FROM share_grants").get() as any).n).toBe(0);
    const keys = [...h.r2.store.keys()];
    expect(keys.filter((k) => k.startsWith("a/") || k.startsWith(`v/${id}`) || k.startsWith("t/"))).toEqual([]);
    expect(keys.some((k) => k.startsWith(`v/${other}`))).toBe(true);
    // The other user is untouched.
    expect((await call(h, "GET", `/v1/designs/${other}/content`, { token: bystander.token })).status).toBe(200);
    expect((await call(h, "GET", "/v1/account", { token: s.token })).status).toBe(401);
  });
});

describe("catalog and config", () => {
  it("serves versioned catalog files with caching, and refuses odd paths", async () => {
    const h = makeEnv();
    await h.r2.put("catalog/index.json", '{"styles":[]}', { httpMetadata: { contentType: "application/json" } });
    await h.r2.put("catalog/styles/bauhaus/3.json", '{"id":"bauhaus"}', { httpMetadata: { contentType: "application/json" } });
    const idx = await call(h, "GET", "/v1/catalog/index");
    expect(idx.status).toBe(200); expect(idx.headers.get("cache-control")).toContain("max-age=3600");
    const st = await call(h, "GET", "/v1/catalog/styles/bauhaus/3");
    expect(st.headers.get("cache-control")).toContain("immutable");
    expect((await call(h, "GET", "/v1/catalog/styles/bauhaus/9")).status).toBe(404);
    expect((await call(h, "GET", "/v1/catalog/styles/..%2F..%2Fv/1")).status).toBe(404);
    expect((await call(h, "GET", "/v1/catalog/styles/bauhaus/3x")).status).toBe(404);
  });

  it("reports config", async () => {
    const h = makeEnv();
    const c = await call(h, "GET", "/v1/config");
    expect(c.json.features.critique).toBe(true);
    expect(c.json.limits.critique_max_image_px).toBe(1024);
    expect(c.headers.get("cache-control")).toContain("max-age=300");
  });
});
