import { createHash, randomBytes, randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import { buildApp } from "../src/index";
import type { Env } from "../src/env";
import { D1Shim, R2Shim } from "./shims";

export const ORIGIN = "https://app.test";
export const app = buildApp();

export interface Harness { env: Env; db: D1Shim; r2: R2Shim; emails: { to: string; text: string }[]; muse: { calls: number; reply: (n: number) => { text: string; credits?: number } | Error } }

export function makeEnv(over: Partial<Env> = {}): Harness {
  const db = new D1Shim(), r2 = new R2Shim(), emails: Harness["emails"] = [];
  const muse: Harness["muse"] = { calls: 0, reply: () => ({ text: JSON.stringify({ summary: "A clear layout.", points: [{ area: "readability", agrees_with: ["contrast"], comment: "Text is readable." }] }), credits: 1 }) };
  const outbound: typeof fetch = async (url, init) => {
    const u = String(url);
    if (u.includes("resend") || u.includes("email")) { const b = JSON.parse(String(init?.body)); emails.push({ to: b.to[0], text: b.text }); return new Response("{}", { status: 200 }); }
    if (u.includes("turnstile")) return Response.json({ success: String(init?.body).includes("good") });
    return new Response("{}", { status: 404 });
  };
  const env = {
    DB: db, BUCKET: r2, ZPH_MASTER_KEY: randomBytes(32).toString("base64"), APP_ORIGIN: ORIGIN, ALLOWED_ORIGINS: ORIGIN,
    EMAIL_API_URL: "https://email.test/send", EMAIL_API_KEY: "k", EMAIL_FROM: "z@test", TURNSTILE_REQUIRED: "false", TURNSTILE_SECRET: "s",
    MUSE_API_URL: "https://muse.test", MUSE_API_KEY: "m", CRITIQUE_COST_PER_REVIEW: "1",
    OUTBOUND_FETCH: outbound,
    __muse: { review: async () => { muse.calls++; const r = muse.reply(muse.calls); if (r instanceof Error) throw r; return r; } },
    ...over,
  } as unknown as Env;
  return { env, db, r2, emails, muse };
}

export interface Res { status: number; json: any; headers: Headers; bytes: Uint8Array }

export async function call(h: Harness, method: string, path: string, o: { json?: unknown; token?: string; headers?: Record<string, string>; body?: BodyInit; origin?: boolean } = {}): Promise<Res> {
  const headers = new Headers(o.headers);
  if (o.token) headers.set("authorization", `Bearer ${o.token}`);
  if (o.origin) headers.set("origin", ORIGIN);
  let body = o.body;
  if (o.json !== undefined) { headers.set("content-type", "application/json"); body = JSON.stringify(o.json); }
  // A real client sends Content-Length for fixed-size bodies; Request() in tests does not add it.
  if (body instanceof FormData) { const r = new Response(body); headers.set("content-type", r.headers.get("content-type")!); body = await r.arrayBuffer(); }
  if (body instanceof Uint8Array || body instanceof ArrayBuffer) headers.set("content-length", String(body.byteLength));
  else if (typeof body === "string") headers.set("content-length", String(new TextEncoder().encode(body).length));
  const pending: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => { pending.push(p); }, passThroughOnException() {} } as unknown as ExecutionContext;
  const res = await app.fetch(new Request(`https://api.test${path}`, { method, headers, body }), h.env, ctx);
  await Promise.all(pending);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let json: any = null;
  try { json = JSON.parse(new TextDecoder().decode(bytes)); } catch { /* not JSON */ }
  return { status: res.status, json, headers: res.headers, bytes };
}

export interface Session { token: string; cookie: string; userId: string; email: string }

export async function signIn(h: Harness, email = `u${randomUUID().slice(0, 6)}@test.dev`): Promise<Session> {
  const m = await call(h, "POST", "/v1/auth/magic", { json: { email } });
  if (m.status !== 202) throw new Error(`magic ${m.status} ${JSON.stringify(m.json)}`);
  const mail = [...h.emails].reverse().find((e) => e.to === email)!;
  const token = /#token=([\w-]+)/.exec(mail.text)![1]!;
  const v = await call(h, "POST", "/v1/auth/verify", { json: { token }, origin: true });
  if (v.status !== 200) throw new Error(`verify ${v.status} ${JSON.stringify(v.json)}`);
  return { token: v.json.access_token, cookie: cookieOf(v.headers), userId: v.json.user.id, email };
}
export const cookieOf = (h: Headers) => h.get("set-cookie")!.split(";")[0]!;

export const sha = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
export const doc = (obj: unknown = { layers: [] }): Uint8Array => new Uint8Array(gzipSync(JSON.stringify(obj)));
export const newId = () => randomUUID();

export async function makeDesign(h: Harness, s: Session, extra: Record<string, unknown> = {}) {
  const id = newId();
  const r = await call(h, "POST", "/v1/designs", { token: s.token, json: { id, title: "Poster", mode: "corporate", width_px: 1080, height_px: 1080, ...extra } });
  if (r.status !== 201) throw new Error(`create ${r.status} ${JSON.stringify(r.json)}`);
  return id;
}

export async function save(h: Harness, s: Session, id: string, base: number, bytes: Uint8Array = doc(), extra: Record<string, string> = {}) {
  return call(h, "POST", `/v1/designs/${id}/versions`, { token: s.token, body: bytes, headers: { "x-base-version": String(base), "x-content-hash": sha(bytes), "content-type": "application/octet-stream", ...extra } });
}

/** A valid PNG header plus filler, at the given size. */
export function png(w = 512, h = 512, extra = 64): Uint8Array {
  const b = new Uint8Array(33 + extra);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w); new DataView(b.buffer).setUint32(20, h);
  b[24] = 8; b[25] = 6;
  b.fill(7, 33);
  return b;
}
