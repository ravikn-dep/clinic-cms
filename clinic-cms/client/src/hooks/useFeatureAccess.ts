import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCredentialAuth as useAuth } from "@/_core/hooks/useCredentialAuth";
import {
  FeatureKey,
  FEATURE_TO_ROUTES,
  ADMIN_ONLY_ROUTES,
  getFeatureForRoute,
  FEATURE_KEYS,
} from "@/lib/featureAccess";

export interface UseFeatureAccessResult {
  hasAccess: (feature: FeatureKey) => boolean;
  canAccessRoute: (path: string) => boolean;
  accessibleFeatures: FeatureKey[];
  accessibleRoutes: string[];
  isLoading: boolean;
  error: Error | null;
}

export function useFeatureAccess(): UseFeatureAccessResult {
  const { user, loading: authLoading } = useAuth();

  const { data: effectivePermissions, isLoading: permissionsLoading, error } =
    trpc.featureAccess.getMyPermissions.useQuery(undefined, {
      enabled: !!user && (user.role === "consultant" || user.role === "staff"),
    });

  return useMemo(() => {
    const isLoading =
      authLoading || (!!user && user.role !== "admin" && permissionsLoading);

    if (!user) {
      return {
        hasAccess: () => false,
        canAccessRoute: () => false,
        accessibleFeatures: [],
        accessibleRoutes: [],
        isLoading: authLoading,
        error: null,
      };
    }

    if (user.role === "admin") {
      return {
        hasAccess: () => true,
        canAccessRoute: () => true,
        accessibleFeatures: [],
        accessibleRoutes: [],
        isLoading: authLoading,
        error: null,
      };
    }

    const perms: Record<string, boolean> = effectivePermissions ?? {};

    return {
      hasAccess: (feature: FeatureKey) => perms[feature] === true,
      canAccessRoute: (path: string) => {
        if (path === "/" || path === "/password-management") return true;
        if (ADMIN_ONLY_ROUTES.includes(path)) return false;
        const feature = getFeatureForRoute(path);
        if (!feature) return true;
        return perms[feature] === true;
      },
      accessibleFeatures: FEATURE_KEYS.filter((key) => perms[key] === true),
      accessibleRoutes: FEATURE_KEYS.filter((key) => perms[key] === true).flatMap(
        (key) => FEATURE_TO_ROUTES[key] || []
      ),
      isLoading,
      error: error as Error | null,
    };
  }, [user, authLoading, effectivePermissions, permissionsLoading, error]);
}

export function useCanAccessFeature(feature: FeatureKey): boolean {
  const { hasAccess } = useFeatureAccess();
  return hasAccess(feature);
}

export function useCanAccessRoute(path: string): boolean {
  const { canAccessRoute } = useFeatureAccess();
  return canAccessRoute(path);
}
