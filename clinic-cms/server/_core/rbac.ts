import {
  FEATURE_KEYS,
  type FeatureKey,
  canRoleAccessFeature,
} from "@shared/rbac";
import * as db from "../db";

export async function getEffectivePermissions(
  role: string,
  userId?: number
): Promise<Record<string, boolean>> {
  if (role === "admin") {
    return Object.fromEntries(FEATURE_KEYS.map((k) => [k, true]));
  }

  if (role === "consultant" || role === "staff") {
    if (userId) {
      return db.getEffectivePermissionsForUser(userId, role);
    }
    return db.getFeaturePermissions(role);
  }

  return {};
}

export async function userHasFeature(
  role: string,
  feature: FeatureKey,
  userId?: number
): Promise<boolean> {
  if (role === "admin") return true;
  const permissions = await getEffectivePermissions(role, userId);
  return canRoleAccessFeature(role, feature, permissions);
}
