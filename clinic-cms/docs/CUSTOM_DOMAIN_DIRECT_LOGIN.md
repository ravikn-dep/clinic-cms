# Custom domain direct login (app.orthodocsdeepthi.in)

## Problem

If `https://app.orthodocsdeepthi.in/` redirects to `https://manus.im/app-auth?...`, the custom domain is bound to **Manus platform login**, not to your **Clinic CMS Node app**.

The Clinic CMS code uses username/password at `/login` only. That code never runs until the domain serves your published website (Express + `pnpm start` / `pnpm dev`).

## Verify

Open these in the browser:

| URL | Wrong (Manus OAuth) | Correct (Clinic CMS) |
|-----|---------------------|----------------------|
| `/login` | Manus CDN page, “Login with Manus” | “Clinic Management System”, fields for email/user ID + password |
| `/api/health` | HTML or Manus page | JSON: `{"ok":true,"service":"clinic-cms",...}` |

Quick check:

```text
https://app.orthodocsdeepthi.in/api/health
```

Must return JSON, not HTML.

## Fix in Manus Management UI (required)

1. Open your project **Management UI** → **Publish** / **Domain** settings.
2. Find the custom domain `app.orthodocsdeepthi.in`.
3. Point it to the **published website** (checkpoint / Node server), not the Manus “App auth” portal.
4. If there is an option like **“Require Manus sign-in”** or **“Platform authentication”**, turn it **off** for this domain.
5. **Publish** again after the latest code is on `main` (commits `cfb7371`, `bf658a1`).
6. Ensure the server runs: `pnpm build` then `pnpm start` (or your host’s equivalent). Static-only hosting will not serve `/login` or `/api/trpc`.

## After the domain hits your app

Staff should use:

```text
https://app.orthodocsdeepthi.in/login
```

Sign in with email, username, or user ID (e.g. `admin@max` / `admin123` after `pnpm seed:admin`).

Legacy Manus OAuth paths redirect to `/login`:

- `/api/oauth/*`
- `/manus-oauth/*`
- `/app-auth/*`

## Environment

Do **not** set on production:

- `VITE_OAUTH_PORTAL_URL`

Do set:

- `DATABASE_URL`
- `JWT_SECRET` (16+ characters)

## Code reference

Direct login routing: `client/src/lib/authRouting.ts` — `getLoginUrl()` always returns `/login`.
