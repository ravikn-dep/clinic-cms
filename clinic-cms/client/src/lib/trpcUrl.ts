/**
 * Resolve tRPC HTTP endpoint. On Manus/preview, the UI must hit the same origin
 * as the Express server (pnpm dev / pnpm start), not a static-only host.
 */
export function getTrpcUrl(): string {
  const configured = import.meta.env.VITE_TRPC_URL as string | undefined;
  if (configured?.trim()) {
    return configured.trim().replace(/\/$/, "");
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/api/trpc`;
  }

  return "/api/trpc";
}
