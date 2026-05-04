import { count, desc, eq, like, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, patients, consultations, inventory, bills, billItems, auditLogs, notifications, purchaseOrders, purchaseOrderItems } from "../drizzle/schema";
import { ENV } from './_core/env';

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
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
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
  
  await db.insert(patients).values(patientData);
  return patientData;
}

export async function getPatientById(patientId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.select().from(patients).where(eq(patients.patientId, patientId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getAllPatients() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db.select().from(patients).orderBy(desc(patients.createdAt));
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

export async function searchPatients(query: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Simplified search - in production, use full-text search
  // For now, return all patients and filter on client side
  return db.select().from(patients).limit(50);
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
