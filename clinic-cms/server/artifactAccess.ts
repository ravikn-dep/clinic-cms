export const STORAGE_URL_MARKERS = ["/files/", "/manus-storage/"] as const;

export function keyFromStorageUrl(url?: string | null) {
  if (!url) return undefined;

  for (const marker of STORAGE_URL_MARKERS) {
    const markerIndex = url.indexOf(marker);
    if (markerIndex < 0) continue;

    const rawKey = url.slice(markerIndex + marker.length);
    if (!rawKey) continue;

    const [withoutHash] = rawKey.split("#", 1);
    const [withoutQuery] = withoutHash.split("?", 1);
    return withoutQuery || undefined;
  }

  return undefined;
}

export function resolveArtifactStorageKey(input: {
  key?: string | null;
  url?: string | null;
}) {
  const explicitKey = input.key?.trim();
  if (explicitKey) return explicitKey;
  return keyFromStorageUrl(input.url);
}
