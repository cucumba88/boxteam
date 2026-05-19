# Security guidelines — oscata-tauri

These rules exist because the v0.10.14 audit found embarrassingly basic
mistakes (e.g. `GET /api/settings` returning every API key in plaintext;
`CorsLayer::permissive()` on a public endpoint). They were trivial to fix
but each one was a stand-alone "you should never ship this" issue.

This document is **the checklist that should have caught those before they
shipped.** Read it before adding any new endpoint, any new piece of stored
state, or any new auth-touching code. Open a TODO line below if you hit a
case the rules don't cover.

---

## 1. Secrets in API responses — DEFAULT TO REDACTED

**Rule:** never return a credential, API key, token, or password in a GET
response. Use the redaction sentinel pattern in
[`src-tauri/src/web/redact.rs`](../src-tauri/src/web/redact.rs):

- GET handlers return [`redact::mask(&value)`](../src-tauri/src/web/redact.rs)
  for every secret field.
- PUT/POST handlers use [`redact::preserve(&provided, &current)`](../src-tauri/src/web/redact.rs)
  so the client can round-trip the sentinel ("don't change") or send an empty
  string ("clear it") or a new value.

Every time you add a new field to `AppConfig`, `WebGuiConfig`, or any
DB-backed struct that's serialised over the API, ask:

> "Could anyone other than me read this value without harm?"

If the answer is no, add it to the mask/preserve list in the relevant
handler. The frontend already shows `<input type="password">` for these
fields so the sentinel appears as dots, indistinguishable from a real value.

**The audit caught:** `ftp_pass`, `tmdb_api_key`, `emby_api_key`,
`plex_token`, `smtp_pass`, `telegram_bot_token`.

**Test it:** in browser devtools, `fetch('/api/<endpoint>', {headers: {Authorization: 'Bearer ' + localStorage.oscata_web_token}}).then(r => r.json())`.
Inspect the response. No secrets allowed.

---

## 2. CORS — explicit allowlist, never `permissive()`

**Rule:** never use [`CorsLayer::permissive()`](https://docs.rs/tower-http/latest/tower_http/cors/struct.CorsLayer.html#method.permissive)
in a build that can be exposed to the internet. The build_cors_layer fn in
[`web/mod.rs`](../src-tauri/src/web/mod.rs) reads `OSCATA_WEBGUI_ALLOWED_ORIGINS`
from env, falls back to the DB-stored `app_url`, and only as a last resort
falls back to permissive with a loud warning.

When you add a new origin (e.g. a mobile app, a dev tool, a webhook target):

1. Add it to `OSCATA_WEBGUI_ALLOWED_ORIGINS` in the docker-compose / Unraid
   template — not in code.
2. Never add `*` to that env. Never. The bearer token model means CORS is
   the only thing stopping a malicious page from reading `/api/settings`.

**Test it:** `curl -i -X OPTIONS -H "Origin: https://evil.example.com" -H "Access-Control-Request-Method: GET" http://localhost:47860/api/server-info`
should return without `access-control-allow-origin`. Same request with the
real origin should include the header.

---

## 3. Auth — three-strike rule, real IP, no plaintext-equal compare

**Rule:** every auth-related decision needs three things:

1. **Rate limit per (subject, real client IP).** See
   [`rate_limit.rs`](../src-tauri/src/web/rate_limit.rs). When you add a new
   auth-gated action (password reset, API-key rotation, anything that
   accepts a credential), wire it through `check_login_allowed` /
   `record_failure` / `clear`.

2. **Real client IP, not peer.** Always use
   [`client_ip::client_ip(&headers, peer.ip())`](../src-tauri/src/web/client_ip.rs).
   `peer_addr` from Axum's `ConnectInfo` is the reverse-proxy IP (`127.0.0.1`)
   in production — useless for rate-limiting or auditing. `X-Forwarded-For`
   is trusted ONLY when peer is in `OSCATA_TRUSTED_PROXIES`.

3. **Constant-time comparison for secret material.** Never compare tokens /
   hashes with `==`, `String::eq`, or any short-circuiting equality. Pass
   credentials through `bcrypt::verify` or `subtle::ConstantTimeEq`. The
   compiler is allowed to short-circuit `==`, and modern CPUs leak via cache
   timing.

   Today's code uses parameterised SQL (`WHERE id = ?1`) for session tokens
   so the DB does the compare, which is fine. New auth checks must explicitly
   use a constant-time primitive.

---

## 4. SQL — bind parameters or die

**Rule:** never build SQL with `format!`, `+`, or any string interpolation
when **any** part of the interpolated value comes from outside the binary.
Use `params![…]` from rusqlite for everything.

The two exceptions in the codebase are `VACUUM INTO '<path>'` and
`ATTACH '<path>'`, which SQLite doesn't support binding for. Those use
[`Db::validate_and_escape_sqlite_path`](../src-tauri/src/db.rs) which
rejects control characters, NUL bytes, and pathological lengths. If you
ever find another case that needs raw interpolation, route it through that
function — don't roll your own escape.

**Test it:** grep for `format!.*WHERE\|format!.*INSERT\|format!.*UPDATE\|format!.*DELETE`
in `src-tauri/src/`. Result should be empty.

---

## 5. Tokens & randomness — `OsRng`, not `Uuid::new_v4`, not `thread_rng()`

**Rule:** session tokens, invite tokens, password-reset codes, and anything
else where guessability matters use `rand::rngs::OsRng` with raw bytes,
hex-encoded. See `new_session_token` in [`auth.rs`](../src-tauri/src/web/auth.rs).

- UUID v4 has 122 effective bits — fine for "I just need uniqueness", not
  fine when it's a session identifier.
- `rand::thread_rng()` is not cryptographic by default in rand 0.8; relying
  on its current behaviour is fragile. OTP codes are the one exception
  today (6-digit numeric, rate-limited) and are documented as such.

**Minimum entropy targets:**
- Session token: 256 bits (32 bytes)
- Invite token: 128 bits (16 bytes) acceptable since one-time-use + short TTL
- OTP code: 6+ digits, hard rate-limit, ≤ 5 min TTL

---

## 6. Bcrypt — pin the cost, never use `DEFAULT_COST`

**Rule:** call `bcrypt::hash(pw, BCRYPT_COST)` where `BCRYPT_COST` is a
named constant in your module. Reading `bcrypt::DEFAULT_COST` couples your
security floor to a third-party crate's release cycle — a minor version
bump could silently lower it.

Current pin: **13** (in [`auth.rs`](../src-tauri/src/web/auth.rs)).
Bumping the cost is safe (`bcrypt::verify` reads the cost from the stored
hash, so existing accounts continue to work). Lower the cost only with a
written reason in the commit message.

---

## 7. Sessions — invalidate on every state change

**Rule:** whenever a user's authentication state changes (password
rotated, role lowered, account disabled), revoke their existing sessions.
The session cache TTL is 60 s, so even with cache, the user loses access
within a minute — but the DB row needs to go too.

Helpers to use:
- [`Db::revoke_web_session`](../src-tauri/src/db.rs) — single session
- [`Db::revoke_other_sessions`](../src-tauri/src/db.rs) — keep current, drop the rest
- [`auth::invalidate_session_cache`](../src-tauri/src/web/auth.rs) — drop cached entry

Call sites that need a checklist entry:
- Password change → revoke others (done)
- User disabled → revoke all
- Role downgraded → revoke all (so they re-auth and pick up the new role)
- User deleted → revoke all (FK cascade should handle this; verify)

---

## 8. Race conditions in one-shot tokens

**Rule:** any "use this once" credential (invite, OTP, password-reset
link) must be consumed by a single SQL statement that succeeds only if it
hasn't been consumed yet. The pattern:

```sql
UPDATE table SET used_at = ? WHERE id = ? AND used_at IS NULL
```

Check `rows_affected == 1`. If 0, somebody else got there first; abort.

Never SELECT-then-UPDATE in two statements — even with a `Mutex<Connection>`
serialising you today, the moment that mutex goes (planned for the
connection-pool change), the race window is wide open. See
[`consume_web_invite`](../src-tauri/src/db.rs) for the canonical example.

---

## 9. Bootstrap / "first install" endpoints stay closed forever

**Rule:** any endpoint that creates the first admin (or otherwise sets up
the system from a blank state) must use a *one-way* flag persisted in a
location independent of the `web_users` table. See `bootstrap_complete`
in `app_config`.

The audit found that `/api/auth/bootstrap` was gated only on
`web_user_count() == 0`. If anyone managed to delete `web_users` (DB
corruption, bad restore, malicious deletion), bootstrap reopened and any
visitor could become admin. The one-way flag survives even a wipe.

---

## 10. Frontend ↔ backend boundary — every secret has a "is it set?" question

**Rule:** when storing a credential, design the UI so the user can tell
whether the field has a stored value WITHOUT showing the value itself.

Today's pattern: empty input + the redaction sentinel as the bound value,
rendered as `<input type="password">` so it shows as dots. If the user
deletes the dots and submits empty, the secret is cleared; otherwise the
sentinel round-trips and the server preserves.

Avoid: showing the actual stored credential in any visible state, ever,
including "show password" toggles for stored secrets — those leak via
screenshots and screen-share.

---

## 11. Logout actually logs out

**Rule:** `/auth/logout` must:

1. Delete the session row in `web_sessions`.
2. Call `invalidate_session_cache(token)` so the 60-s memoised entry is
   gone immediately.
3. Frontend clears localStorage token + auth state.

If you add another session store (cookies, IndexedDB), add the same teardown
there. The user clicking "Cerrar sesión" should result in a 401 on the very
next API call from the same browser tab.

---

## 12. Defensive headers stay on

**Rule:** every response goes through `security_headers_middleware` in
[`web/mod.rs`](../src-tauri/src/web/mod.rs). The CSP, X-Frame-Options,
X-Content-Type-Options, and Referrer-Policy headers are non-negotiable.

When adding new external resources (a new CDN for posters, a new analytics
endpoint, an embed), update the CSP in the middleware accordingly — don't
relax it across the board. `'unsafe-inline'` for style/script is the
current compromise for inline styles in the codebase; that's the
high-water mark, not a starting point for new exceptions.

---

## 13. Docker — run as non-root (open TODO, S7)

**Rule:** containers should never run as root in production. This is on
the v0.10.16+ backlog under S7 — it requires a host-side `chown` of
existing `/config` and `/downloads` volumes, which is invasive enough that
it gets its own release with explicit migration notes. Until then:
- The Tauri/Axum process inside the container shouldn't shell out to
  anything that didn't already accept user-controlled input safely.
- Volumes mounted into the container are limited to `/config` and
  `/downloads`. Never expose `/var/run/docker.sock`, `/etc`, or host
  binaries.

---

## Code-review checklist (paste into PR description)

When the diff touches `web/` or anything storing credentials:

- [ ] No new field returns secrets in plaintext — mask via `redact`
- [ ] No new `format!`/`+`-built SQL — `params!` only
- [ ] No new `CorsLayer::permissive()` or `*` in any allow-list
- [ ] If new auth-gated action: rate-limited via `rate_limit::check_login_allowed`
- [ ] If new IP-using logic: uses `client_ip::client_ip`, not raw peer
- [ ] If new token type: `OsRng` + ≥ 128 bits
- [ ] If new session-state change: revokes sessions + invalidates cache
- [ ] If new one-shot token: consumed in single `UPDATE … WHERE … IS NULL` with rows-affected check
- [ ] If new external resource: CSP middleware updated
- [ ] Manual smoke test: failed login 6× → locked; CORS preflight from fake origin → blocked; `/api/<new-endpoint>` from devtools shows no secrets

---

## The "why this matters" page

Internal-only thoughts on why v0.10.14 shipped with these holes:

1. **Velocity-over-care defaults in a desktop-first app.** Oscata started
   as a Tauri desktop tool where the only user is the human at the
   keyboard. When the web GUI was bolted on, the auth model was added but
   the data model — which assumed a single trusted user — wasn't
   re-audited. That mismatch is where the leaks come from.

2. **"It's behind a login" is not a security model.** Anyone with the
   token has full admin. Token theft is the primary threat. Every endpoint
   that returns more than it should, every header that's missing, every
   per-request DB query that could be cached, is part of the post-theft
   blast radius.

3. **Audit early, audit often.** The audit happened *after* the public
   exposure. It should have happened *before*. From now on: any time a
   trust boundary moves (new role of user, new exposure target, new
   embedded surface), open a `docs/` review against this checklist before
   merging.
