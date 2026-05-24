# Google Drive archive (6-week auto backup)

Clinic CMS can zip all storage-backed clinical files (patient barcodes/QR codes, consultation audio, bill PDFs, user login QR codes) and upload the archive to Google Drive. Source files in Forge/S3 are **not deleted** — this is a copy-only backup.

## Prerequisites

- Google Cloud project with **Google Drive API** enabled
- OAuth 2.0 **Web application** client
- MySQL migrations applied (`archiveRuns`, `googleDriveTokens` tables)
- `JWT_SECRET` set (used to encrypt stored OAuth tokens)

## Google Cloud Console setup

1. Open [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Library → enable **Google Drive API**.
2. APIs & Services → Credentials → **Create credentials** → OAuth client ID → **Web application**.
3. Authorized redirect URIs (must match production URL exactly):
   - `https://YOUR-DOMAIN/api/archive/google/callback`
   - For local dev: `http://localhost:3000/api/archive/google/callback` (or your dev port)
4. Copy **Client ID** and **Client secret**.

## Environment variables

Add to `.env` on the server (never commit secrets):

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_DRIVE_CLIENT_ID` | Yes | OAuth client ID |
| `GOOGLE_DRIVE_CLIENT_SECRET` | Yes | OAuth client secret |
| `GOOGLE_DRIVE_REDIRECT_URI` | Yes | e.g. `https://your-clinic.example/api/archive/google/callback` |
| `GOOGLE_DRIVE_FOLDER_ID` | No | Parent Drive folder ID; archives go in dated subfolders under this |
| `ARCHIVE_CRON_ENABLED` | No | Set `true` to enable scheduled checks (production only) |
| `ARCHIVE_INTERVAL_WEEKS` | No | Default `6` — minimum weeks between completed archives |
| `JWT_SECRET` | Yes | Encrypts refresh/access tokens at rest |
| `BUILT_IN_FORGE_API_URL` / `BUILT_IN_FORGE_API_KEY` | Yes | Required to download files from storage for zipping |

## Database migration

```bash
pnpm db:baseline
# or apply drizzle/0017_archive_google_drive.sql manually
```

Tables:

- `archiveRuns` — run history (status, file count, size, Drive file id)
- `googleDriveTokens` — single row `id=default` with encrypted OAuth tokens

## First-time admin connect

1. Sign in as **admin**.
2. Open **Archive** in the sidebar (`/archive`).
3. Click **Connect Google Drive** and complete Google consent (offline access / refresh token).
4. You are redirected back to `/archive?connected=1`.
5. Click **Run archive now** to verify zip + upload.

OAuth callback route: `GET /api/archive/google/callback` (handled by Express, not tRPC).

## Scheduled runs

When `ARCHIVE_CRON_ENABLED=true` and `NODE_ENV=production`:

- A cron job runs **daily at 02:00 UTC**.
- If the last **completed** archive was at least `ARCHIVE_INTERVAL_WEEKS` ago (default 6), a new job starts automatically.
- Requires Google Drive to already be connected.

## Manus / deploy notes

- Set all `GOOGLE_DRIVE_*` env vars in the Manus/hosting dashboard before connecting.
- `GOOGLE_DRIVE_REDIRECT_URI` must use the **public HTTPS** hostname users reach (custom domain), not an internal port.
- Ensure the Node process stays running in production so cron can fire (`pnpm start` after `pnpm build`).
- Large clinics: first archive may take several minutes; avoid overlapping runs (only one `running` job at a time).
- Token encryption uses `JWT_SECRET`; rotating `JWT_SECRET` invalidates stored Drive tokens — reconnect Google Drive after rotation.

## API (admin tRPC)

| Procedure | Description |
|-----------|-------------|
| `archive.getStatus` | Connection, last run, cron config, due flag |
| `archive.listRuns` | Recent `archiveRuns` rows |
| `archive.getGoogleAuthUrl` | Returns Google OAuth URL |
| `archive.disconnectGoogleDrive` | Removes stored tokens |
| `archive.runNow` | Manual archive job |

## What is archived

Unique storage keys from:

- `patients` — barcode / QR images
- `consultations` — audio files
- `bills` — invoice / receipt PDFs
- `users` — login QR images

Each zip includes `manifest.json` with counts and timestamp. Upload folder name: `Clinic-CMS-Archive-YYYY-MM-DD`.
