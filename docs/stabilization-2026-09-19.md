# Stabilization and deployment — 19 September 2026

## Scope and fixes

- Preserved the earlier FBS acceptance fix: a delivered order must belong to the current invoice number, not merely appear in its original planned contents. Strict accepted-count validation remains enabled.
- FBS Smartup filters now run across all upstream invoice pages before pagination. The filter and global counts share a bounded, deduplicated, cached invoice catalog. Changing filters resets the UI page.
- Partial imports and successful rows without a saved deal ID no longer count as fully imported. Row badges and global counts agree. A failed database status lookup is reported instead of displaying every invoice as unimported.
- Individual-order imports invalidate invoice rows, details, orders and aggregate counts.
- FBO exports use each SKU's accepted quantity, not the planned warehouse quantity. Zero-accepted lines are excluded; unknown, invalid, negative or fractional accepted quantities stop the entire import. Empty accepted contents never reach Smartup.
- Transient refresh failures (network, timeout, rate limit, server failure) do not erase the saved login. Definitively rejected refresh credentials still log out. Concurrent requests share refresh, late requests reuse a rotated access token, and delayed results cannot overwrite a logout or another account.
- Login restoration offers a retry on temporary failure rather than asking for another OTP. Corrupt/unavailable browser storage no longer prevents hydration. The configured production refresh lifetime remains 365 days.
- Nginx API read timeout increased from 90 to 330 seconds to cover the existing 300-second Smartup browser deadline.

## Verification

- Backend: all 122 tests in 13 suites passed.
- Frontend session interceptor: all 12 deterministic tests passed (`node --test tests/api-client.test.cjs` from `web`).
- Backend and frontend production builds passed locally and on the server. Targeted frontend ESLint and whitespace checks passed.
- The existing Next.js image-proxy runtime re-export warning remains non-blocking; the runtime defaults to Node.js. No unrelated route changes were deployed.
- Production migrations: 12 migrations, database up to date. PostgreSQL readiness and Redis PING passed; Telegram `getMe` succeeded.
- Live read-only API smoke passed: authenticated session validation, anonymous access rejection, disabled password-login route, admin listing without password hashes, Smartup client settings, global FBS filters/count consistency, FBO invoice list and SKU details, missing-XID filtering, Smartup product/price lookup.
- In the connected owner store, global FBS counts covered 234 invoices over 12 upstream pages. Filter totals matched count totals. These are persisted import states, not a fresh bulk re-check of every remote Smartup document.
- Live FBO list returned 18 invoices. A sample detail returned one accepted SKU with 10 accepted / 10 planned units.
- Product preflight: 161 of 176 SKUs ready, 15 missing XID, 0 missing Smartup price. The missing-XID product filter returned 5 products. Missing mappings require the owner's actual Smartup XIDs; no mappings were guessed.
- Browser verification: login rendered; an anonymous visit to `/supplies` redirected to login. No real OTP login, user deletion/blocking, or real order import was performed as a test.

## Deployment and recovery

- Production: `https://uzum.amirjonkarimov.uz`.
- Release archive: `.cache/deploy/stabilization-20260919.tar.gz`, SHA256 `f46a0caf50d03ca31709c48ef4dec605e890e5f5e2f65dcda26e4f95e51dbff2`.
- Only eight task-scoped runtime source files were deployed; other local and production changes were preserved.
- Backup: `/var/backups/uzum-dashboard/stabilization-20260919` contains source, compiled backend, database dump, original nginx configuration and the previous frontend build (`next-before`). Backup checksums passed before activation.
- Frontend built in an isolated staging directory, then activated after build success. Old hashed assets were retained for already-open browser tabs.
- `uzum-auth` and `uzum-web` were reloaded and PM2 state saved. Public readiness returned `ready` / `db: up`.
- Existing Smartup documents and user business records were not modified or deleted by the verification workflow. No database restore is necessary for a code-only rollback.
