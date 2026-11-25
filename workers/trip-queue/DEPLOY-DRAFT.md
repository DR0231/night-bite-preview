# Trip-queue Worker draft — deployed 24 Nov 2026 (America/New_York)

`worker.js` and `wrangler.jsonc` are the deploy source. `worker.draft.js` and `wrangler.draft.jsonc` are kept in sync and stay preview-only (`promote.py` skips `*.draft.js`, `*.draft.jsonc`, this file, and `check-worker-draft.mjs`).

Worker: https://nb-trip-queue.nightbiteoh.workers.dev. This Worker is live, not preview. Do not put `RATE_SALT`, `ADMIN_TOKEN`, or webhook secrets in the repo, in chat, or in this file.

## What is now live

- `/submit` reads the body with a 4,096-byte cap on the stream (no 411 if Content-Length is missing).
- The webhook POST sends only `Authorization: Bearer <TRIP_WEBHOOK_KEY>` (no `X-Automation-Key`), only if `TRIP_WEBHOOK_URL` starts with `https://`, and uses `redirect: "error"`.
- `RATE_SALT` is a required secret. Rate-limit keys are a SHA-256 of the IP and that salt. No raw IP is stored. Missing salt: `/submit` fails closed (503).
- Workers Rate Limiting binding `SUBMIT_RATE`: 5 requests per 60 seconds, keyed on the hashed actor, never the IP. Approximate and per Cloudflare location. Missing binding: 503.
- Durable Object `SubmitLimits` (SQLite class, required on the free plan): a strict 5 submissions per UTC hour per hashed actor, plus a global cap of 80 new pending trips per UTC day. Storage is only `{ window, n }`. Missing binding: 503.
- `namespace_id` `"41701"` was confirmed unused on the account at first deploy. Wrangler 4.36.0 or later is required.

## This deploy

- Rollback (pre-change): deployment `b8d62d28-f2c8-43f8-bb24-3d88a45d72fb`, version `14834d90-54ed-4c98-8fa4-621790a86c68` (2026-11-18T17:12:20Z).
- After `RATE_SALT` was set, still on the previous Worker script: deployment `19c45b73-4ec5-4cac-9912-5bfd065f7de8`, version `0edc54ea-d542-43fc-8dd1-a6460de66497`.
- Live after the draft deploy: deployment `c9e58eef-4a48-4887-83f5-d8eb86c32b2f`, version `4e56ace1-1b5a-4f90-88b8-303596c55a39`.

To roll back:

    wrangler rollback 0edc54ea-d542-43fc-8dd1-a6460de66497 -y -m "Roll back trip-queue draft deploy"

That returns the previous script (with `RATE_SALT` still set). The rate-limit namespace and Durable Object class are not removed by a rollback. The first deploy attempt with `new_classes` was rejected on the free plan (error 10097) and did not go live; the successful deploy used `new_sqlite_classes`.
