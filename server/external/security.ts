import { createHmac, timingSafeEqual } from "node:crypto";

export type ExternalApiScope =
  | "health:read"
  | "patients:read"
  | "patients:write"
  | "consultants:read"
  | "appointments:read"
  | "appointments:write"
  | "appointments:complete";

export type ExternalApiKey = {
  secret: string;
  scopes: ExternalApiScope[];
  active: boolean;
};

export type ExternalApiKeyring = Record<string, ExternalApiKey>;

export function getExternalApiKeyring(rawValue = process.env.EXTERNAL_API_HMAC_KEYS): ExternalApiKeyring {
  if (!rawValue?.trim()) return {};

  try {
    const parsed = JSON.parse(rawValue) as ExternalApiKeyring;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    return Object.fromEntries(Object.entries(parsed).filter(([keyId, value]) => {
      return Boolean(keyId)
        && Boolean(value)
        && typeof value.secret === "string"
        && value.secret.length >= 32
        && Array.isArray(value.scopes)
        && typeof value.active === "boolean";
    }));
  } catch {
    return {};
  }
}

export function isExternalApiConfigured(rawValue = process.env.EXTERNAL_API_HMAC_KEYS): boolean {
  return Object.keys(getExternalApiKeyring(rawValue)).length > 0;
}

export function createExternalRequestSignature(
  secret: string,
  timestamp: string,
  requestId: string,
  method: string,
  path: string,
  rawBody: string,
): string {
  const payload = [timestamp, requestId, method.toUpperCase(), path, rawBody].join(".");
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function signaturesMatch(expectedHex: string, receivedHex: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(expectedHex) || !/^[a-f0-9]{64}$/i.test(receivedHex)) return false;
  return timingSafeEqual(Buffer.from(expectedHex, "hex"), Buffer.from(receivedHex, "hex"));
}
