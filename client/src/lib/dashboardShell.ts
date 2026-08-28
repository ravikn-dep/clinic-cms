export const DASHBOARD_TABLET_DRAWER_BREAKPOINT = 1024;

export function usesDashboardDrawer(viewportWidth: number): boolean {
  return viewportWidth < DASHBOARD_TABLET_DRAWER_BREAKPOINT;
}
