import { describe, it, expect } from "vitest";
import { FEATURES, FEATURE_KEYS, getFeatureLabel, getFeatureDescription, FEATURE_TO_ROUTES, getFeatureForRoute, getProtectedRoutes } from "@/lib/featureAccess";

describe("Feature Access Constants", () => {
  it("should define all expected features", () => {
    expect(FEATURES.length).toBeGreaterThan(0);
    expect(FEATURES).toContainEqual(
      expect.objectContaining({
        key: "patient_records",
        label: "Patient Records",
      })
    );
  });

  it("should have unique feature keys", () => {
    const keys = FEATURES.map(f => f.key);
    const uniqueKeys = new Set(keys);
    expect(keys.length).toBe(uniqueKeys.size);
  });

  it("should provide feature labels", () => {
    expect(getFeatureLabel("patient_records")).toBe("Patient Records");
    expect(getFeatureLabel("ambient_scribe")).toBe("Ambient Scribe");
    expect(getFeatureLabel("pharmacy")).toBe("Pharmacy");
    expect(getFeatureLabel("billing")).toBe("Billing");
    expect(getFeatureLabel("purchase_orders")).toBe("Purchase Orders");
    expect(getFeatureLabel("notifications")).toBe("Notifications");
    expect(getFeatureLabel("audit_trail")).toBe("Audit Trail");
    expect(getFeatureLabel("daily_export")).toBe("Daily Export");
    expect(getFeatureLabel("user_management")).toBe("User Management");
  });

  it("should provide feature descriptions", () => {
    const desc = getFeatureDescription("patient_records");
    expect(desc).toBeTruthy();
    expect(typeof desc).toBe("string");
  });

  it("should map features to routes correctly", () => {
    expect(FEATURE_TO_ROUTES.patient_records).toContain("/patients");
    expect(FEATURE_TO_ROUTES.patient_records).toContain("/register-patient");
    expect(FEATURE_TO_ROUTES.ambient_scribe).toContain("/scribe");
    expect(FEATURE_TO_ROUTES.pharmacy).toContain("/pharmacy");
    expect(FEATURE_TO_ROUTES.billing).toContain("/billing");
    expect(FEATURE_TO_ROUTES.purchase_orders).toContain("/purchase-orders");
    expect(FEATURE_TO_ROUTES.notifications).toContain("/notifications");
    expect(FEATURE_TO_ROUTES.audit_trail).toContain("/audit-logs");
    expect(FEATURE_TO_ROUTES.daily_export).toContain("/daily-export");
  });

  it("should get feature for route correctly", () => {
    expect(getFeatureForRoute("/patients")).toBe("patient_records");
    expect(getFeatureForRoute("/scribe")).toBe("ambient_scribe");
    expect(getFeatureForRoute("/pharmacy")).toBe("pharmacy");
    expect(getFeatureForRoute("/billing")).toBe("billing");
    expect(getFeatureForRoute("/purchase-orders")).toBe("purchase_orders");
    expect(getFeatureForRoute("/notifications")).toBe("notifications");
    expect(getFeatureForRoute("/audit-logs")).toBe("audit_trail");
    expect(getFeatureForRoute("/daily-export")).toBe("daily_export");
  });

  it("should return null for unmapped routes", () => {
    expect(getFeatureForRoute("/")).toBeNull();
    expect(getFeatureForRoute("/unknown-route")).toBeNull();
  });

  it("should map register-patient to patient_records", () => {
    expect(getFeatureForRoute("/register-patient")).toBe("patient_records");
  });

  it("should get all protected routes", () => {
    const routes = getProtectedRoutes();
    expect(routes).toContain("/patients");
    expect(routes).toContain("/scribe");
    expect(routes).toContain("/pharmacy");
    expect(routes).toContain("/billing");
    expect(routes).toContain("/purchase-orders");
    expect(routes).toContain("/notifications");
    expect(routes).toContain("/audit-logs");
    expect(routes).toContain("/daily-export");
  });

  it("should have FEATURE_KEYS match FEATURES array", () => {
    const expectedKeys = FEATURES.map(f => f.key);
    expect(FEATURE_KEYS).toEqual(expectedKeys);
  });

  it("should have all features mapped to routes", () => {
    for (const feature of FEATURES) {
      expect(FEATURE_TO_ROUTES).toHaveProperty(feature.key);
      expect(Array.isArray(FEATURE_TO_ROUTES[feature.key])).toBe(true);
      expect(FEATURE_TO_ROUTES[feature.key].length).toBeGreaterThan(0);
    }
  });
});
