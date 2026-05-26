import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCredentialAuth as useAuth } from "@/_core/hooks/useCredentialAuth";
import { FeatureKey, FEATURE_TO_ROUTES, getFeatureForRoute } from "@/lib/featureAccess";

export interface UseFeatureAccessResult {
  /** Check if a specific feature is accessible */
  hasAccess: (feature: FeatureKey) => boolean;
  /** Check if a route is accessible */
  canAccessRoute: (path: string) => boolean;
  /** Get all accessible features for the current user */
  accessibleFeatures: FeatureKey[];
  /** Get all accessible routes for the current user */
  accessibleRoutes: string[];
  /** Whether permissions are still loading */
  isLoading: boolean;
  /** Any error loading permissions */
  error: Error | null;
}

/**
 * Hook to check feature access permissions for the current user
 * Admins have access to all features
 * Consultants and staff have access based on configured permissions
 */
export function useFeatureAccess(): UseFeatureAccessResult {
  const { user, loading: authLoading } = useAuth();

  // For admins, all features are accessible
  if (user?.role === "admin") {
    return {
      hasAccess: () => true,
      canAccessRoute: () => true,
      accessibleFeatures: [],
      accessibleRoutes: [],
      isLoading: authLoading,
      error: null,
    };
  }

  // For consultants and staff, fetch their permissions using getMyPermissions
  const { data: fullPermissions, isLoading: fullPermissionsLoading, error } = trpc.featureAccess.getMyPermissions.useQuery(
    undefined,
    { enabled: !!user && (user.role === "consultant" || user.role === "staff") }
  );

  const result = useMemo(() => {
    const isLoading = authLoading || fullPermissionsLoading;

    if (!user || user.role === "admin") {
      return {
        hasAccess: () => true,
        canAccessRoute: () => true,
        accessibleFeatures: [],
        accessibleRoutes: [],
        isLoading,
        error: null,
      };
    }

    const perms = fullPermissions || {};
    const allPerms: Record<string, boolean> = {
      patient_records: perms['patient_records'] === true,
      ambient_scribe: perms['ambient_scribe'] === true,
      pharmacy: perms['pharmacy'] === true,
      billing: perms['billing'] === true,
      purchase_orders: perms['purchase_orders'] === true,
      appointments: perms['appointments'] === true,
      notifications: perms['notifications'] === true,
      audit_trail: perms['audit_trail'] === true,
      daily_export: perms['daily_export'] === true,
      user_management: perms['user_management'] === true,
    };

    return {
      hasAccess: (feature: FeatureKey) => {
        return allPerms[feature] === true;
      },
      canAccessRoute: (path: string) => {
        const feature = getFeatureForRoute(path);
        if (!feature) return true; // Routes without feature mapping are always accessible
        return allPerms[feature] === true;
      },
      accessibleFeatures: Object.keys(allPerms).filter(key => allPerms[key] === true) as FeatureKey[],
      accessibleRoutes: Object.keys(allPerms)
        .filter(key => allPerms[key] === true)
        .flatMap(key => FEATURE_TO_ROUTES[key as FeatureKey] || []),
      isLoading,
      error: error as Error | null,
    };
  }, [user, authLoading, fullPermissions, fullPermissionsLoading, error]);

  return result;
}

/**
 * Hook to check if a specific feature is accessible
 */
export function useCanAccessFeature(feature: FeatureKey): boolean {
  const { hasAccess } = useFeatureAccess();
  return hasAccess(feature);
}

/**
 * Hook to check if a specific route is accessible
 */
export function useCanAccessRoute(path: string): boolean {
  const { canAccessRoute } = useFeatureAccess();
  return canAccessRoute(path);
}
