# Production deployment

Two supported paths: **Docker Compose** (recommended) or **PM2** on the server.
Pick one. Both serve the web app on `:3000` and the API on `:3001`.

---

## 0. Before anything — secrets (one-time)

The old secrets leaked in git history and have been purged + rotated. You still must:

1. **Rotate the Telegram bot token.** The old token was committed. In Telegram open
   **@BotFather → /revoke → pick the bot**, get a fresh token, and put it in
   `services/auth/.env` as `TELEGRAM_BOT_TOKEN=`.
2. **Set real production values** in `services/auth/.env` (copy from `.env.example`):
   - `NODE_ENV=production`
   - `DATABASE_URL` with a **strong** Postgres password
   - `REDIS_PASSWORD` set (not empty)
   - `JWT_SECRET` / `JWT_REFRESH_SECRET` — already rotated; keep them secret
   - `ENCRYPTION_SECRET` — **do not change** if stores already saved Uzum API keys
     (changing it makes existing keys undecryptable → every store must re-enter their key)
   - `SMS_PROVIDER=eskiz` + `ESKIZ_EMAIL` / `ESKIZ_PASSWORD` (console SMS is dev-only)
   - `CORS_ORIGINS=https://your-real-domain`
3. For the web build set `NEXT_PUBLIC_API_URL` to the **public** API URL
   (it is inlined into the bundle at build time — runtime env won't change it).

Generate fresh secrets if needed:
```bash
openssl rand -hex 48                 # a JWT secret
node -e "console.log(require('crypto').randomBytes(24).toString('base64').replace(/[^a-zA-Z0-9]/g,'').slice(0,32))"  # 32-char ENCRYPTION_SECRET
```

---

## Path A — Docker Compose (Linux server)

Requires Docker + Docker Compose. Create a root `.env` for compose
(`POSTGRES_*`, `REDIS_PASSWORD`, `JWT_*`, `ENCRYPTION_SECRET`, `CORS_ORIGINS`,
`SMS_*`, `NEXT_PUBLIC_API_URL`) — see `.env.example`.

```bash
docker compose build
docker compose up -d
docker compose ps
docker compose logs -f api
```

Then run DB migrations once:
```bash
docker compose exec api npx prisma migrate deploy
```

Services: postgres, redis, api (`:3001`), web (`:3000`), nginx (`:80/:443`).
Health: `curl http://localhost:3001/health` and `/health/ready`.
TLS: drop certs in `nginx/ssl/` and configure `nginx/nginx.conf`.

---

## Path B — PM2 on the server

Requires Node 20+, a running Postgres + Redis, and `pm2` (`npm i -g pm2`).

```bash
# backend
cd services/auth
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build

# frontend
cd ../web
npm ci
NEXT_PUBLIC_API_URL=https://your-api-url npm run build

# start both (from repo root)
cd ..
pm2 start ecosystem.config.js
pm2 save
pm2 startup        # once, as admin, to survive reboot — then `pm2 save` again
```

Useful: `pm2 logs`, `pm2 restart all` (after a new build), `pm2 status`.

---

## After deploy — verify

- `GET /health` → `{ status: "ok" }`
- `GET /health/ready` → `{ status: "ready", db: "up" }`
- Web loads at `:3000`, login sends a real SMS OTP (not console)
- `docker compose logs` / `pm2 logs` show no startup errors

## Redeploying a new version
```bash
git pull
# Docker:  docker compose build && docker compose up -d && docker compose exec api npx prisma migrate deploy
# PM2:     rebuild both (steps above) then `pm2 restart all`
```
