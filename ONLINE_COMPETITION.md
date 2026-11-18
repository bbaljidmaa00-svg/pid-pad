# Online Competition (V18)
This branch upgrades the existing Pid Pad app to add live rooms and scoring.

- Frontend: `app.html` and `public/index.html` (same complete HTML)
- Worker routing: `worker.js`
- Durable Object: `functions/api/rooms.js`
- Cloudflare setup: `wrangler.toml`
- Existing admin: `functions/api/content.js`, `functions/api/login.js`, `functions/api/_shared.js` (unchanged)
- Existing shared content: `public/custom.json` (unchanged)

## Scores
- Vote cast: +1
- Most selected player in "Who": +2
- Matching the majority in "Choice": +1
- Ties receive equal bonus points. The room host can reveal, advance, or reset.
- After 10 rounds show winners; max 12 members per room.

## Deployment
Requires a Cloudflare Worker with SQLite-backed Durable Objects and a `ROOMS` binding.
A new migration (`room-v1`) creates `PartyRoom`; verify your account supports DO SQLite and review the deployment configuration before merging. Existing `PP` KV and `ADMIN_PASSWORD` must remain configured. The feature cannot work when opening HTML as a local file.

## Checks before release
- Confirm `wrangler deploy` works in a preview environment.
- Test two physical phones (create, join, vote, reveal, score, reset).
- Test admin login/content editing has not regressed.
- Never merge automatically into main before confirming the production Cloudflare account's Durable Object support.
