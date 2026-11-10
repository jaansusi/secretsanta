# Security audit (November 2026)

A full review of the application, its dependencies, container image, local infrastructure and CI, done against
`master` after the admin CMS rewrite (jaansusi/secretsanta#61). Every finding marked *reproduced* was confirmed
against running code. All fixes were re-tested against the production Docker image with Postgres 18, plus a
Playwright run of the real UI. The fixes ship in the same change as this document.

Severity: **Critical**: anyone on the internet can read assignments or take over the app. **High**: serious
compromise or outage with a small precondition. **Medium / Low**: defense in depth, hardening.

## Already addressed by #61

The admin rewrite fixed several problems an earlier pass of this audit had found in the old code, so they are not
repeated below:

- The old unauthenticated JSON endpoints (`GET/POST/DELETE /user`, `/family`) are gone. `GET /user` returned
  every decryption code. The new `/api/admin/*` API is behind `AdminGuard` on every controller.
- Admin access moved to a signed `santa_admin` cookie instead of the forgeable `santa_auth` user id.
- The stored XSS in the old families page (`onclick="…('{{name}}')"`) went away with the page. The new admin UI
  escapes every interpolated value through its `html` template helper.
- `GET /admin/generate` (CSRF-able redraw) is gone. Destructive draw actions are POSTs that need a typed confirmation word.
- The draw shuffles with `crypto.randomInt`.

## Findings and fixes

### Critical

| # | Finding | Fix |
|---|---------|-----|
| C1 | **Anyone can read anyone's code and recipient** *(reproduced on master)*. The public site still identifies participants by `santa_auth`, a plain, unsigned user id readable by JavaScript. Setting `santa_auth=2` in any browser renders participant 2's page with their secret code prefilled. Posting that code to `/result` reveals who they give to. Iterating the id dumps the whole draw. The same cookie selects whose recipient's photo/audio `/dossier/*` serves and whom `/track` events are filed under. | Participant sessions are an HMAC-signed (`COOKIE_SECRET`), `HttpOnly`, `SameSite=Lax`, `Secure` (on https) cookie `santa_session` holding `<userId>.<expiry>`, enforced server-side (`src/auth/session.service.ts`). `santa_auth` is ignored everywhere and cleared on sight. |

### High

| # | Finding | Fix |
|---|---------|-----|
| H1 | **Public site down on Linux** *(reproduced)*. `index.hbs` and `letter.hbs` include the partial `hoverIcons`, but the file is `hovericons.hbs`. On a case-sensitive filesystem (the Linux Docker image) `/` and `/kiri` answer `500` on every request. | File renamed to `hoverIcons.hbs`. |
| H2 | **Stored XSS via dossier uploads.** `POST /api/admin/participants/:id/dossier/:kind` stores the client-declared MIME type and serves it back from the app's origin, so an `image/svg+xml` "photo" runs script in the admin's or the Santa's session. | Uploads are sniffed by magic bytes against an allowlist (JPEG/PNG/GIF/WebP/AVIF/HEIC, MP3/OGG/WAV/FLAC/WebM/M4A) and the *detected* type is stored (`src/dossier/file-type.ts`). Assets are served with `nosniff` and a `sandbox` CSP. Legacy rows of any other type are sent as `application/octet-stream` downloads. |
| H3 | **Decryption codes in the logs.** Sequelize logged every SQL statement and the logger was fixed at debug, so every `WHERE "decryptionCode" = '…'` lookup went to the log stream. | SQL logging is off unless `DB_LOGGING=true`. Log level defaults to `info` in production (`LOG_LEVEL`). Verified: zero codes or SQL lines in the logs after a draw + reveal. |

### Medium

| # | Finding | Fix |
|---|---------|-----|
| M1 | **Google OAuth without `state` or PKCE.** That allows login CSRF and authorization-code injection. The email's `verified` flag is not checked. `accessType: offline` requests refresh tokens that are then carried in `req.user`. | `state` + PKCE (S256) kept in a short-lived signed cookie (`src/auth/oauth-state.store.ts`). Only a Google-verified email is accepted, and no offline access is requested. Emails are normalized (case, Gmail dots/`+tags`) and matched case-insensitively. |
| M2 | **Session hardening.** `santa_admin` holds a bare user id: once stolen it stays valid until `COOKIE_SECRET` changes (the 30-day `maxAge` is only a browser hint). Sign-out (`/auth/logout`, `/admin/logout`) is a GET, so any link or `<img>` triggers it. The post-login return path cookie is unsigned. | Admin cookie value is `<userId>.<expiry>` with a 7-day server-enforced expiry. Old-format cookies are rejected, so admins sign in once more. Both sign-outs are POST forms. The return-to cookie is signed and re-validated. |
| M3 | **CSRF defense in depth.** `SameSite=Lax` alone protected the admin API. | Middleware rejects POST/PUT/PATCH/DELETE whose `Origin` / `Sec-Fetch-Site` show a cross-site request (`src/security/origin-check.middleware.ts`), including `Origin: null` from cross-site contexts. |
| M4 | **No security headers.** There was no CSP, `X-Powered-By: Express` was set, and there was no `Referrer-Policy` on the public site even though codes travel in URLs. The public page had inline `onclick` handlers and an inline `<script>` carrying the clip playlist. | `helmet` with a strict CSP (`script-src 'self'; script-src-attr 'none'`, `frame-ancestors 'none'`, …), `Referrer-Policy: no-referrer`, HSTS on https, `Cache-Control: no-store` on dynamic responses. Handlers moved into `index.js` and the playlist into a `data-` attribute. Verified with Playwright on every admin page and the reveal flow: no CSP violations. |
| M5 | **Unpinned third-party code.** `toastify-js` loads from jsDelivr with no version and no SRI (any npm publish executes on the reveal page). Bootstrap Icons (public site and admin panel) load without SRI. | Bootstrap, Bootstrap Icons and Toastify are npm dependencies (locked in `yarn.lock`, audited, Dependabot-managed) served same-origin from `/vendor/*`. Google Fonts CSS is the only third-party asset left. |
| M6 | **Letter URL.** The admin setting `letterUrl` accepted any `http(s)` URL, which is embedded in an iframe. | Must be `https://`. The CSP `frame-src` is computed per request from the current setting, so only that origin can be framed. |
| M7 | **Codes in URLs.** `/?code=…` stays in the address bar and history and is sent as a `Referer`. | A valid code link starts a session and `303`-redirects to `/`. `Referrer-Policy: no-referrer` also applies. |
| M8 | **Type confusion in code lookups.** `findOne({ where: { decryptionCode: request.query.code } })` turns `?code=a&code=b` (or a JSON array) into an `IN (…)` lookup. After a cleared draw (`decryptionCode = ''`), an array containing `''` matches participants. | Code lookups accept only a plausible string (`UserService.getByDecryptionCode`). Global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`) for DTO-typed bodies. |
| M9 | **Weak default secret.** `.env.template` shipped `COOKIE_SECRET=1234567890`, and a missing secret only produced a warning. | Startup fails in production without a random secret of 32+ characters (`src/config/env.ts`). The template explains how to generate one. |
| M10 | **Vulnerable dependency.** `hbs` ≤ 4.4.0 has CVE-2021-32822 (file disclosure) with no patched release. | Replaced by `express-handlebars` 9. |
| M11 | **No rate limiting.** | `@nestjs/throttler`: 300 req/min/IP globally, 30/min on endpoints that look a user up by code. Set `TRUST_PROXY` behind a proxy. |
| M12 | **Santa clips could be enumerated** *(reproduced)*. Generated clips were served at `/santa-audio/<id>.mp3` with sequential ids and no auth, so anyone could count through them and hear every participant's name line. The script-era clips were also served statically from `public/audio/santa/` under guessable names (`name-<first>-<last>-N.mp3`), letting anyone confirm a suspected participant. That reveals the participant list, not the pairs. | Clip URLs are signed: `/santa-audio/<id>.<generatedAt>.<signature>.mp3`, a 128-bit HMAC keyed from `COOKIE_SECRET`. Unsigned, tampered or re-used-signature URLs give `404`, and regenerating a clip retires its old URL, so cache-forever headers stay correct. On top of the signed URL, a *name* clip is only served to an admin session or to the session of that participant's own Santa (`404` otherwise) and is cached privately, so a shared or leaked link plays for nobody else. The script-era folder moved to `scripts/santa-audio/clips/` (not served) and is still imported into the database on startup. |

### Low

| # | Finding | Fix |
|---|---------|-----|
| L1 | A plaintext copy of assignments (`giftingToDebug`) is written whenever `NODE_ENV=development` (the template default), by the draw and by participant renames. | Also requires `STORE_DEBUG_ASSIGNMENTS=true`. |
| L2 | DOM XSS sink: `pageUrl.innerHTML = window.location.href`. | `textContent`. |
| L3 | `compose.yaml` publishes Postgres and pgAdmin on all interfaces, uses `:latest`, and ships default passwords. | Bound to `127.0.0.1`, images pinned by digest, pgAdmin behind the `tools` profile, DB password required. |
| L4 | Container: floating base tag, install scripts run, Node 22 (Jest cannot load the ESM-only NestJS 12 there, so the test suite could not run). CI: actions pinned to mutable tags, checkout persists the token, no test/audit job. | Base image pinned by digest on Node 26 LTS, `--ignore-scripts`, no yarn/npm globals in the runtime image. Actions pinned to commit SHAs, `persist-credentials: false`. New `ci.yml` (build, tests, production-dependency audit, dependency review) and Dependabot for npm, Docker, Compose and Actions. |
| L5 | Reveal errors went to `console.error`. Optional TLS to the database was not supported. | Logged through the app logger. `DB_SSL=true` (certificate verified), `DB_SSL_CA` for a private CA. |

## Verification performed

Production image + Postgres 18, with master's code run side by side for the "before" picture:

- **Before (master):** `santa_auth=2` with no login rendered Anu's page with her full code, and `/result` with that code revealed her recipient.
- **After:** the same forged cookie gives the anonymous page, and `/dossier/photo` with a forged cookie gives `404` while the real session gets `200`.
- Admin API returned `401` for: no cookie, the old id-only admin cookie, a wrong-key signature, an expired cookie, an unsigned `santa_admin=1`, the *admin's own participant session from a code link*, and a non-admin user's signed cookie.
- Cross-origin POST/DELETE/PUT with a valid admin cookie returned `403`, including `Origin: null` + `Sec-Fetch-Site: cross-site`.
- SVG uploads (honest, and disguised as PNG) were rejected. A PNG declared as `text/html` was stored as `image/png`. Assets are served sandboxed.
- `letterUrl` set to `http:` or `javascript:` was rejected. Changing it to another https host moved the CSP `frame-src` immediately.
- `?code=` gives a `303` and an `HttpOnly; SameSite=Lax` session. An array (even one containing the valid code), an object or an unknown code gives no session.
- OAuth start sends `state` + S256 `code_challenge`. A forged-state callback returns `401`. `/admin/login?next=//evil.com` falls back to `/admin`.
- Logs contained no decryption code and no SQL.
- `/santa-audio/1.mp3` through `5.mp3`, the old `?v=` form and the old static `/audio/santa/name-*.mp3` paths all gave `404`. A signed URL from the admin API gave `200`, the same signature on a neighbouring id and a tampered signature gave `404`. The same signed name-clip URL gave `404` with no session, with another participant's session and with the named participant's own session, and `200` for their Santa and for an admin. The Santa's reveal played intro, name line and outro (`206` range responses).
- Playwright: all 11 admin pages render, sign-out works, the reveal (with photo) and logout work, the session cookie is not readable from `document.cookie`, and there were zero CSP violations or JS errors.
- `yarn test`: 67 tests in 11 suites (including #61's draw, Santa audio and agency-facts specs) pass on Node 26. `yarn audit --groups dependencies`: 0 vulnerabilities.

## Residual risks and recommendations

1. **Assignments are not encrypted at rest.** Since #61, `giftingTo` is base64 (by design, "keeps names from being readable at a glance… nothing more"), and `decryptionCode` is stored in plaintext. Anyone with database access (pgAdmin, backups, a DB compromise) can read the whole draw, and so can anyone who can read the admin API's personal links. Treat DB and admin access as knowing every assignment. Real protection would mean the server not holding the codes (hash them and require participants to type theirs, giving up auto-reveal after Google login) or encrypting with a key held outside the database.
2. **Stateless sessions** cannot be revoked one by one. Deleting a user or removing admin rights takes effect immediately (checked per request), but a stolen cookie for an existing user stays valid until it expires (participant 30 days, admin 7 days). Rotate `COOKIE_SECRET` to sign everyone out.
3. `/dossier/audio?code=…` still accepts the code in the query string, because the page fetches the hand-made clip in the same click that submits the code, before a session exists. It is same-origin and `no-referrer`, but it can appear in proxy access logs.
4. `synchronize: true` lets the app alter its schema at startup. Consider migrations and a DB user without DDL rights.
5. The rate limiter is in-memory per replica. Use a shared store if the app is scaled out, and set `TRUST_PROXY` correctly or all clients share one bucket.
6. `style-src 'unsafe-inline'` remains (inline `style` attributes in templates, Bootstrap, the admin UI). Risk is low because script is locked down.
7. **Dev-only advisories not fixed:** `minimatch` (ReDoS), `glob` and `deepmerge`, pulled in by jest / eslint / @nestjs/cli. They never process untrusted input and are not in the image. The only fixes are cross-major overrides that risk breaking the toolchain, and for `glob` they would hit `sequelize-typescript`'s runtime `glob@7`. Dependabot will propose updates.
8. TypeScript 7 (native compiler) not adopted: the Nest CLI and ts-jest depend on the TypeScript 6 JS API. The ESLint baseline (Prettier formatting errors) predates this audit and was left untouched to keep the change reviewable.
