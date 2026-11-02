import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { call, doc, makeDesign, makeEnv, newId, save, sha, signIn } from "./helpers";

describe("designs and versions", () => {
  it("saves, reads back, and keeps content encrypted at rest", async () => {
    const h = makeEnv();
    const s = await signIn(h);
    const id = await makeDesign(h, s);
    const body = doc({ layers: [{ text: "SECRET-HEADLINE-12345" }] });
    const r = await save(h, s, id, 0, body);
    expect(r.status).toBe(201); expect(r.json.version).toBe(1);

    const got = await call(h, "GET", `/v1/designs/${id}/content`, { token: s.token });
    expect(Buffer.from(got.bytes)).toEqual(Buffer.from(body as Uint8Array));
    expect(JSON.parse(gunzipSync(got.bytes).toString()).layers[0].text).toBe("SECRET-HEADLINE-12345");
    expect(got.headers.get("x-content-type-options")).toBe("nosniff");
    expect(got.headers.get("content-disposition")).toContain("attachment");

    // R2 holds ciphertext only: neither the gzip bytes nor the words appear in it.
    const keys = [...h.r2.store.keys()].filter((k) => k.startsWith("v/"));
    expect(keys).toHaveLength(1);
    const stored = Buffer.from(h.r2.store.get(keys[0]!)!.data);
    expect(stored.includes(Buffer.from((body as Uint8Array).subarray(0, 12)))).toBe(false);
    expect(stored.length).toBe(body.length + 28);
    // D1 holds the key and hash, never the content.
    const v = h.db.raw.prepare("SELECT * FROM design_versions").get() as any;
    expect(v.r2_key).toBe(keys[0]); expect(v.content_hash).toBe(sha(body)); expect(v.byte_size).toBe(body.length + 28);
    // The key name is server-made.
    expect(keys[0]).toMatch(/^v\/[0-9a-f-]{36}\/1-[a-z2-7]{26}$/);
  });

  it("uses a fresh nonce per blob and wraps each design's key separately", async () => {
    const h = makeEnv();
    const s = await signIn(h);
    const a = await makeDesign(h, s), b = await makeDesign(h, s);
    const same = doc({ same: true });
    await save(h, s, a, 0, same); await save(h, s, b, 0, same); await save(h, s, a, 1, same);
    const blobs = [...h.r2.store.entries()].filter(([k]) => k.startsWith("v/")).map(([, o]) => Buffer.from(o.data).toString("hex"));
    expect(new Set(blobs).size).toBe(3);
    const deks = (h.db.raw.prepare("SELECT wrapped_dek FROM designs").all() as any[]).map((r) => Buffer.from(r.wrapped_dek).toString("hex"));
    expect(new Set(deks).size).toBe(2);
  });

  it("returns 409 with the current version on a stale base, and leaves no orphan row", async () => {
    const h = makeEnv();
    const s = await signIn(h);
    const id = await makeDesign(h, s);
    await save(h, s, id, 0);
    const stale = await save(h, s, id, 0, doc({ other: 1 }));
    expect(stale.status).toBe(409);
    expect(stale.json.error.current_version).toBe(1);
    expect((h.db.raw.prepare("SELECT COUNT(*) n FROM design_versions").get() as any).n).toBe(1);
  });

  it("the D1 batch never inserts a version row if the pointer did not move", async () => {
    const h = makeEnv();
    const s = await signIn(h);
    const id = await makeDesign(h, s);
    // Simulate a racing writer: the pointer moves after the early check but before the batch.
    const realPrepare = h.db.prepare.bind(h.db);
    let raced = false;
    h.db.prepare = ((sql: string) => {
      if (!raced && sql.startsWith("UPDATE designs SET current_version")) { raced = true; h.db.raw.exec(`UPDATE designs SET current_version = 5 WHERE id = '${id}'`); }
      return realPrepare(sql);
    }) as never;
    const r = await save(h, s, id, 0);
    expect(r.status).toBe(409);
    expect((h.db.raw.prepare("SELECT COUNT(*) n FROM design_versions").get() as any).n).toBe(0);
    expect([...h.r2.store.keys()].filter((k) => k.startsWith("v/"))).toHaveLength(0);
  });

  it("checks the hash, the gzip header, and the declared size", async () => {
    const h = makeEnv({ MAX_VERSION_BYTES: "4096" } as never);
    const s = await signIn(h);
    const id = await makeDesign(h, s);
    expect((await save(h, s, id, 0, doc(), { "x-content-hash": "0".repeat(64) })).json.error.code).toBe("hash_mismatch");
    const notGzip = new TextEncoder().encode("{\"layers\":[]} not gzip at all");
    expect((await save(h, s, id, 0, notGzip)).json.error.code).toBe("bad_document");
    const big = doc({ x: Array.from({ length: 5000 }, (_, i) => `${i}-${Math.random()}`) });
    expect(big.length).toBeGreaterThan(4096);
    expect((await save(h, s, id, 0, big)).status).toBe(413);
    expect((await call(h, "POST", `/v1/designs/${id}/versions`, { token: s.token, body: doc(), headers: { "x-content-hash": "zz" } })).json.error.code).toBe("bad_headers");
  });

  it("rate limits saves to 12 per minute per design", async () => {
    const h = makeEnv();
    const s = await signIn(h);
    const id = await makeDesign(h, s);
    for (let i = 0; i < 12; i++) expect((await save(h, s, id, i, doc({ i }))).status).toBe(201);
    expect((await save(h, s, id, 12, doc({ i: 12 }))).status).toBe(429);
  });

  it("replays the stored answer for a repeated Idempotency-Key", async () => {
    const h = makeEnv();
    const s = await signIn(h);
    const id = await makeDesign(h, s);
    const bytes = doc({ a: 1 });
    const first = await save(h, s, id, 0, bytes, { "idempotency-key": "retry-key-0001" });
    const again = await save(h, s, id, 0, bytes, { "idempotency-key": "retry-key-0001" });
    expect(first.status).toBe(201); expect(again.status).toBe(201); expect(again.json).toEqual(first.json);
    expect((h.db.raw.prepare("SELECT COUNT(*) n FROM design_versions").get() as any).n).toBe(1);
  });

  it("validates ids and bodies", async () => {
    const h = makeEnv();
    const s = await signIn(h);
    const bad = await call(h, "POST", "/v1/designs", { token: s.token, json: { id: "not-a-uuid", title: "x", mode: "creative", width_px: 10, height_px: 10 } });
    expect(bad.status).toBe(400); expect(bad.json.error.fields).toContain("id");
    const id = newId();
    const ok = { id, title: "x", mode: "creative", width_px: 10, height_px: 10 };
    expect((await call(h, "POST", "/v1/designs", { token: s.token, json: ok })).status).toBe(201);
    expect((await call(h, "POST", "/v1/designs", { token: s.token, json: ok })).json.error.code).toBe("id_taken");
  });
});

describe("authorization", () => {
  it("answers 404 for someone else's design, for every route that takes an id", async () => {
    const h = makeEnv();
    const owner = await signIn(h), other = await signIn(h);
    const id = await makeDesign(h, owner);
    await save(h, owner, id, 0);
    const missing = newId();
    for (const [m, p, extra] of [
      ["GET", `/v1/designs/${id}`], ["PATCH", `/v1/designs/${id}`, { json: { title: "x" } }], ["GET", `/v1/designs/${id}/content`],
      ["GET", `/v1/designs/${id}/versions`], ["POST", `/v1/designs/${id}/trash`], ["POST", `/v1/designs/${id}/restore`], ["DELETE", `/v1/designs/${id}`],
      ["GET", `/v1/designs/${id}/thumbnail`], ["GET", `/v1/designs/${id}/shares`], ["POST", `/v1/designs/${id}/shares`, { json: { kind: "link", permission: "view" } }],
    ] as [string, string, any?][]) {
      const theirs = await call(h, m, p, { token: other.token, ...(extra ?? {}) });
      const nothing = await call(h, m, p.replace(id, missing), { token: other.token, ...(extra ?? {}) });
      expect([m, p, theirs.status, theirs.json?.error?.code]).toEqual([m, p, 404, "not_found"]);
      expect(nothing.status).toBe(404);
    }
    expect((await save(h, other, id, 1)).status).toBe(404);
    expect((await call(h, "GET", "/v1/designs", { token: other.token })).json.designs).toHaveLength(0);
  });
});

describe("trash", () => {
  it("trashes, restores, blocks saves while trashed, and deletes forever only from the trash", async () => {
    const h = makeEnv();
    const s = await signIn(h);
    const id = await makeDesign(h, s);
    await save(h, s, id, 0);
    expect((await call(h, "DELETE", `/v1/designs/${id}`, { token: s.token })).json.error.code).toBe("not_in_trash");
    expect((await call(h, "POST", `/v1/designs/${id}/trash`, { token: s.token })).status).toBe(200);
    expect((await call(h, "GET", "/v1/designs", { token: s.token })).json.designs).toHaveLength(0);
    expect((await call(h, "GET", "/v1/designs?trashed=1", { token: s.token })).json.designs).toHaveLength(1);
    expect((await save(h, s, id, 1)).status).toBe(404);
    expect((await call(h, "POST", `/v1/designs/${id}/restore`, { token: s.token })).status).toBe(200);
    expect((await save(h, s, id, 1)).status).toBe(201);
    await call(h, "POST", `/v1/designs/${id}/trash`, { token: s.token });
    expect((await call(h, "DELETE", `/v1/designs/${id}`, { token: s.token })).status).toBe(204);
    expect([...h.r2.store.keys()].filter((k) => k.startsWith("v/"))).toHaveLength(0);
    expect((h.db.raw.prepare("SELECT COUNT(*) n FROM designs").get() as any).n).toBe(0);
  });
});

describe("thumbnails", () => {
  it("accepts a PNG and nothing else", async () => {
    const h = makeEnv();
    const s = await signIn(h);
    const id = await makeDesign(h, s);
    const { png } = await import("./helpers");
    expect((await call(h, "PUT", `/v1/designs/${id}/thumbnail`, { token: s.token, body: png(), headers: { "content-type": "image/png" } })).status).toBe(204);
    const got = await call(h, "GET", `/v1/designs/${id}/thumbnail`, { token: s.token });
    expect(got.headers.get("content-type")).toBe("image/png");
    expect((await call(h, "PUT", `/v1/designs/${id}/thumbnail`, { token: s.token, body: "<svg onload=alert(1)>", headers: { "content-type": "image/png" } })).status).toBe(400);
  });
});
