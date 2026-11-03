import { describe, expect, it } from "vitest";
import { deleteStoredObject, getStorageStatus, putStoredObject } from "../src/storage";
import { makeEnv } from "./helpers";

describe("R2 storage guard", () => {
  it("rejects writes at the hard limit and allows recovery by deleting", async () => {
    const h = makeEnv({ R2_HARD_LIMIT_BYTES: "100", R2_RESERVED_BYTES: "10" });

    await putStoredObject(h.env, "a/one", new Uint8Array(80));
    await expect(putStoredObject(h.env, "a/two", new Uint8Array(11))).rejects.toMatchObject({ status: 507, code: "storage_full" });

    const full = await getStorageStatus(h.env);
    expect(full.usedBytes).toBe(90);
    expect(full.available).toBe(true);

    await putStoredObject(h.env, "a/two", new Uint8Array(10));
    expect((await getStorageStatus(h.env)).usedBytes).toBe(100);
    expect((await getStorageStatus(h.env)).available).toBe(false);

    await deleteStoredObject(h.env, "a/one", 80);
    expect((await getStorageStatus(h.env)).usedBytes).toBe(20);
    expect((await getStorageStatus(h.env)).available).toBe(true);
  });

  it("accounts for overwrite deltas rather than double-counting objects", async () => {
    const h = makeEnv({ R2_HARD_LIMIT_BYTES: "100", R2_RESERVED_BYTES: "0" });
    await putStoredObject(h.env, "t/design", new Uint8Array(30));
    await putStoredObject(h.env, "t/design", new Uint8Array(12));
    expect((await getStorageStatus(h.env)).usedBytes).toBe(12);
  });
});
