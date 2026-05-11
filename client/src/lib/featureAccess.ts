/**
 * Feature Access Control - Shared constants and utilities
 * This file defines all features that can be controlled via role-based permissions
 */

export const FEATURES = [
  { key: "patient_records", label: "Patient Records", description: "View and manage patient information" },
  { key: "ambient_scribe", label: "Ambient Scribe", description: "Record and transcribe consultations" },
  { key: "pharmacy", label: "Pharmacy", description: "Manage inventory and stock" },
  { key: "billing", label: "Billing", description: "Create and manage bills" },
  { key: "purchase_orders", label: "Purchase Orders", description: "Create and manage purchase orders" },
  { key: "appointments", label: "Appointments", description: "Schedule and manage appointments" },
  { key: "notifications", label: "Notifications", description: "View notifications" },
  { key: "audit_trail", label: "Audit Trail", description: "View system audit logs" },
  { key: "daily_export", label: "Daily Export", description: "Export daily reports" },
  { key: "user_management", label: "User Management", description: "Manage staff and consultants" },
] as const;

export type FeatureKey = typeof FEATURES[number]["key"];

export const FEATURE_KEYS = FEATURES.map(f => f.key);

export function getFeatureLabel(key: FeatureKey): string {
  const feature = FEATURES.find(f => f.key === key);
  return feature?.label || key;
}

export function getFeatureDescription(key: FeatureKey): string {
  const feature = FEATURES.find(f => f.key === key);
  return feature?.description || "";
}

/**
 * Map feature keys to navigation paths for route protection
 */
export const FEATURE_TO_ROUTES: Record<FeatureKey, string[]> = {
  patient_records: ["/patients"],
  ambient_scribe: ["/scribe"],
  pharmacy: ["/pharmacy"],
  billing: ["/billing"],
  purchase_orders: ["/purchase-orders"],
  appointments: ["/appointments"],
  notifications: ["/notifications"],
  audit_trail: ["/audit-logs"],
  daily_export: ["/daily-export"],
  user_management: ["/users"],
};

/**
 * Get the feature key for a given route path
 */
export function getFeatureForRoute(path: string): FeatureKey | null {
  for (const [feature, routes] of Object.entries(FEATURE_TO_ROUTES)) {
    if (routes.includes(path)) {
      return feature as FeatureKey;
    }
  }
  return null;
}

/**
 * Get all routes that require feature access
 */
export function getProtectedRoutes(): string[] {
  return Object.values(FEATURE_TO_ROUTES).flat();
}
