# Self-hosting Clinic CMS (no Manus)

Clinic CMS runs as a **standalone Node.js application**. You do not need Manus for hosting, login, or storage.

## Requirements

- Node.js 20+
- MySQL 8+ (or MariaDB)
- Optional: S3-compatible bucket for production file storage

## Quick start (local)

```bash
cd clinic-cms
copy .env.example .env
# Edit DATABASE_URL and JWT_SECRET

# Start MySQL, then:
pnpm install
pnpm db:push
pnpm seed:admin
pnpm dev
```

Open http://localhost:3000/login — default admin from seed script (`admin@max` / `admin123` unless changed).

## Production deploy

1. **Server** — VPS or PaaS (Railway, Render, Fly.io, DigitalOcean).
2. **Build & run:**
   ```bash
   pnpm install
   pnpm db:push
   pnpm build
   NODE_ENV=production pnpm start
   ```
3. **Process manager** — PM2 or systemd keeps `node dist/index.js` running.
4. **Reverse proxy** — Nginx/Caddy terminates HTTPS and proxies to port 3000.
5. **DNS** — `app.yourclinic.com` → your server (A record or CNAME).
6. **TLS** — Let’s Encrypt via Caddy or Certbot.

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | MySQL connection string |
| `JWT_SECRET` | Yes | Session cookies (32+ chars) |
| `S3_BUCKET` + AWS keys | Prod recommended | File uploads (QR, PDFs, audio) |
| `AI_API_URL` + `AI_API_KEY` | For scribe/OCR | OpenAI-compatible API |
| `GOOGLE_MAPS_API_KEY` | Optional | Map component |
| `NOTIFY_WEBHOOK_URL` | Optional | Owner alerts |
| `GOOGLE_DRIVE_*` | Optional | 6-week archive feature |

**Never set** `VITE_OAUTH_PORTAL_URL` — login is always username/password at `/login`.

## File storage

- **Development:** files stored under `clinic-cms/uploads/`, served at `/files/...`
- **Production:** set `S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and optionally `S3_ENDPOINT` for MinIO.
- Legacy URLs `/manus-storage/...` still work as aliases.

## Custom domain checklist

1. DNS points to **your** server, not a third-party app-auth portal.
2. `https://your-domain/api/health` returns JSON `{"ok":true,...}`.
3. `https://your-domain/login` shows the Clinic CMS login form.

## Migrating off Manus

1. Export MySQL from Manus DB panel (or use existing dump).
2. Copy uploaded files from Manus storage to S3 or local `uploads/` (match storage keys in DB).
3. Deploy this repo with `.env` configured.
4. Run `pnpm db:push` and verify modules.

See also: `CUSTOM_DOMAIN_DIRECT_LOGIN.md`, `ARCHIVE_GOOGLE_DRIVE.md`, `LOCAL_AUTH_SETUP.md`.
