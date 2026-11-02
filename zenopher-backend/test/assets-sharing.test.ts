import { describe, expect, it } from "vitest";
import { call, doc, makeDesign, makeEnv, png, save, signIn } from "./helpers";

const up = (h: any, s: any, body: Uint8Array | string, type: string) => call(h, "POST", "/v1/assets", { token: s.token, body, headers: { "content-type": type } });

describe("assets", () => {
  it("accepts allow-listed types whose bytes match, under server-made keys", async () => {
    const h = makeEnv();
    const s = await signIn(h);
    const r = await up(h, s, png(), "image/png");
    expect(r.status).toBe(201);
    expect([...h.r2.store.keys()]).toContain(`a/${r.json.id}`);
    const got = await call(h, "GET", `/v1/assets/${r.json.id}`, { token: s.token });
    expect(got.headers.get("content-type")).toBe("image/png");
    expect(got.headers.get("x-content-type-options")).toBe("nosniff");
    expect(got.headers.get("content-security-policy")).toBe("default-src 'none'");
    const gz = await up(h, s, doc(), "application/gzip");
    expect(gz.status).toBe(201);
    expect((await call(h, "GET", `/v1/assets/${gz.json.id}`, { token: s.token })).headers.get("content-disposition")).toContain("attachment");
  });

  it("rejects SVG, HTML, mismatched types and oversize uploads", async () => {
    const h = makeEnv({ MAX_ASSET_BYTES: "1000" } as never);
    const s = await signIn(h);
    expect((await up(h, s, "<svg xmlns='http://www.w3.org/2000/svg' onload='x()'/>", "image/svg+xml")).status).toBe(415);
    expect((await up(h, s, "<html><script>1</script></html>", "text/html")).status).toBe(415);
    expect((await up(h, s, "<svg onload=alert(1)>", "image/png")).json.error.code).toBe("type_mismatch");
    expect((await up(h, s, png(), "image/jpeg")).json.error.code).toBe("type_mismatch");
    expect((await up(h, s, png(10, 10, 2000), "image/png")).status).toBe(413);
    expect(h.r2.store.size).toBe(0);
  });

  it("is readable by its owner only", async () => {
    const h = makeEnv();
    const [a, b] = [await signIn(h), await signIn(h)];
    const r = await up(h, a, png(), "image/png");
    expect((await call(h, "GET", `/v1/assets/${r.json.id}`, { token: b.token })).status).toBe(404);
    expect((await call(h, "DELETE", `/v1/assets/${r.json.id}`, { token: b.token })).status).toBe(404);
    expect((await call(h, "DELETE", `/v1/assets/${r.json.id}`, { token: a.token })).status).toBe(204);
    expect(h.r2.store.size).toBe(0);
  });
});

describe("sharing", () => {
  it("link shares work with the token in a header, can expire, and can be revoked", async () => {
    const h = makeEnv();
    const s = await signIn(h);
    const id = await makeDesign(h, s);
    const body = doc({ hello: "world" });
    await save(h, s, id, 0, body);
    const share = await call(h, "POST", `/v1/designs/${id}/shares`, { token: s.token, json: { kind: "link", permission: "view" } });
    expect(share.status).toBe(201);
    expect(share.json.url).toContain("#"); // token is in the fragment, so no server or Referer sees it
    const t = share.json.token;
    const row = h.db.raw.prepare("SELECT token_hash FROM share_grants").get() as any;
    expect(row.token_hash).not.toBe(t);

    const meta = await call(h, "GET", "/v1/shared/design", { headers: { "x-share-token": t } });
    expect(meta.status).toBe(200); expect(meta.json.title).toBe("Poster");
    expect(meta.json.owner_id).toBeUndefined();
    const content = await call(h, "GET", "/v1/shared/content", { headers: { "x-share-token": t } });
    expect(Buffer.from(content.bytes)).toEqual(Buffer.from(body));

    expect((await call(h, "GET", "/v1/shared/design", { headers: { "x-share-token": "x".repeat(43) } })).status).toBe(404);
    // A link viewer can read the owner's assets, and only through the token.
    const asset = await up(h, s, png(), "image/png");
    expect((await call(h, "GET", `/v1/assets/${asset.json.id}`, { headers: { "x-share-token": t } })).status).toBe(200);

    // Trashing hides the share; revoking ends it.
    await call(h, "POST", `/v1/designs/${id}/trash`, { token: s.token });
    expect((await call(h, "GET", "/v1/shared/design", { headers: { "x-share-token": t } })).status).toBe(404);
    await call(h, "POST", `/v1/designs/${id}/restore`, { token: s.token });
    expect((await call(h, "GET", "/v1/shared/design", { headers: { "x-share-token": t } })).status).toBe(200);
    expect((await call(h, "DELETE", `/v1/designs/${id}/shares/${share.json.id}`, { token: s.token })).status).toBe(204);
    expect((await call(h, "GET", "/v1/shared/design", { headers: { "x-share-token": t } })).status).toBe(404);
    h.db.raw.exec("UPDATE share_grants SET revoked_at = NULL, expires_at = 1");
    expect((await call(h, "GET", "/v1/shared/design", { headers: { "x-share-token": t } })).status).toBe(404);
  });

  it("user grants give read access to the current version only, and creating one reveals nothing about who has an account", async () => {
    const h = makeEnv();
    const owner = await signIn(h), friend = await signIn(h, "friend@test.dev");
    const id = await makeDesign(h, owner);
    await save(h, owner, id, 0); await save(h, owner, id, 1, doc({ v: 2 }));
    const real = await call(h, "POST", `/v1/designs/${id}/shares`, { token: owner.token, json: { kind: "user", email: "friend@test.dev", permission: "view" } });
    const ghost = await call(h, "POST", `/v1/designs/${id}/shares`, { token: owner.token, json: { kind: "user", email: "nobody@test.dev", permission: "view" } });
    expect(real.status).toBe(202); expect(ghost.status).toBe(202); expect(real.json).toEqual(ghost.json);

    expect((await call(h, "GET", `/v1/designs/${id}`, { token: friend.token })).json.role).toBe("viewer");
    expect((await call(h, "GET", `/v1/designs/${id}/content`, { token: friend.token })).status).toBe(200);
    expect((await call(h, "GET", `/v1/designs/${id}/content?version=1`, { token: friend.token })).status).toBe(404);
    expect((await call(h, "GET", "/v1/designs/shared", { token: friend.token })).json.designs).toHaveLength(1);
    // A viewer cannot save, edit, trash, or share.
    expect((await save(h, friend, id, 2)).status).toBe(404);
    expect((await call(h, "PATCH", `/v1/designs/${id}`, { token: friend.token, json: { title: "mine" } })).status).toBe(404);
    expect((await call(h, "POST", `/v1/designs/${id}/shares`, { token: friend.token, json: { kind: "link", permission: "view" } })).status).toBe(404);
    const list = await call(h, "GET", `/v1/designs/${id}/shares`, { token: owner.token });
    expect(list.json.shares).toHaveLength(1);
  });
});
