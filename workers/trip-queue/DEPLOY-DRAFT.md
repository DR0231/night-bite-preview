# Trip-queue Worker draft — do not deploy until D'Angelo says so

`worker.draft.js` is the reviewed fix. `wrangler.draft.jsonc` is the matching config. `worker.js` and `wrangler.jsonc` are unchanged, so an accidental `wrangler deploy` from this folder (with the default config) still ships the current Worker.

This Worker is live, not preview. A deploy goes straight to https://nb-trip-queue.nightbiteoh.workers.dev. Do not run `wrangler deploy`, do not change Cloudflare routes or settings, and do not put `RATE_SALT` in the repo, in chat, or in this file.

## What the draft changes

- `/submit` reads the body with a 4,096-byte cap on the stream (no 411 if Content-Length is missing).
- The webhook POST sends only `Authorization: Bearer <TRIP_WEBHOOK_KEY>` (no `X-Automation-Key`), only if `TRIP_WEBHOOK_URL` starts with `https://`, and uses `redirect: "error"` so a 3xx does not forward the key.
- `RATE_SALT` is a required secret. If it is missing, `/submit` fails closed (503). Rate-limit keys are a SHA-256 of the IP and that salt. No raw IP is stored.
- A real limit, not the old KV get-then-put cap:
  - **Workers Rate Limiting binding** `SUBMIT_RATE`: 5 requests per 60 seconds (the binding only accepts a period of 10 or 60 seconds). The key is the hashed actor, never the IP. This limit is approximate and counted per Cloudflare location. Missing binding: `/submit` fails closed (503).
  - **Durable Object** `SubmitLimits`: a strict 5 submissions per UTC hour per hashed actor, plus a global cap of 80 new pending trips per UTC day (`MAX_NEW_PER_DAY`, below the existing 300 pending ceiling) so spam cannot fill the queue in a day. The object stores only `{ window, n }`. Missing binding: `/submit` fails closed (503).
- `wrangler.draft.jsonc` declares those bindings and points `main` at `worker.draft.js`. Do not copy it over `wrangler.jsonc` until the deploy is approved.

## Deploy steps (only after a separate go)

1. Confirm the Grok Bot "Night Bite trip arrived" webhook accepts `Authorization: Bearer <TRIP_WEBHOOK_KEY>` and does not require `X-Automation-Key`. If it currently keys only on the custom header, switch it first (or accept both on the receiver during a short cutover). The body stays `{event, id, note}`.
2. From `workers/trip-queue` in this repo, set a new Worker secret, **not** the admin token:
   - Generate a long random value locally (for example `openssl rand -hex 32`). Do not reuse `ADMIN_TOKEN`. Do not commit or paste it into the repo.
   - `wrangler secret put RATE_SALT`
   - Leave `ADMIN_TOKEN`, `TRIP_WEBHOOK_URL`, and `TRIP_WEBHOOK_KEY` as they are unless you mean to rotate them.
3. Confirm `namespace_id` `"41701"` in `wrangler.draft.jsonc` is unused on the Cloudflare account (it must be a unique positive integer string). Change it in the draft config if it already belongs to another binding. Wrangler 4.36.0 or later is required for the Rate Limiting binding.
4. Deploy the draft config, not the live one: `wrangler deploy -c wrangler.draft.jsonc` from `workers/trip-queue`. That points `main` at `worker.draft.js`, creates the `SUBMIT_RATE` binding, and applies the `v1-submit-limits` Durable Object migration. Keep the existing `TRIPS` KV binding. This is live the moment it succeeds. Do not run this until D'Angelo says go.
5. Smoke, without printing secrets:
   - `POST /submit` from `https://nightbiteoh.com` or `https://dr0231.github.io` still returns 200 for a valid trip (needs `RATE_SALT` and both bindings already in place, or it will 503).
   - A body over 4,096 bytes returns 413, including a request with no Content-Length.
   - A sixth submit in the same 60 seconds from the same client returns 429 with `Retry-After: 60`.
   - A sixth accepted submit in the same UTC hour from the same client returns 429 with `Retry-After: 3600`.
   - The 81st new pending trip in the UTC day returns 503 (`queue full`), even if fewer than 300 are still pending.
   - After a real (non-check) pending trip, the webhook is notified once over https with only the Authorization header.
6. If you later copy the draft over `worker.js` / `wrangler.jsonc`, commit that swap on preview in a later step; until then, keep the original files as the checked-in default deploy target.

A Cloudflare WAF rule on `/submit` can still be added later as an extra layer. It is not required for this draft; the binding and the Durable Object are the real limit.

## Rollback

Redeploy with the unchanged `wrangler.jsonc` (it still points at `worker.js`). `RATE_SALT`, the rate-limit namespace, and the Durable Object class can stay; the old script ignores them.
