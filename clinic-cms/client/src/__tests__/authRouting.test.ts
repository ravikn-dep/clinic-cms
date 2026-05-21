import { describe, expect, it } from "vitest";
import {
  getLoginUrl,
  isDirectLoginHost,
  isLoginPath,
  LEGACY_LOGIN_PATHS,
  LOGIN_PATH,
  normalizePathname,
  shouldUseOAuthLogin,
} from "@/lib/authRouting";

describe("authRouting", () => {
  it("uses /login as the only sign-in path", () => {
    expect(LOGIN_PATH).toBe("/login");
    expect(getLoginUrl()).toBe("/login");
    expect(getLoginUrl()).not.toMatch(/^https?:\/\//);
    expect(getLoginUrl()).not.toContain("oauth");
    expect(getLoginUrl()).not.toContain("app-auth");
  });

  it("never enables OAuth login", () => {
    expect(shouldUseOAuthLogin()).toBe(false);
  });

  it("treats legacy login URLs as login paths", () => {
    for (const path of LEGACY_LOGIN_PATHS) {
      expect(isLoginPath(path)).toBe(true);
    }
    expect(isLoginPath("/login/")).toBe(true);
    expect(isLoginPath("/login")).toBe(true);
    expect(isLoginPath("/")).toBe(false);
  });

  it("normalizes trailing slashes", () => {
    expect(normalizePathname("/login/")).toBe("/login");
    expect(normalizePathname("/")).toBe("/");
  });

  it("uses direct login on Manus preview and custom domains", () => {
    expect(isDirectLoginHost("localhost")).toBe(true);
    expect(isDirectLoginHost("3000-abc.sg1.manus.computer")).toBe(true);
    expect(isDirectLoginHost("docm-clinic-cms.manus.space")).toBe(true);
    expect(isDirectLoginHost("app.orthodocsdeepthi.in")).toBe(true);
  });
});
