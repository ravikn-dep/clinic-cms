import { afterEach, describe, expect, it, vi } from "vitest";

// Provide deterministic test-only Forge config so storagePut reaches its presign
// path in CI (where BUILT_IN_FORGE_* are unset). Real ENV is otherwise preserved;
// production config validation in getForgeConfig() is unchanged. No real creds.
vi.mock("./_core/env", async (importActual) => {
  const actual = await importActual<typeof import("./_core/env")>();
  return { ...actual, ENV: { ...actual.ENV, forgeApiUrl: "https://forge.test", forgeApiKey: "test-key" } };
});

import { storagePut } from "./storage";

describe("storagePut error handling", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sanitizes an HTML presign response and does not attempt an upload", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<html><h1>Forbidden</h1></html>", { status: 403 }));

    await expect(storagePut("consultants/21/logo.png", new Uint8Array([1, 2, 3]), "image/png"))
      .rejects.toThrow("Unable to prepare consultant image upload");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sanitizes an invalid JSON presign response", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("not-json", {
      status: 200,
      headers: { "content-type": "text/html" },
    }));

    await expect(storagePut("consultants/21/signature.png", new Uint8Array([1, 2, 3]), "image/png"))
      .rejects.toThrow("Unable to prepare consultant image upload");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
