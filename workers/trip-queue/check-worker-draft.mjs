#!/usr/bin/env node
// Local checks for workers/trip-queue/worker.draft.js. No wrangler, no network, no secrets, no deploy.
import { readBodyCapped, webhookInit, rateSaltMissing, rateKey } from "./worker.draft.js";

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
const k1 = await rateKey({ RATE_SALT: "salt-a" }, "1.2.3.4", "2026-11-24T23");
const k2 = await rateKey({ RATE_SALT: "salt-b" }, "1.2.3.4", "2026-11-24T23");
const k3 = await rateKey({ RATE_SALT: "salt-a" }, "1.2.3.4", "2026-11-24T23");
check("RATE_SALT: the KV key is a hash prefix, not the raw IP, and changes with the salt",
  !!(k1 && k1.startsWith("rl:") && !k1.includes("1.2.3.4") && k1 !== k2 && k1 === k3));
check("RATE_SALT: no salt means no key", (await rateKey({}, "1.2.3.4", "2026-11-24T23")) === null);

console.log(fails ? fails + " FAIL, " + passes + " pass" : "ALL PASSED: " + passes + " pass, 0 fail");
process.exit(fails ? 1 : 0);
