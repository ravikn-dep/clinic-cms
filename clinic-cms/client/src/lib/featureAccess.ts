/**
 * Feature access — re-exports shared RBAC config for the client.
 */
import {
  FEATURE_KEYS,
  FEATURE_LABELS,
  FEATURE_TO_ROUTES,
  ADMIN_ONLY_ROUTES,
  DEFAULT_ROLE_PERMISSIONS,
  getFeatureForRoute,
  getRoleLabel,
  mergeRolePermissions,
  applyUserOverrides,
  type FeatureKey,
} from "@shared/rbac";

export const FEATURES = FEATURE_KEYS.map((key) => ({
  key,
  label: FEATURE_LABELS[key],
  description: FEATURE_LABELS[key],
}));

export {
  FEATURE_KEYS,
  FEATURE_LABELS,
  FEATURE_TO_ROUTES,
  ADMIN_ONLY_ROUTES,
  DEFAULT_ROLE_PERMISSIONS,
  getFeatureForRoute,
  getRoleLabel,
  mergeRolePermissions,
  applyUserOverrides,
  type FeatureKey,
};

export function getFeatureLabel(key: FeatureKey): string {
  return FEATURE_LABELS[key] || key;
}

export function getFeatureDescription(key: FeatureKey): string {
  return FEATURE_LABELS[key] || "";
}

export function getProtectedRoutes(): string[] {
  return Object.values(FEATURE_TO_ROUTES).flat();
}
