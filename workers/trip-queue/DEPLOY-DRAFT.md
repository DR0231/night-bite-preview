# Trip-queue Worker draft (Step 10) — do not deploy until D'Angelo says so

`worker.draft.js` is the reviewed fix. `worker.js` and `wrangler.jsonc` are unchanged, so an accidental `wrangler deploy` from this folder still ships the current Worker.

This Worker is live, not preview. A deploy goes straight to https://nb-trip-queue.nightbiteoh.workers.dev. Do not run `wrangler deploy`, do not change Cloudflare routes or settings, and do not put `RATE_SALT` in the repo, in chat, or in this file.

## What the draft changes

- `/submit` reads the body with a 4,096-byte cap on the stream (no 411 if Content-Length is missing).
- The webhook POST sends only `Authorization: Bearer <TRIP_WEBHOOK_KEY>` (no `X-Automation-Key`), only if `TRIP_WEBHOOK_URL` starts with `https://`, and uses `redirect: "error"` so a 3xx does not forward the key.
- The per-IP hourly cap hashes with a new `RATE_SALT` secret, not `ADMIN_TOKEN`. If `RATE_SALT` is missing, `/submit` fails closed (503). No raw IP is stored.

The KV get-then-put cap (5/hour) is still eventually consistent. A Cloudflare WAF rate-limit rule on `/submit` is the durable cap and is listed below as an optional deploy-time step, not something to add now.

## Deploy steps (only after a separate go)

1. Confirm the Grok Bot "Night Bite trip arrived" webhook accepts `Authorization: Bearer <TRIP_WEBHOOK_KEY>` and does not require `X-Automation-Key`. If it currently keys only on the custom header, switch it first (or accept both on the receiver during a short cutover). The body stays `{event, id, note}`.
2. From `workers/trip-queue` in this repo, set a new Worker secret, **not** the admin token:
   - Generate a long random value locally (for example `openssl rand -hex 32`). Do not reuse `ADMIN_TOKEN`. Do not commit or paste it into the repo.
   - `wrangler secret put RATE_SALT`
   - Leave `ADMIN_TOKEN`, `TRIP_WEBHOOK_URL`, and `TRIP_WEBHOOK_KEY` as they are unless you mean to rotate them.
3. Optional, in the Cloudflare dashboard on the `nb-trip-queue` Worker (or a WAF rule in front of `/submit`): cap about 5 requests per hour per `CF-Connecting-IP`. Do not log or store the IP. This is in addition to the Worker's hashed KV cap, which stays as a second layer.
4. Point the deploy at the draft only after review: set `"main"` in `wrangler.jsonc` to `"worker.draft.js"`, or copy `worker.draft.js` over `worker.js`. Leave the existing `TRIPS` KV binding in place.
5. `wrangler deploy` from `workers/trip-queue`. This is live the moment it succeeds.
6. Smoke, without printing secrets:
   - `POST /submit` from `https://nightbiteoh.com` or `https://dr0231.github.io` still returns 200 for a valid trip (needs `RATE_SALT` already set, or it will 503).
   - A body over 4,096 bytes returns 413, including a request with no Content-Length.
   - A fifth submit in the same hour from the same client returns 429.
   - After a real (non-check) pending trip, the webhook is notified once over https with only the Authorization header.
7. If you copied the draft over `worker.js`, commit that swap on preview in a later step; until then, keep the original `worker.js` as the checked-in deploy target.

## Rollback

Redeploy the previous `worker.js` (the file still in this folder until step 4). `RATE_SALT` can stay set; the old script ignores it.
