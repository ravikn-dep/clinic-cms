import {
  Activity,
  Bell,
  BarChart3,
  Calendar,
  Download,
  PackageSearch,
  Receipt,
  Settings,
  ShoppingCart,
  Tags,
  UserPlus,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { FeatureKey } from "./featureAccess";

export type NavigationItem = {
  icon: LucideIcon;
  label: string;
  path: string;
  feature?: FeatureKey;
  adminOnly?: boolean;
};

export type NavigationGroup = {
  label: string;
  items: NavigationItem[];
};

export const DASHBOARD_NAVIGATION_GROUPS: NavigationGroup[] = [
  {
    label: "Clinic Workflow",
    items: [
      { icon: UserPlus, label: "New Visit / Appointment", path: "/new-visit", feature: "appointments" },
      { icon: Calendar, label: "Today's Appointments", path: "/appointments", feature: "appointments" },
      { icon: Users, label: "Patient Records", path: "/patients", feature: "patient_records" },
      { icon: Receipt, label: "Billing", path: "/billing", feature: "billing" },
    ],
  },
  {
    label: "Pharmacy & Inventory",
    items: [
      { icon: PackageSearch, label: "Pharmacy", path: "/pharmacy", feature: "pharmacy" },
      { icon: ShoppingCart, label: "Purchase Orders", path: "/purchase-orders", feature: "purchase_orders" },
    ],
  },
  {
    label: "Admin / Management",
    items: [
      { icon: Tags, label: "Catalog Management", path: "/catalog-management", adminOnly: true },
      { icon: Users, label: "User Management", path: "/users", adminOnly: true },
      { icon: Settings, label: "Feature Access Control", path: "/feature-access", adminOnly: true },
      { icon: Settings, label: "OP Form Customization", path: "/op-form-customization", adminOnly: true },
      { icon: BarChart3, label: "Analytics", path: "/analytics", adminOnly: true },
      { icon: Activity, label: "Audit Trail", path: "/audit-logs", feature: "audit_trail", adminOnly: true },
      { icon: Download, label: "Daily Export", path: "/daily-export", feature: "daily_export", adminOnly: true },
      { icon: Bell, label: "Notifications", path: "/notifications", feature: "notifications" },
    ],
  },
];

export function getVisibleNavigationGroups(
  groups: NavigationGroup[],
  role: string | undefined,
  hasAccess: (feature: FeatureKey) => boolean,
) {
  return groups
    .map((group) => ({ ...group, items: group.items.filter((item) => {
      if (item.adminOnly && role !== "admin") return false;
      return item.feature ? hasAccess(item.feature) : true;
    }) }))
    .filter((group) => group.items.length > 0);
}
