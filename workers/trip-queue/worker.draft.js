/**
 * DRAFT — not deployed. wrangler.jsonc still points at worker.js.
 * The Night Bite trip queue (nb-trip-queue on workers.dev).
 * POST /submit takes one Share a trip form, checks it and stores it in KV as pending. Nothing is published here:
 * D'Angelo approves or rejects each one (tools/trip-queue.py), and approved trips go into data/community-log.json by hand.
 * Admin: GET /admin/list?status=pending|approved, POST /admin/approve {id}, POST /admin/reject {id} (deletes),
 * all with "Authorization: Bearer <ADMIN_TOKEN>" (a Worker secret, never in this repo).
 * Bindings: TRIPS (KV), ADMIN_TOKEN (secret), RATE_SALT (secret, required: the rate-limit hash fails closed if it is
 * missing), TRIP_WEBHOOK_URL and TRIP_WEBHOOK_KEY (optional secrets: after a trip is stored as pending, one POST with
 * only the trip id wakes the site keeper; never the trip text, never blocks the reply). The webhook POST uses only
 * Authorization, requires an https:// URL, and sets redirect: "error".
 * No raw IP is stored: the rate limit key is a SHA-256 of the IP, the hour, and RATE_SALT, and it expires.
 */
const ORIGINS = ["https://nightbiteoh.com", "https://dr0231.github.io"];
const MAX_BODY = 4096;
const RATE_PER_HOUR = 5;
const MAX_PENDING = 300;
const SPECIES = ["Channel catfish", "Blue catfish", "Flathead catfish", "Largemouth bass", "Smallmouth bass",
  "Black crappie", "White crappie", "Bluegill / sunfish", "White bass", "Hybrid striped bass", "Saugeye",
  "Walleye", "Common carp", "Longnose gar", "Other"];
const TIMES = ["Day", "Night", "Dawn / dusk", "Mixed"];
const KEEP = ["Released", "Kept (1)", "Kept (2)", "Kept (other)", "No fish"];
const LIMITS = { ramp: 80, bait: 120, notes: 500 };
const FIELDS = ["lake", "date", "species", "ramp", "time_window", "bait", "keep_release", "notes", "website", "check"];

function cors(origin) {
  const h = { "Vary": "Origin", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" };
  if (ORIGINS.includes(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    h["Access-Control-Allow-Headers"] = "Content-Type";
    h["Access-Control-Max-Age"] = "86400";
  }
  return h;
}

function json(status, body, headers) {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json; charset=utf-8", ...headers }
  });
}

function clean(s, max) {
  if (typeof s !== "string") return null;
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\s+$/g, "").replace(/^\s+/g, "");
  return s.length <= max ? s : null;
}

function validate(b) {
  if (!b || typeof b !== "object" || Array.isArray(b)) return "bad body";
  for (const k of Object.keys(b)) if (!FIELDS.includes(k)) return "unknown field " + k.slice(0, 20);
  const t = {};
  t.lake = clean(b.lake, 24);
  if (!t.lake || !/^[a-z]{2,24}$/.test(t.lake)) return "lake";
  t.date = clean(b.date, 10);
  if (!t.date || !/^\d{4}-\d{2}-\d{2}$/.test(t.date)) return "date";
  const d = Date.parse(t.date + "T12:00:00Z");
  if (isNaN(d) || d > Date.now() + 2 * 86400000 || d < Date.parse("2020-01-01")) return "date";
  t.species = clean(b.species, 40);
  if (!SPECIES.includes(t.species)) return "species";
  t.time_window = clean(b.time_window, 20);
  if (!TIMES.includes(t.time_window)) return "time_window";
  t.keep_release = clean(b.keep_release, 20);
  if (!KEEP.includes(t.keep_release)) return "keep_release";
  for (const k of ["ramp", "bait", "notes"]) {
    const v = clean(b[k] == null ? "" : b[k], LIMITS[k]);
    if (v === null) return k;
    t[k] = v;
  }
  if (!t.ramp) return "ramp";
  if (!t.bait) return "bait";
  if (/https?:\/\/|www\./i.test(t.ramp + " " + t.bait + " " + t.notes)) return "links are not allowed";
  if (b.check === true) t.check = true;
  return t;
}

async function sha(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, "0")).join("");
}

/** Read at most `max` bytes from the request body. Stops as soon as the cap is exceeded. Byte count, not UTF-16. */
export async function readBodyCapped(req, max) {
  const declared = req.headers.get("Content-Length");
  if (declared != null && declared !== "" && Number(declared) > max) return { error: 413 };
  if (!req.body) return { text: "" };
  const reader = req.body.getReader();
  const chunks = [];
  let n = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > max) {
      try { await reader.cancel(); } catch (e) { /* already over the cap */ }
      return { error: 413 };
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(n);
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
  return { text: new TextDecoder("utf-8").decode(buf) };
}

/**
 * Build the webhook fetch, or null if it must be skipped (missing secrets, not https://, or a bad URL).
 * Exactly one auth header: Authorization. redirect: "error" so a 3xx does not forward the key.
 */
export function webhookInit(url, key, id) {
  if (!url || !key) return null;
  if (typeof url !== "string" || !url.startsWith("https://")) return null;
  try { if (new URL(url).protocol !== "https:") return null; } catch (e) { return null; }
  return {
    url,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
      body: JSON.stringify({ event: "new_trip", id, note: "new trip" }),
      redirect: "error",
      signal: AbortSignal.timeout(8000)
    }
  };
}

export function rateSaltMissing(env) {
  return !env || typeof env.RATE_SALT !== "string" || !env.RATE_SALT;
}

export async function rateKey(env, ip, hour) {
  if (rateSaltMissing(env)) return null;
  return "rl:" + (await sha((ip || "unknown") + "|" + hour + "|" + env.RATE_SALT)).slice(0, 32);
}

async function tokenOk(req, env) {
  const got = (req.headers.get("Authorization") || "").replace(/^Bearer /, "");
  if (!env.ADMIN_TOKEN || !got) return false;
  // compare digests so length and content leak nothing through timing
  const [a, b] = await Promise.all([sha(got), sha(env.ADMIN_TOKEN)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function listAll(env, prefix) {
  const out = [];
  let cursor;
  do {
    const r = await env.TRIPS.list({ prefix, cursor });
    for (const k of r.keys) out.push(k.name);
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
  return out;
}

// One fire-and-forget ping per new pending trip. Body is only the id and a note. Skipped if either secret is missing,
// the URL is not https://, or the init cannot be built; errors and timeouts are swallowed, no retry, and the
// reader's response never waits on it.
function notify(env, ctx, id) {
  const built = webhookInit(env && env.TRIP_WEBHOOK_URL, env && env.TRIP_WEBHOOK_KEY, id);
  if (!built || !ctx || typeof ctx.waitUntil !== "function") return;
  try {
    ctx.waitUntil(fetch(built.url, built.init).catch(() => {}));
  } catch (e) { /* never let the ping affect the submission */ }
}

async function submit(req, env, origin, ctx) {
  const h = cors(origin);
  if (!ORIGINS.includes(origin)) return json(403, { ok: false, error: "origin" }, h);
  if (!(req.headers.get("Content-Type") || "").startsWith("application/json")) return json(415, { ok: false, error: "type" }, h);
  const bodyRead = await readBodyCapped(req, MAX_BODY);
  if (bodyRead.error === 413) return json(413, { ok: false, error: "too big" }, h);
  const text = bodyRead.text;
  let body;
  try { body = JSON.parse(text); } catch (e) { return json(400, { ok: false, error: "json" }, h); }
  // honeypot: a hidden "website" field people never fill; answer ok so bots learn nothing
  if (body && typeof body.website === "string" && body.website.trim() !== "") return json(200, { ok: true, status: "pending" }, h);
  const t = validate(body);
  if (typeof t === "string") return json(400, { ok: false, error: t }, h);

  // fail closed: no RATE_SALT means we cannot hash the IP safely, so we do not accept the trip
  if (rateSaltMissing(env)) return json(503, { ok: false, error: "server" }, h);
  const ip = req.headers.get("CF-Connecting-IP") || "unknown";
  const hour = new Date().toISOString().slice(0, 13);
  const rlKey = await rateKey(env, ip, hour);
  const n = Number((await env.TRIPS.get(rlKey)) || 0);
  if (n >= RATE_PER_HOUR) return json(429, { ok: false, error: "rate" }, { ...h, "Retry-After": "3600" });
  await env.TRIPS.put(rlKey, String(n + 1), { expirationTtl: 3600 });

  const pending = await env.TRIPS.list({ prefix: "pending:", limit: MAX_PENDING });
  if (pending.keys.length >= MAX_PENDING) return json(503, { ok: false, error: "queue full" }, h);

  const id = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14) + "-" + crypto.randomUUID().slice(0, 8);
  const entry = { id, status: "pending", received: new Date().toISOString(), from: origin, ...t };
  await env.TRIPS.put("pending:" + id, JSON.stringify(entry));
  if (!t.check) notify(env, ctx, id); // automated check trips (tools/check-trip-queue.cjs) do not wake anyone
  return json(200, { ok: true, status: "pending", id }, h);
}

async function admin(req, env, path) {
  const h = { "Cache-Control": "no-store" };
  if (!(await tokenOk(req, env))) return json(401, { ok: false, error: "auth" }, h);
  if (req.method === "GET" && path === "/admin/list") {
    const status = new URL(req.url).searchParams.get("status") || "pending";
    if (!["pending", "approved"].includes(status)) return json(400, { ok: false, error: "status" }, h);
    const keys = await listAll(env, status + ":");
    const entries = [];
    for (const k of keys) {
      const v = await env.TRIPS.get(k);
      if (v) entries.push(JSON.parse(v));
    }
    return json(200, { ok: true, status, count: entries.length, entries }, h);
  }
  if (req.method === "POST" && (path === "/admin/approve" || path === "/admin/reject")) {
    let b;
    try { b = await req.json(); } catch (e) { return json(400, { ok: false, error: "json" }, h); }
    const id = b && typeof b.id === "string" && /^[0-9]{14}-[0-9a-f]{8}$/.test(b.id) ? b.id : null;
    if (!id) return json(400, { ok: false, error: "id" }, h);
    const v = await env.TRIPS.get("pending:" + id) || await env.TRIPS.get("approved:" + id);
    if (!v) return json(404, { ok: false, error: "not found" }, h);
    if (path === "/admin/reject") {
      await env.TRIPS.delete("pending:" + id);
      await env.TRIPS.delete("approved:" + id);
      return json(200, { ok: true, id, status: "rejected (deleted)" }, h);
    }
    const e = JSON.parse(v);
    e.status = "approved";
    e.approved = new Date().toISOString();
    await env.TRIPS.put("approved:" + id, JSON.stringify(e));
    await env.TRIPS.delete("pending:" + id);
    return json(200, { ok: true, id, status: "approved", entry: e }, h);
  }
  return json(404, { ok: false, error: "not found" }, h);
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const origin = req.headers.get("Origin") || "";
    try {
      if (url.pathname === "/submit") {
        if (req.method === "OPTIONS") return new Response(null, { status: ORIGINS.includes(origin) ? 204 : 403, headers: cors(origin) });
        if (req.method === "POST") return await submit(req, env, origin, ctx);
        return json(405, { ok: false, error: "method" }, cors(origin));
      }
      if (url.pathname.startsWith("/admin/")) return await admin(req, env, url.pathname);
      return json(404, { ok: false, error: "not found" }, {});
    } catch (e) {
      console.error("trip-queue error", e && e.message);
      return json(500, { ok: false, error: "server" }, cors(origin));
    }
  }
};
