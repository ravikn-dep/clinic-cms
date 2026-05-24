import { count, desc, eq, like, lte, inArray, sql, and, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, InsertUserPermission, users, patients, consultations, inventory, bills, billItems, billTemplates, auditLogs, notifications, purchaseOrders, purchaseOrderItems, appointments, consultantAvailability, notificationPreferences, rolePermissions, userPermissions, vendors } from "../drizzle/schema";
import { ENV } from './_core/env';
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ============ PATIENT QUERIES ============

export async function createPatient(patientData: typeof patients.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const now = new Date();
  const dataWithTimestamps = {
    ...patientData,
    createdAt: patientData.createdAt || now,
    updatedAt: patientData.updatedAt || now,
  };
  
  await db.insert(patients).values(dataWithTimestamps);
  return dataWithTimestamps;
}

export async function getPatientById(patientId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.select().from(patients).where(eq(patients.patientId, patientId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getAllPatients(includeArchived = false) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  if (includeArchived) {
    return db.select().from(patients).orderBy(desc(patients.createdAt));
  }

  return db
    .select()
    .from(patients)
    .where(eq(patients.isArchived, false))
    .orderBy(desc(patients.createdAt));
}

export async function countPatientsByPatientIdPrefix(patientIdPrefix: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .select({ value: count() })
    .from(patients)
    .where(like(patients.patientId, `${patientIdPrefix}%`));

  return Number(result[0]?.value ?? 0);
}

export async function searchPatients(query: string, includeArchived = false) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const trimmed = query.trim();
  if (!trimmed) {
    return getAllPatients(includeArchived);
  }

  const pattern = `%${trimmed}%`;
  const conditions = [
    or(
      like(patients.firstName, pattern),
      like(patients.lastName, pattern),
      like(patients.patientId, pattern),
      like(patients.contactNumber, pattern),
      like(patients.email, pattern)
    ),
  ];

  if (!includeArchived) {
    conditions.push(eq(patients.isArchived, false));
  }

  return db
    .select()
    .from(patients)
    .where(and(...conditions))
    .orderBy(desc(patients.createdAt))
    .limit(100);
}

export async function updatePatient(
  patientId: string,
  updates: {
    firstName?: string;
    lastName?: string;
    dateOfBirth?: string | null;
    gender?: string | null;
    contactNumber?: string;
    email?: string | null;
    address?: string | null;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await getPatientById(patientId);
  if (!existing) {
    throw new Error("Patient not found");
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (updates.firstName !== undefined) patch.firstName = updates.firstName;
  if (updates.lastName !== undefined) patch.lastName = updates.lastName;
  if (updates.dateOfBirth !== undefined) patch.dateOfBirth = updates.dateOfBirth;
  if (updates.gender !== undefined) patch.gender = updates.gender;
  if (updates.contactNumber !== undefined) patch.contactNumber = updates.contactNumber;
  if (updates.email !== undefined) patch.email = updates.email;
  if (updates.address !== undefined) patch.address = updates.address;

  await db
    .update(patients)
    .set(patch as typeof patients.$inferInsert)
    .where(eq(patients.patientId, patientId));

  return getPatientById(patientId);
}

export async function setPatientArchived(patientId: string, isArchived: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await getPatientById(patientId);
  if (!existing) {
    throw new Error("Patient not found");
  }

  await db
    .update(patients)
    .set({
      isArchived,
      archivedAt: isArchived ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(patients.patientId, patientId));

  return getPatientById(patientId);
}

// ============ CONSULTATION QUERIES ============

export async function createConsultation(consultationData: typeof consultations.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(consultations).values(consultationData);
  return consultationData;
}

export async function getConsultationById(consultationId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.select().from(consultations).where(eq(consultations.consultationId, consultationId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getConsultationsByPatientId(patientId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db.select().from(consultations).where(eq(consultations.patientId, patientId)).orderBy(desc(consultations.consultationDate));
}

export async function updateConsultation(consultationId: string, updates: Partial<typeof consultations.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(consultations).set(updates).where(eq(consultations.consultationId, consultationId));
}

// ============ PURCHASE ORDERS QUERIES ============

export async function createPurchaseOrder(poData: typeof purchaseOrders.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(purchaseOrders).values(poData);
  return poData;
}

export async function getPurchaseOrderById(purchaseOrderId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.select().from(purchaseOrders).where(eq(purchaseOrders.purchaseOrderId, purchaseOrderId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getAllPurchaseOrders() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db.select().from(purchaseOrders).orderBy(desc(purchaseOrders.createdAt));
}

export async function updatePurchaseOrder(purchaseOrderId: string, updates: Partial<typeof purchaseOrders.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(purchaseOrders).set(updates).where(eq(purchaseOrders.purchaseOrderId, purchaseOrderId));
}

export async function createPurchaseOrderItem(poItemData: typeof purchaseOrderItems.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(purchaseOrderItems).values(poItemData);
  return poItemData;
}

export async function getPurchaseOrderItems(purchaseOrderId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, purchaseOrderId));
}

export async function updateBillConsultationNotes(billId: string, consultationNotes: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(bills).set({ consultationNotes }).where(eq(bills.billId, billId));
}

export async function updateBillReceipt(billId: string, receiptPdfUrl: string | null, receiptPdfKey: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(bills).set({ receiptPdfUrl, receiptPdfKey }).where(eq(bills.billId, billId));
}

export async function updateReceiptDelivery(billId: string, status: "Not Sent" | "Sent" | "Failed" | "Pending", method?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(bills).set({
    receiptDeliveryStatus: status,
    receiptDeliveryMethod: method,
    receiptDeliveryTimestamp: status === "Sent" ? new Date() : undefined,
  }).where(eq(bills.billId, billId));
}

export async function approvePurchaseOrder(poId: string, approvedBy: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(purchaseOrders).set({
    approvalStatus: "Approved",
    approvedBy,
    approvalTimestamp: new Date(),
  }).where(eq(purchaseOrders.purchaseOrderId, poId));
}

export async function rejectPurchaseOrder(poId: string, rejectionReason: string, approvedBy: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(purchaseOrders).set({
    approvalStatus: "Rejected",
    rejectionReason,
    approvedBy,
    approvalTimestamp: new Date(),
  }).where(eq(purchaseOrders.purchaseOrderId, poId));
}

// ============ INVENTORY QUERIES ============

export async function createInventoryItem(itemData: typeof inventory.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(inventory).values(itemData);
  return itemData;
}

export async function getInventoryItemById(itemId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.select().from(inventory).where(eq(inventory.itemId, itemId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getAllInventoryItems() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db.select().from(inventory).orderBy(desc(inventory.createdAt));
}

export async function getLowStockItems() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db.select().from(inventory).where(lte(inventory.quantityAvailable, inventory.reorderLevel));
}

export async function getInventoryByName(itemName: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.select().from(inventory).where(eq(inventory.itemName, itemName)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function updateInventoryItem(itemId: string, updates: Partial<typeof inventory.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(inventory).set(updates).where(eq(inventory.itemId, itemId));
}

// ============ BILLING QUERIES ============

export async function createBill(billData: typeof bills.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(bills).values(billData);
  return billData;
}

export async function getBillById(billId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.select().from(bills).where(eq(bills.billId, billId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getBillsByPatientId(patientId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db.select().from(bills).where(eq(bills.patientId, patientId)).orderBy(desc(bills.createdAt));
}

export async function getAllBills() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.select().from(bills).orderBy(desc(bills.createdAt));
}

export async function updateBill(billId: string, updates: Partial<typeof bills.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(bills).set(updates).where(eq(bills.billId, billId));
}

// ============ BILL ITEMS QUERIES ============

export async function createBillItem(itemData: typeof billItems.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(billItems).values(itemData);
  return itemData;
}

export async function getBillItemsByBillId(billId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db.select().from(billItems).where(eq(billItems.billId, billId));
}

export async function getBillingSummary() {
  const all = await getAllBills();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  let totalRevenue = 0;
  let pendingAmount = 0;
  let partialAmount = 0;
  let paidAmount = 0;
  let todayRevenue = 0;
  let pendingCount = 0;
  let paidCount = 0;

  for (const bill of all) {
    const amount = Number.parseFloat(String(bill.finalAmount ?? 0)) || 0;
    totalRevenue += amount;

    if (bill.paymentStatus === "Pending") {
      pendingAmount += amount;
      pendingCount += 1;
    } else if (bill.paymentStatus === "Partial") {
      partialAmount += amount;
    } else if (bill.paymentStatus === "Paid") {
      paidAmount += amount;
      paidCount += 1;
    }

    const created = new Date(bill.createdAt);
    if (created >= startOfToday) {
      todayRevenue += amount;
    }
  }

  return {
    invoiceCount: all.length,
    totalRevenue,
    pendingAmount,
    partialAmount,
    paidAmount,
    todayRevenue,
    pendingCount,
    paidCount,
  };
}

// ============ AUDIT LOG QUERIES ============

export async function createAuditLog(logData: typeof auditLogs.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(auditLogs).values(logData);
  return logData;
}

export async function getAuditLogs(limit: number = 100) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db.select().from(auditLogs).orderBy(desc(auditLogs.timestamp)).limit(limit);
}

// ============ NOTIFICATION QUERIES ============

export async function createNotification(notificationData: typeof notifications.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(notifications).values(notificationData);
  return notificationData;
}

export async function getNotificationsByUserId(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt));
}

export async function markNotificationAsRead(notificationId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(notifications).set({ isRead: true }).where(eq(notifications.notificationId, notificationId));
}


// ============ RBAC QUERIES ============

export async function createStaffUser(userData: typeof users.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(users).values(userData);
  return userData;
}

export async function getAllStaffUsers() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db.select().from(users).where(inArray(users.role, ["consultant", "staff"])).orderBy(desc(users.createdAt));
}

export async function getStaffUserById(userId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.select().from(users).where(eq(users.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getStaffUserByUsername(username: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function updateStaffUser(userId: string, updates: Partial<typeof users.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(users).set(updates).where(eq(users.userId, userId));
}

export async function deleteStaffUser(userId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(users).where(eq(users.userId, userId));
}

export async function getNextUserSequence(role: "consultant" | "staff"): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.select({ maxId: sql<string>`MAX(userId)` }).from(users).where(eq(users.role, role));
  
  if (!result[0]?.maxId) return 1;
  
  const lastId = result[0].maxId as string;
  const match = lastId.match(/\d+$/);
  if (!match) return 1;
  
  return parseInt(match[0]) + 1;
}

// ============ ROLE PERMISSIONS QUERIES ============

export async function getRolePermissions(role: "admin" | "consultant" | "staff") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db.select().from(rolePermissions).where(eq(rolePermissions.role, role));
}

export async function getRolePermissionByFeature(role: "admin" | "consultant" | "staff", featureKey: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db
    .select()
    .from(rolePermissions)
    .where(eq(rolePermissions.role, role) && eq(rolePermissions.featureKey, featureKey))
    .limit(1);
  
  return result.length > 0 ? result[0] : null;
}

export async function updateRolePermission(role: "admin" | "consultant" | "staff", featureKey: string, isEnabled: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Check if permission exists
  const existing = await getRolePermissionByFeature(role, featureKey);
  
  if (existing) {
    // Update existing
    await db
      .update(rolePermissions)
      .set({ isEnabled, updatedAt: new Date() })
      .where(eq(rolePermissions.permissionId, existing.permissionId));
  } else {
    // Create new
    const permissionId = `${role}-${featureKey}-${Date.now()}`;
    await db.insert(rolePermissions).values({
      permissionId,
      role,
      featureKey,
      isEnabled,
    });
  }
}



// ============ FEATURE ACCESS CONTROL (Database-persisted) ============

export async function getFeaturePermissions(role: "consultant" | "staff" | "admin"): Promise<Record<string, boolean>> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  if (role === "admin") {
    const { FEATURE_KEYS } = await import("@shared/rbac");
    return Object.fromEntries(FEATURE_KEYS.map((k) => [k, true]));
  }

  const perms = await db.select().from(rolePermissions).where(eq(rolePermissions.role, role));

  const { mergeRolePermissions, toPermissionBoolean } = await import("@shared/rbac");
  const stored: Record<string, unknown> = {};
  for (const perm of perms as { featureKey: string; isEnabled: unknown }[]) {
    stored[perm.featureKey] = toPermissionBoolean(perm.isEnabled);
  }

  return mergeRolePermissions(role, stored);
}

export async function setFeaturePermission(role: "consultant" | "staff", featureKey: string, isEnabled: boolean): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const permissionId = `PERM-${Date.now()}`;
  
  const existing = await db.select().from(rolePermissions).where(
    and(
      eq(rolePermissions.role, role),
      eq(rolePermissions.featureKey, featureKey)
    )
  );

  if (existing.length > 0) {
    await db.update(rolePermissions)
      .set({ isEnabled, updatedAt: new Date() })
      .where(
        and(
          eq(rolePermissions.role, role),
          eq(rolePermissions.featureKey, featureKey)
        )
      );
  } else {
    await db.insert(rolePermissions).values({
      permissionId,
      role,
      featureKey,
      isEnabled,
    } as any);
  }
}

export async function setFeaturePermissions(role: "consultant" | "staff", permissions: Record<string, boolean>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(rolePermissions).where(eq(rolePermissions.role, role));

  const { toPermissionBoolean } = await import("@shared/rbac");
  for (const [featureKey, isEnabled] of Object.entries(permissions)) {
    const permissionId = `PERM-${Date.now()}-${Math.random()}`;
    await db.insert(rolePermissions).values({
      permissionId,
      role,
      featureKey,
      isEnabled: toPermissionBoolean(isEnabled),
    } as any);
  }
}

export async function checkFeatureAccess(role: "admin" | "consultant" | "staff", featureKey: string): Promise<boolean> {
  if (role === "admin") return true;

  const permissions = await getFeaturePermissions(role);
  const { toPermissionBoolean } = await import("@shared/rbac");
  return toPermissionBoolean(permissions[featureKey]);
}

// ============ USER-SPECIFIC FEATURE PERMISSIONS ============

export async function getRawUserPermissionOverrides(
  userId: number
): Promise<Record<string, boolean>> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db
    .select()
    .from(userPermissions)
    .where(eq(userPermissions.userId, userId));

  const { toPermissionBoolean } = await import("@shared/rbac");
  const stored: Record<string, boolean> = {};
  for (const row of rows as { featureKey: string; isEnabled: unknown }[]) {
    stored[row.featureKey] = toPermissionBoolean(row.isEnabled);
  }
  return stored;
}

export async function getEffectivePermissionsForUser(
  userId: number,
  role: "consultant" | "staff" | "admin"
): Promise<Record<string, boolean>> {
  if (role === "admin") {
    const { FEATURE_KEYS } = await import("@shared/rbac");
    return Object.fromEntries(FEATURE_KEYS.map((k) => [k, true]));
  }

  const { applyUserOverrides } = await import("@shared/rbac");
  const rolePerms = await getFeaturePermissions(role);
  const userOverrides = await getRawUserPermissionOverrides(userId);
  return applyUserOverrides(rolePerms as Parameters<typeof applyUserOverrides>[0], userOverrides);
}

export async function setUserFeaturePermissions(
  userId: number,
  role: "consultant" | "staff",
  desired: Record<string, boolean>
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const roleBaseline = await getFeaturePermissions(role);
  const overrides: Record<string, boolean> = {};

  for (const [featureKey, isEnabled] of Object.entries(desired)) {
    if (roleBaseline[featureKey] !== isEnabled) {
      overrides[featureKey] = isEnabled;
    }
  }

  await db.delete(userPermissions).where(eq(userPermissions.userId, userId));

  for (const [featureKey, isEnabled] of Object.entries(overrides)) {
    const permissionId = `UPERM-${userId}-${featureKey}-${Date.now()}`;
    await db.insert(userPermissions).values({
      permissionId,
      userId,
      featureKey,
      isEnabled,
    } as InsertUserPermission);
  }
}

export async function clearUserFeaturePermissions(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(userPermissions).where(eq(userPermissions.userId, userId));
}

export async function getUserByNumericId(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function initializeDefaultPermissions(): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db.select().from(rolePermissions);
  if (existing.length > 0) return;

  const { DEFAULT_ROLE_PERMISSIONS } = await import("@shared/rbac");

  for (const [feature, isEnabled] of Object.entries(DEFAULT_ROLE_PERMISSIONS.consultant)) {
    if (!isEnabled) continue;
    const permissionId = `PERM-${Date.now()}-${Math.random()}`;
    await db.insert(rolePermissions).values({
      permissionId,
      role: "consultant",
      featureKey: feature,
      isEnabled: true,
    } as any);
  }

  for (const [feature, isEnabled] of Object.entries(DEFAULT_ROLE_PERMISSIONS.staff)) {
    if (!isEnabled) continue;
    const permissionId = `PERM-${Date.now()}-${Math.random()}`;
    await db.insert(rolePermissions).values({
      permissionId,
      role: "staff",
      featureKey: feature,
      isEnabled: true,
    } as any);
  }
}


// ============ OP FORM TEMPLATE CUSTOMIZATION ============

interface OPFormTemplate {
  clinicName: string;
  clinicSubtitle?: string;
  headerFields: Array<{
    id: string;
    label: string;
    fieldType: "text" | "date" | "dropdown" | "checkbox" | "textarea";
    required: boolean;
    placeholder?: string;
    options?: string[];
  }>;
  blankAreaHeight: number;
  footerText?: string;
  showQRCode: boolean;
  showBarcode: boolean;
}

const DEFAULT_OP_FORM_TEMPLATE: OPFormTemplate = {
  clinicName: "Clinic OP Form",
  clinicSubtitle: "",
  headerFields: [
    { id: "name", label: "Name", fieldType: "text", required: true },
    { id: "dob", label: "Age/DOB", fieldType: "date", required: true },
    { id: "contact", label: "Contact", fieldType: "text", required: true },
    { id: "gender", label: "Gender", fieldType: "dropdown", required: true, options: ["Male", "Female", "Other"] },
    { id: "consultant", label: "Consultant", fieldType: "text", required: false },
    { id: "datetime", label: "Date/Time", fieldType: "text", required: false },
  ],
  blankAreaHeight: 200,
  footerText: "",
  showQRCode: true,
  showBarcode: true,
};

let opFormTemplateStore: OPFormTemplate = { ...DEFAULT_OP_FORM_TEMPLATE };

export async function getOPFormTemplate(): Promise<OPFormTemplate> {
  return { ...opFormTemplateStore };
}

export async function setOPFormTemplate(template: OPFormTemplate): Promise<void> {
  opFormTemplateStore = { ...template };
}

export async function resetOPFormTemplate(): Promise<void> {
  opFormTemplateStore = { ...DEFAULT_OP_FORM_TEMPLATE };
}


// ============ APPOINTMENT SCHEDULING ============

export async function createAppointment(data: {
  patientId: string;
  consultantId: number;
  appointmentDate: string;
  appointmentTime: string;
  duration?: number;
  notes?: string;
  notificationMethod?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const appointmentId = `APT-${Date.now()}`;
  
  await db.insert(appointments).values({
    appointmentId,
    patientId: data.patientId,
    consultantId: data.consultantId,
    appointmentDate: data.appointmentDate,
    appointmentTime: data.appointmentTime,
    duration: data.duration ?? 30,
    notes: data.notes,
    notificationMethod: data.notificationMethod ?? "SMS",
    status: "Scheduled",
  });

  return appointmentId;
}

export async function getAppointmentById(appointmentId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.select().from(appointments).where(eq(appointments.appointmentId, appointmentId));
  return result[0];
}

export async function getAppointmentsByPatient(patientId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(appointments).where(eq(appointments.patientId, patientId));
}

export async function getAppointmentsByConsultant(consultantId: number, date?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  if (date) {
    return await db.select().from(appointments).where(
      and(
        eq(appointments.consultantId, consultantId),
        eq(appointments.appointmentDate, date)
      )
    );
  }

  return await db.select().from(appointments).where(eq(appointments.consultantId, consultantId));
}

export async function getAllAppointments() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.select().from(appointments).orderBy(desc(appointments.appointmentDate));
}

export async function updateAppointmentStatus(appointmentId: string, status: "Scheduled" | "Completed" | "Cancelled" | "No-show" | "Rescheduled") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(appointments)
    .set({ status, updatedAt: new Date() })
    .where(eq(appointments.appointmentId, appointmentId));
}

export async function cancelAppointment(appointmentId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(appointments)
    .set({ status: "Cancelled", updatedAt: new Date() })
    .where(eq(appointments.appointmentId, appointmentId));
}

export async function rescheduleAppointment(appointmentId: string, newDate: string, newTime: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(appointments)
    .set({ 
      appointmentDate: newDate,
      appointmentTime: newTime,
      status: "Rescheduled",
      updatedAt: new Date() 
    })
    .where(eq(appointments.appointmentId, appointmentId));
}

export async function updateAppointment(
  appointmentId: string,
  updates: {
    patientId?: string;
    consultantId?: number;
    appointmentDate?: string;
    appointmentTime?: string;
    duration?: number;
    notes?: string | null;
    status?: "Scheduled" | "Completed" | "Cancelled" | "No-show" | "Rescheduled";
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const payload: Record<string, unknown> = { updatedAt: new Date() };
  if (updates.patientId !== undefined) payload.patientId = updates.patientId;
  if (updates.consultantId !== undefined) payload.consultantId = updates.consultantId;
  if (updates.appointmentDate !== undefined) payload.appointmentDate = updates.appointmentDate;
  if (updates.appointmentTime !== undefined) payload.appointmentTime = updates.appointmentTime;
  if (updates.duration !== undefined) payload.duration = updates.duration;
  if (updates.notes !== undefined) payload.notes = updates.notes;
  if (updates.status !== undefined) payload.status = updates.status;

  await db.update(appointments).set(payload).where(eq(appointments.appointmentId, appointmentId));
}

export async function checkAppointmentConflict(
  consultantId: number,
  date: string,
  time: string,
  duration: number = 30,
  excludeAppointmentId?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existingAppointments = await db.select().from(appointments).where(
    and(
      eq(appointments.consultantId, consultantId),
      eq(appointments.appointmentDate, date),
      eq(appointments.status, "Scheduled")
    )
  );

  const [hours, minutes] = time.split(":").map(Number);
  const appointmentStart = hours * 60 + minutes;
  const appointmentEnd = appointmentStart + duration;

  for (const apt of existingAppointments as any[]) {
    if (excludeAppointmentId && apt.appointmentId === excludeAppointmentId) {
      continue;
    }
    const [aptHours, aptMinutes] = apt.appointmentTime.split(":").map(Number);
    const aptStart = aptHours * 60 + aptMinutes;
    const aptEnd = aptStart + (apt.duration ?? 30);

    if (appointmentStart < aptEnd && appointmentEnd > aptStart) {
      return true; // Conflict found
    }
  }

  return false; // No conflict
}

export async function getConsultantAvailability(consultantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(consultantAvailability).where(eq(consultantAvailability.consultantId, consultantId));
}

export async function setConsultantAvailability(data: {
  consultantId: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotDuration?: number;
  maxAppointmentsPerDay?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const availabilityId = `AVL-${Date.now()}`;

  await db.insert(consultantAvailability).values({
    availabilityId,
    consultantId: data.consultantId,
    dayOfWeek: data.dayOfWeek,
    startTime: data.startTime,
    endTime: data.endTime,
    slotDuration: data.slotDuration ?? 30,
    maxAppointmentsPerDay: data.maxAppointmentsPerDay ?? 10,
    isActive: true,
  } as any);

  return availabilityId;
}

export async function getAvailableSlots(consultantId: number, date: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const dateObj = new Date(date);
  const dayOfWeek = dateObj.getDay();

  const availabilityList = await db.select().from(consultantAvailability).where(
    and(
      eq(consultantAvailability.consultantId, consultantId),
      eq(consultantAvailability.dayOfWeek, dayOfWeek),
      eq(consultantAvailability.isActive, true)
    )
  );

  const availability = availabilityList[0];

  if (!availability) return [];

  const appointments = await getAppointmentsByConsultant(consultantId, date);
  const slots: string[] = [];

  const [startHours, startMinutes] = availability.startTime.split(":").map(Number);
  const [endHours, endMinutes] = availability.endTime.split(":").map(Number);
  
  let currentTime = startHours * 60 + startMinutes;
  const endTime = endHours * 60 + endMinutes;
  const slotDuration = availability.slotDuration ?? 30;

  while (currentTime + slotDuration <= endTime) {
    const slotHours = Math.floor(currentTime / 60);
    const slotMinutes = currentTime % 60;
    const timeStr = `${String(slotHours).padStart(2, "0")}:${String(slotMinutes).padStart(2, "0")}`;

    const hasConflict = appointments.some((apt: any) => {
      const [aptHours, aptMinutes] = apt.appointmentTime.split(":").map(Number);
      const aptStart = aptHours * 60 + aptMinutes;
      const aptEnd = aptStart + (apt.duration ?? 30);
      return currentTime < aptEnd && currentTime + slotDuration > aptStart;
    });

    if (!hasConflict) {
      slots.push(timeStr);
    }

    currentTime += slotDuration;
  }

  return slots;
}


// ============ PASSWORD AUTHENTICATION ============

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function setUserPassword(userId: number, password: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const hashedPassword = await hashPassword(password);
  
  await db.update(users)
    .set({ passwordHash: hashedPassword, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

const ADMIN_LOGIN_ALIASES = new Set(["admin@max", "admin", "administrator"]);

export async function findUserByCredential(credential: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const trimmed = credential.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();

  const byEmail = await db
    .select()
    .from(users)
    .where(sql`LOWER(${users.email}) = ${lower}`)
    .limit(1);
  if (byEmail.length > 0) return byEmail[0];

  const byUsername = await db
    .select()
    .from(users)
    .where(eq(users.username, lower))
    .limit(1);
  if (byUsername.length > 0) return byUsername[0];

  const byUserIdUpper = await db
    .select()
    .from(users)
    .where(eq(users.userId, trimmed.toUpperCase()))
    .limit(1);
  if (byUserIdUpper.length > 0) return byUserIdUpper[0];

  const byUserIdExact = await db.select().from(users).where(eq(users.userId, trimmed)).limit(1);
  if (byUserIdExact.length > 0) return byUserIdExact[0];

  // Documented default admin@max may not match stored username (e.g. ravikn + Microsoft email).
  if (ADMIN_LOGIN_ALIASES.has(lower)) {
    const admins = await db
      .select()
      .from(users)
      .where(and(eq(users.role, "admin"), eq(users.isActive, true)));

    const withPassword = admins.filter((u) => Boolean(u.passwordHash));
    if (withPassword.length === 0) return null;

    const preferred = withPassword.find((u) => u.username?.toLowerCase() === "admin@max");
    if (preferred) return preferred;

    if (withPassword.length === 1) return withPassword[0];

    return withPassword.sort((a, b) => (a.id ?? 0) - (b.id ?? 0))[0];
  }

  return null;
}

export async function authenticateUser(
  username: string,
  password: string
): Promise<{ id: number; name: string | null; email: string | null; role: string } | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const user = await findUserByCredential(username);

  if (!user || !user.passwordHash) {
    return null;
  }

  const { toPermissionBoolean } = await import("@shared/rbac");
  if (user.isActive !== undefined && user.isActive !== null && !toPermissionBoolean(user.isActive)) {
    throw new Error("User account is inactive");
  }

  const isPasswordValid = await verifyPassword(password, user.passwordHash);

  if (!isPasswordValid) {
    return null;
  }

  await db
    .update(users)
    .set({ lastSignedIn: new Date() })
    .where(eq(users.id, user.id));

  return {
    id: user.id as number,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

export async function getUserByEmail(email: string): Promise<any | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const user = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return user.length > 0 ? user[0] : null;
}


export async function updateUserOpenId(userId: number, newOpenId: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(users).set({ openId: newOpenId }).where(eq(users.id, userId));
}


export async function getUserById(userId: number): Promise<any | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return user.length > 0 ? user[0] : null;
}




// Bill Templates
export async function createBillTemplate(template: typeof billTemplates.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(billTemplates).values(template);
}

export async function getBillTemplateById(templateId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.select().from(billTemplates).where(eq(billTemplates.templateId, templateId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getAllBillTemplates() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db.select().from(billTemplates).where(eq(billTemplates.isActive, true)).orderBy(desc(billTemplates.createdAt));
}

export async function updateBillTemplate(templateId: string, updates: Partial<typeof billTemplates.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(billTemplates).set(updates).where(eq(billTemplates.templateId, templateId));
}

export async function deleteBillTemplate(templateId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(billTemplates).set({ isActive: false }).where(eq(billTemplates.templateId, templateId));
}


// Direct Login Functions (Email/Password Authentication)

export async function getUserByUsername(username: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
  return result[0] || null;
}

export async function createDirectLoginUser(data: {
  email: string;
  username: string;
  passwordHash: string;
  name: string;
  role: "admin" | "consultant" | "staff" | "user";
  phone?: string;
  department?: string;
  createdBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Generate a unique openId for compatibility
  const openId = `local-${data.username}-${Date.now()}`;
  
  const result = await db.insert(users).values({
    openId,
    email: data.email,
    username: data.username,
    passwordHash: data.passwordHash,
    name: data.name,
    role: data.role,
    phone: data.phone,
    department: data.department,
    createdBy: data.createdBy,
    isActive: true,
    loginMethod: "direct",
  });
  
  return result;
}

export async function updateUserPassword(userId: number, passwordHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

export async function updateUserStatus(userId: number, isActive: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(users).set({ isActive }).where(eq(users.id, userId));
}

export async function getAllDirectLoginUsers() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db.select().from(users).where(eq(users.loginMethod, "direct")).orderBy(desc(users.createdAt));
}


// ========== VENDOR MANAGEMENT ==========

export async function createVendor(vendorData: any): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const vendorId = `VENDOR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  await db.insert(vendors).values({
    vendorId,
    name: vendorData.name,
    contactNumber: vendorData.contactNumber,
    gstNumber: vendorData.gstNumber,
    address: vendorData.address,
    dlNumber: vendorData.dlNumber ? JSON.stringify(vendorData.dlNumber) : null,
    email: vendorData.email,
    isActive: true,
    createdBy: vendorData.createdBy,
  });
  
  return { vendorId, ...vendorData };
}

export async function getAllVendors(): Promise<any[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.select().from(vendors).where(eq(vendors.isActive, true));
}

export async function getVendorById(vendorId: string): Promise<any | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.select().from(vendors).where(eq(vendors.vendorId, vendorId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function updateVendor(vendorId: string, vendorData: any): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(vendors).set({
    name: vendorData.name,
    contactNumber: vendorData.contactNumber,
    gstNumber: vendorData.gstNumber,
    address: vendorData.address,
    dlNumber: vendorData.dlNumber ? JSON.stringify(vendorData.dlNumber) : null,
    email: vendorData.email,
    updatedAt: new Date(),
  }).where(eq(vendors.vendorId, vendorId));
  
  return { vendorId, ...vendorData };
}
