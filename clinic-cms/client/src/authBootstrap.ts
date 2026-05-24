/**
 * Runs before React — blocks legacy Manus OAuth redirects on any host (including custom domains).
 */
import { LOGIN_PATH, normalizePathname } from "@/lib/authRouting";

function shouldForceLoginRoute(): boolean {
  if (typeof window === "undefined") return false;

  const path = normalizePathname(window.location.pathname);
  if (
    path.startsWith("/api/oauth") ||
    path.startsWith("/app-auth") ||
    path.startsWith("/manus-oauth")
  ) {
    return true;
  }

  const href = window.location.href.toLowerCase();
  if (
    href.includes("/app-auth") ||
    href.includes("/api/oauth/callback") ||
    href.includes("/manus-oauth/")
  ) {
    return true;
  }

  return false;
}

if (shouldForceLoginRoute()) {
  window.location.replace(LOGIN_PATH);
}
