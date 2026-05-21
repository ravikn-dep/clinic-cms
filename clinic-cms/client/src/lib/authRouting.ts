/**
 * Credential-based login routing. Clinic CMS never redirects browsers to Manus OAuth;
 * all hosts (localhost, *.manus.computer, custom domains) use /login.
 */

export const LOGIN_PATH = "/login";

/** Legacy paths kept for bookmarks; all resolve to LOGIN_PATH. */
export const LEGACY_LOGIN_PATHS = [
  "/direct-login",
  "/password-login",
  "/qr-login",
] as const;

export function normalizePathname(pathname: string): string {
  if (!pathname) return "/";
  const withoutTrailing = pathname.replace(/\/+$/, "") || "/";
  return withoutTrailing.startsWith("/") ? withoutTrailing : `/${withoutTrailing}`;
}

export function isLoginPath(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  if (normalized === LOGIN_PATH) return true;
  return (LEGACY_LOGIN_PATHS as readonly string[]).includes(normalized);
}

/** Always same-origin username/password login — never external OAuth. */
export function getLoginUrl(): string {
  return LOGIN_PATH;
}

/**
 * Clinic CMS uses direct login on every host. Manus may inject VITE_OAUTH_PORTAL_URL
 * in hosted builds; ignore it and never branch to OAuth here.
 */
export function shouldUseOAuthLogin(): boolean {
  return false;
}

export function isDirectLoginHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (!host) return true;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  if (host.endsWith(".manus.computer") || host.endsWith(".manus.space")) return true;
  // Custom clinic domains and any other production host use direct login.
  return true;
}
