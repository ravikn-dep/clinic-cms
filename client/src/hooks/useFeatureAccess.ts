import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
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
    { enabled: !!user && user.role !== "admin" }
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

    return {
      hasAccess: (feature: FeatureKey) => {
        return perms[feature] === true;
      },
      canAccessRoute: (path: string) => {
        const feature = getFeatureForRoute(path);
        if (!feature) return true; // Routes without feature mapping are always accessible
        return perms[feature] === true;
      },
      accessibleFeatures: Object.entries(perms)
        .filter(([_, allowed]) => allowed === true)
        .map(([key]) => key as FeatureKey),
      accessibleRoutes: Object.entries(perms)
        .filter(([_, allowed]) => allowed === true)
        .flatMap(([key]) => FEATURE_TO_ROUTES[key as FeatureKey] || []),
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
