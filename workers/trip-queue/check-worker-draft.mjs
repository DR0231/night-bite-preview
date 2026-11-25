#!/usr/bin/env node
// Local checks for workers/trip-queue/worker.js (and the matching wrangler.jsonc). No wrangler, no network, no secrets, no deploy.
import { readFileSync } from "node:fs";
import { readBodyCapped, webhookInit, rateSaltMissing, rateActorKey, applyBucket, checkSubmitLimits, SubmitLimits, RATE_PER_HOUR, RATE_BURST_PERIOD, MAX_NEW_PER_DAY } from "./worker.js";

function parseJsonc(path) {
  const text = readFileSync(path, "utf8").split("\n").map(line => /^\s*\/\//.test(line) ? "" : line).join("\n");
  return JSON.parse(text);
}

function memoryState() {
  const m = new Map();
  return {
    storage: {
      async get(k) { return m.get(k); },
      async put(k, v) { m.set(k, v); }
    }
  };
}

function mockLimits() {
  const objects = new Map();
  return {
    idFromName(name) { return { name }; },
    get(id) {
      const key = id && id.name;
      if (!objects.has(key)) objects.set(key, new SubmitLimits(memoryState(), {}));
      return objects.get(key);
    }
  };
}

function testEnv(limitFn) {
  return {
    RATE_SALT: "salt-a",
    SUBMIT_RATE: { limit: limitFn || (async () => ({ success: true })) },
    SUBMIT_LIMITS: mockLimits()
  };
}

let fails = 0, passes = 0;
function check(name, ok, info) {
  if (ok) passes++; else fails++;
  console.log((ok ? "PASS " : "FAIL ") + name + (!ok && info != null ? " :: " + String(info).slice(0, 300) : ""));
}

function streamRequest(bytes, headers = {}) {
  const stream = new ReadableStream({
    start(c) {
      if (bytes.byteLength) c.enqueue(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
      c.close();
    }
  });
  return new Request("https://nb-trip-queue.nightbiteoh.workers.dev/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: stream,
    duplex: "half"
  });
}

function chunkedRequest(parts) {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(c) {
      for (const p of parts) c.enqueue(typeof p === "string" ? enc.encode(p) : p);
      c.close();
    }
  });
  return new Request("https://nb-trip-queue.nightbiteoh.workers.dev/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: stream,
    duplex: "half"
  });
}

const small = new TextEncoder().encode('{"lake":"hoover"}');
const over = new Uint8Array(4097).fill(97);

const r1 = await readBodyCapped(streamRequest(small, { "Content-Length": String(small.byteLength) }), 4096);
check("body cap: a small body is returned as text", r1.text === '{"lake":"hoover"}' && !r1.error);

const r2 = await readBodyCapped(streamRequest(over, { "Content-Length": "4097" }), 4096);
check("body cap: Content-Length over the cap is 413 without buffering the body", r2.error === 413 && r2.text == null);

const r3 = await readBodyCapped(chunkedRequest([over]), 4096);
check("body cap: a chunked body over 4096 bytes is 413 (no Content-Length)", r3.error === 413);

const r4 = await readBodyCapped(chunkedRequest(["{\"ok\":true}"]), 4096);
check("body cap: a small chunked body (no Content-Length) is accepted", r4.text === '{"ok":true}' && !r4.error);

const mid = new Uint8Array(2000).fill(98);
const r5 = await readBodyCapped(chunkedRequest([mid, mid, mid]), 4096);
check("body cap: stops once the cap is crossed across chunks", r5.error === 413);

const wh = webhookInit("https://example.com/hook", "secret-key", "20261124120000-abcd1234");
check("webhook: builds a POST to the https URL", !!(wh && wh.url === "https://example.com/hook" && wh.init.method === "POST"));
check("webhook: only Authorization is sent (no X-Automation-Key)",
  !!(wh && wh.init.headers.Authorization === "Bearer secret-key"
    && !Object.keys(wh.init.headers).some(k => k.toLowerCase() === "x-automation-key")
    && Object.keys(wh.init.headers).filter(k => /auth|key/i.test(k)).length === 1));
check("webhook: redirect is error", !!(wh && wh.init.redirect === "error"));
check("webhook: http:// is skipped", webhookInit("http://example.com/hook", "secret-key", "id") === null);
check("webhook: a missing URL or key is skipped",
  webhookInit("", "k", "id") === null && webhookInit("https://example.com/hook", "", "id") === null);
check("webhook: a non-https protocol after parse is skipped", webhookInit("https://example.com/hook", "k", "id") && webhookInit("javascript:alert(1)", "k", "id") === null);

check("RATE_SALT: missing or empty fails closed",
  rateSaltMissing({}) && rateSaltMissing({ RATE_SALT: "" }) && rateSaltMissing({ RATE_SALT: null }) && !rateSaltMissing({ RATE_SALT: "s" }));
const k1 = await rateActorKey({ RATE_SALT: "salt-a" }, "1.2.3.4");
const k2 = await rateActorKey({ RATE_SALT: "salt-b" }, "1.2.3.4");
const k3 = await rateActorKey({ RATE_SALT: "salt-a" }, "1.2.3.4");
check("RATE_SALT: the actor key is a hash prefix, not the raw IP, and changes with the salt",
  !!(k1 && k1.startsWith("a:") && !k1.includes("1.2.3.4") && k1 !== k2 && k1 === k3));
check("RATE_SALT: no salt means no key", (await rateActorKey({}, "1.2.3.4")) === null);

const b1 = applyBucket(null, "2026-11-24T23", 5);
const b2 = applyBucket({ window: b1.window, n: b1.n }, "2026-11-24T23", 5);
const bFull = applyBucket({ window: "2026-11-24T23", n: 5 }, "2026-11-24T23", 5);
const bRollover = applyBucket({ window: "2026-11-24T22", n: 5 }, "2026-11-24T23", 5);
check("applyBucket: increments, refuses at the limit, and resets on a new window",
  b1.ok === true && b1.n === 1 && b2.ok === true && b2.n === 2 && bFull.ok === false && bFull.n === 5
    && bRollover.ok === true && bRollover.n === 1 && applyBucket(null, "", 5).error === "args");

const now = new Date("2026-11-24T23:10:00Z");
const missing = await checkSubmitLimits({ RATE_SALT: "salt-a" }, k1, now);
const noSalt = await checkSubmitLimits({}, k1, now);
check("limits: missing Rate Limiting binding or RATE_SALT fails closed with 503",
  missing.error === 503 && noSalt.error === 503);

const burstKeys = [];
const burstEnv = testEnv(async ({ key }) => { burstKeys.push(key); return { success: false }; });
const burst = await checkSubmitLimits(burstEnv, k1, now);
check("limits: Rate Limiting binding refusal is 429 with a 60s retry, and the key is the hash not the IP",
  burst.error === 429 && burst.retryAfter === RATE_BURST_PERIOD
    && burstKeys.length === 1 && burstKeys[0] === k1 && !burstKeys[0].includes("1.2.3.4"));

const hourEnv = testEnv();
const hourResults = [];
for (let i = 0; i < RATE_PER_HOUR + 1; i++) hourResults.push(await checkSubmitLimits(hourEnv, k1, now));
check("limits: Durable Object allows 5 in the hour and refuses the sixth with 429",
  hourResults.slice(0, 5).every(r => r.ok === true) && hourResults[5].error === 429 && hourResults[5].retryAfter === 3600);

const dayEnv = testEnv();
const dayActor = await rateActorKey(dayEnv, "9.9.9.9");
const dayResults = [];
for (let i = 0; i < MAX_NEW_PER_DAY + 1; i++) {
  const actor = await rateActorKey(dayEnv, "10.0.0." + String((i % 200) + 1));
  dayResults.push(await checkSubmitLimits(dayEnv, actor, now));
}
check("limits: the global daily cap is below 300 and the next submit is 503 queue-full",
  MAX_NEW_PER_DAY === 80 && MAX_NEW_PER_DAY < 300
    && dayResults.slice(0, MAX_NEW_PER_DAY).every(r => r.ok === true)
    && dayResults[MAX_NEW_PER_DAY].error === 503 && dayResults[MAX_NEW_PER_DAY].reason === "day-cap"
    && !dayActor.includes("9.9.9.9"));

const draftCfg = parseJsonc(new URL("./wrangler.draft.jsonc", import.meta.url));
const liveCfg = parseJsonc(new URL("./wrangler.jsonc", import.meta.url));
const rl = liveCfg.ratelimits && liveCfg.ratelimits[0];
const dob = liveCfg.durable_objects && liveCfg.durable_objects.bindings && liveCfg.durable_objects.bindings[0];
check("wrangler.jsonc: main is worker.js, with SUBMIT_RATE 5/60s and the SubmitLimits Durable Object",
  liveCfg.main === "worker.js" && liveCfg.name === "nb-trip-queue"
    && rl && rl.name === "SUBMIT_RATE" && /^\d+$/.test(String(rl.namespace_id))
    && rl.simple && rl.simple.limit === 5 && rl.simple.period === 60
    && dob && dob.name === "SUBMIT_LIMITS" && dob.class_name === "SubmitLimits"
    && Array.isArray(liveCfg.migrations) && liveCfg.migrations[0] && liveCfg.migrations[0].tag === "v1-submit-limits"
    && ((liveCfg.migrations[0].new_sqlite_classes || liveCfg.migrations[0].new_classes || []).includes("SubmitLimits"))
    && JSON.stringify(draftCfg) === JSON.stringify(liveCfg));

console.log(fails ? fails + " FAIL, " + passes + " pass" : "ALL PASSED: " + passes + " pass, 0 fail");
process.exit(fails ? 1 : 0);
