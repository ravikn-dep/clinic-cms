import { describe, it, expect, beforeEach } from "vitest";
import * as db from "./db";

describe("Feature Access Control", () => {
  beforeEach(() => {
    // Reset permissions before each test
    // In-memory store is reset
  });

  describe("getFeaturePermissions", () => {
    it("should return default permissions for unset permissions", async () => {
      const perms = await db.getFeaturePermissions("consultant");
      expect(perms).toBeDefined();
      expect(perms?.patient_records).toBe(true);
    });

    it("should return stored permissions for consultant", async () => {
      const testPerms = {
        patient_records: true,
        ambient_scribe: true,
        pharmacy: false,
      };
      await db.setFeaturePermissions("consultant", testPerms);
      const perms = await db.getFeaturePermissions("consultant");
      expect(perms).toEqual(testPerms);
    });

    it("should return stored permissions for staff", async () => {
      const testPerms = {
        patient_records: true,
        pharmacy: true,
        billing: false,
      };
      await db.setFeaturePermissions("staff", testPerms);
      const perms = await db.getFeaturePermissions("staff");
      expect(perms).toEqual(testPerms);
    });
  });

  describe("setFeaturePermissions", () => {
    it("should store permissions for consultant", async () => {
      const testPerms = {
        patient_records: true,
        ambient_scribe: true,
      };
      await db.setFeaturePermissions("consultant", testPerms);
      const perms = await db.getFeaturePermissions("consultant");
      expect(perms).toEqual(testPerms);
    });

    it("should store permissions for staff", async () => {
      const testPerms = {
        patient_records: true,
        purchase_orders: true,
      };
      await db.setFeaturePermissions("staff", testPerms);
      const perms = await db.getFeaturePermissions("staff");
      expect(perms).toEqual(testPerms);
    });

    it("should overwrite existing permissions", async () => {
      const oldPerms = { patient_records: true };
      const newPerms = { patient_records: false, pharmacy: true };
      
      await db.setFeaturePermissions("consultant", oldPerms);
      await db.setFeaturePermissions("consultant", newPerms);
      
      const perms = await db.getFeaturePermissions("consultant");
      expect(perms).toEqual(newPerms);
    });
  });

  describe("checkFeatureAccess", () => {
    it("should return true for admin on any feature", async () => {
      const access = await db.checkFeatureAccess("admin", "patient_records");
      expect(access).toBe(true);
    });

    it("should return true for enabled features", async () => {
      const testPerms = { patient_records: true };
      await db.setFeaturePermissions("consultant", testPerms);
      
      const access = await db.checkFeatureAccess("consultant", "patient_records");
      expect(access).toBe(true);
    });

    it("should return false for disabled features", async () => {
      const testPerms = { patient_records: false };
      await db.setFeaturePermissions("consultant", testPerms);
      
      const access = await db.checkFeatureAccess("consultant", "patient_records");
      expect(access).toBe(false);
    });

    it("should return false for unset features", async () => {
      const testPerms = { patient_records: true };
      await db.setFeaturePermissions("consultant", testPerms);
      
      const access = await db.checkFeatureAccess("consultant", "billing");
      expect(access).toBe(false);
    });

    it("should handle staff role correctly", async () => {
      const staffPerms = { pharmacy: true, billing: false };
      await db.setFeaturePermissions("staff", staffPerms);
      
      expect(await db.checkFeatureAccess("staff", "pharmacy")).toBe(true);
      expect(await db.checkFeatureAccess("staff", "billing")).toBe(false);
    });
  });
});
