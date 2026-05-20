export const STORAGE_URL_MARKER = "/manus-storage/";

export function keyFromStorageUrl(url?: string | null) {
  if (!url) return undefined;
  const markerIndex = url.indexOf(STORAGE_URL_MARKER);
  if (markerIndex < 0) return undefined;

  const rawKey = url.slice(markerIndex + STORAGE_URL_MARKER.length);
  if (!rawKey) return undefined;

  const [withoutHash] = rawKey.split("#", 1);
  const [withoutQuery] = withoutHash.split("?", 1);
  return withoutQuery || undefined;
}

export function resolveArtifactStorageKey(input: { key?: string | null; url?: string | null }) {
  const explicitKey = input.key?.trim();
  if (explicitKey) return explicitKey;
  return keyFromStorageUrl(input.url);
}
