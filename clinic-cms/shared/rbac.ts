/**
 * Role-based access control — shared between client and server.
 * Database role "consultant" is displayed as "Doctor" in the UI.
 */

export const FEATURE_KEYS = [
  "patient_records",
  "ambient_scribe",
  "pharmacy",
  "billing",
  "purchase_orders",
  "appointments",
  "notifications",
  "audit_trail",
  "daily_export",
  "user_management",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export type RbacRole = "admin" | "consultant" | "staff";

/** UI label for each database role */
export const ROLE_LABELS: Record<RbacRole, string> = {
  admin: "Admin",
  consultant: "Doctor",
  staff: "Staff",
};

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  patient_records: "Patient Records",
  ambient_scribe: "Ambient Scribe",
  pharmacy: "Pharmacy",
  billing: "Billing",
  purchase_orders: "Purchase Orders",
  appointments: "Appointments",
  notifications: "Notifications",
  audit_trail: "Audit Trail",
  daily_export: "Daily Export",
  user_management: "User Management",
};

/** Default permissions when none are stored in the database */
export const DEFAULT_ROLE_PERMISSIONS: Record<"consultant" | "staff", Record<FeatureKey, boolean>> = {
  /** Doctor: patients, appointments, clinical tools */
  consultant: {
    patient_records: true,
    ambient_scribe: true,
    pharmacy: false,
    billing: false,
    purchase_orders: false,
    appointments: true,
    notifications: true,
    audit_trail: false,
    daily_export: false,
    user_management: false,
  },
  /** Staff: patients, appointments, billing, basic dashboard */
  staff: {
    patient_records: true,
    ambient_scribe: false,
    pharmacy: false,
    billing: true,
    purchase_orders: false,
    appointments: true,
    notifications: true,
    audit_trail: false,
    daily_export: false,
    user_management: false,
  },
};

export const FEATURE_TO_ROUTES: Record<FeatureKey, string[]> = {
  patient_records: ["/patients", "/register-patient"],
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

/** Routes only admins may open */
export const ADMIN_ONLY_ROUTES = [
  "/users",
  "/feature-access",
  "/op-form-customization",
  "/analytics",
  "/bill-templates",
];

/** tRPC router root → feature key */
export const API_FEATURE_BY_ROUTER: Partial<Record<string, FeatureKey>> = {
  patients: "patient_records",
  consultations: "ambient_scribe",
  inventory: "pharmacy",
  bills: "billing",
  purchaseOrders: "purchase_orders",
  appointments: "appointments",
  notifications: "notifications",
  auditLogs: "audit_trail",
  dailyExport: "daily_export",
};

export function getFeatureForRoute(path: string): FeatureKey | null {
  for (const [feature, routes] of Object.entries(FEATURE_TO_ROUTES)) {
    if (routes.includes(path)) {
      return feature as FeatureKey;
    }
  }
  return null;
}

export function mergeRolePermissions(
  role: "consultant" | "staff",
  stored: Record<string, boolean> = {}
): Record<FeatureKey, boolean> {
  const defaults = DEFAULT_ROLE_PERMISSIONS[role];
  const merged = { ...defaults };
  for (const key of FEATURE_KEYS) {
    if (stored[key] !== undefined) {
      merged[key] = stored[key];
    }
  }
  return merged;
}

/** Apply per-user overrides on top of role-effective permissions. */
export function applyUserOverrides(
  rolePermissions: Record<FeatureKey, boolean>,
  userOverrides: Record<string, boolean> = {}
): Record<FeatureKey, boolean> {
  const merged = { ...rolePermissions };
  for (const key of FEATURE_KEYS) {
    if (userOverrides[key] !== undefined) {
      merged[key] = userOverrides[key]!;
    }
  }
  return merged;
}

export function getDefaultPermissions(role: "consultant" | "staff"): Record<string, boolean> {
  return { ...DEFAULT_ROLE_PERMISSIONS[role] };
}

export function getRoleLabel(role: string | null | undefined): string {
  if (role === "admin") return ROLE_LABELS.admin;
  if (role === "consultant") return ROLE_LABELS.consultant;
  if (role === "staff") return ROLE_LABELS.staff;
  return role ?? "User";
}

export function canRoleAccessFeature(
  role: string,
  feature: FeatureKey,
  permissions: Record<string, boolean>
): boolean {
  if (role === "admin") return true;
  return permissions[feature] === true;
}
