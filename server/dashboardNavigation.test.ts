import { describe, expect, it } from "vitest";
import { DASHBOARD_NAVIGATION_GROUPS, getVisibleNavigationGroups } from "../client/src/lib/dashboardNavigation";
import { DASHBOARD_TABLET_DRAWER_BREAKPOINT, usesDashboardDrawer } from "../client/src/lib/dashboardShell";

describe("dashboard navigation policy", () => {
  it("keeps the front-desk workflow grouped with New Visit first", () => {
    const workflow = DASHBOARD_NAVIGATION_GROUPS.find((group) => group.label === "Clinic Workflow");
    expect(workflow?.items.map((item) => item.path)).toEqual([
      "/new-visit",
      "/appointments",
      "/patients",
      "/billing",
    ]);
  });

  it("hides admin-only destinations from non-admin users", () => {
    const visible = getVisibleNavigationGroups(DASHBOARD_NAVIGATION_GROUPS, "staff", () => true);
    const paths = visible.flatMap((group) => group.items.map((item) => item.path));
    expect(paths).toContain("/new-visit");
    expect(paths).toContain("/pharmacy");
    expect(paths).not.toContain("/users");
    expect(paths).not.toContain("/feature-access");
    expect(paths).not.toContain("/analytics");
  });

  it("applies feature access without changing the route contract", () => {
    const visible = getVisibleNavigationGroups(
      DASHBOARD_NAVIGATION_GROUPS,
      "consultant",
      (feature) => feature !== "billing",
    );
    const paths = visible.flatMap((group) => group.items.map((item) => item.path));
    expect(paths).toContain("/new-visit");
    expect(paths).toContain("/appointments");
    expect(paths).not.toContain("/billing");
  });

  it("does not promote standalone registration as primary navigation", () => {
    const paths = DASHBOARD_NAVIGATION_GROUPS.flatMap((group) => group.items.map((item) => item.path));
    expect(paths).not.toContain("/register-patient");
  });

  it("uses the existing accessible drawer through tablet portrait while retaining the desktop sidebar at the breakpoint", () => {
    expect(DASHBOARD_TABLET_DRAWER_BREAKPOINT).toBe(1024);
    expect(usesDashboardDrawer(768)).toBe(true);
    expect(usesDashboardDrawer(1023)).toBe(true);
    expect(usesDashboardDrawer(1024)).toBe(false);
  });
});
