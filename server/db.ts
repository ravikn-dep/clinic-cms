import { count, desc, eq, like, lte, inArray, sql, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, patients, consultations, inventory, bills, billItems, billTemplates, auditLogs, notifications, purchaseOrders, purchaseOrderItems, appointments, consultantAvailability, notificationPreferences, rolePermissions } from "../drizzle/schema";
import { ENV } from './_core/env';
import bcrypt from 'bcrypt';

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

  const perms = await db.select().from(rolePermissions).where(eq(rolePermissions.role, role));
  
  const result: Record<string, boolean> = {};
  for (const perm of perms as any[]) {
    result[perm.featureKey] = perm.isEnabled;
  }
  
  return result;
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

  for (const [featureKey, isEnabled] of Object.entries(permissions)) {
    const permissionId = `PERM-${Date.now()}-${Math.random()}`;
    await db.insert(rolePermissions).values({
      permissionId,
      role,
      featureKey,
      isEnabled,
    } as any);
  }
}

export async function checkFeatureAccess(role: "admin" | "consultant" | "staff", featureKey: string): Promise<boolean> {
  if (role === "admin") return true;
  
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const perm = await db.select().from(rolePermissions).where(
    and(
      eq(rolePermissions.role, role),
      eq(rolePermissions.featureKey, featureKey)
    )
  );

  return perm.length > 0 ? (perm[0] as any).isEnabled : false;
}

export async function initializeDefaultPermissions(): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db.select().from(rolePermissions);
  if (existing.length > 0) return;

  const consultantFeatures = ["patient_records", "ambient_scribe", "billing", "notifications"];
  const staffFeatures = ["patient_records", "pharmacy", "purchase_orders", "notifications"];

  for (const feature of consultantFeatures) {
    const permissionId = `PERM-${Date.now()}-${Math.random()}`;
    await db.insert(rolePermissions).values({
      permissionId,
      role: "consultant",
      featureKey: feature,
      isEnabled: true,
    } as any);
  }

  for (const feature of staffFeatures) {
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

export async function checkAppointmentConflict(consultantId: number, date: string, time: string, duration: number = 30) {
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

export async function authenticateUser(userIdOrEmail: string, password: string): Promise<{ id: number; name: string | null; email: string | null; role: string } | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let user = await db.select().from(users).where(eq(users.email, userIdOrEmail)).limit(1);
  
  if (user.length === 0) {
    user = await db.select().from(users).where(eq(users.userId, userIdOrEmail.toUpperCase())).limit(1);
  }
  
  if (user.length === 0 || !user[0].passwordHash) {
    return null;
  }

  const isPasswordValid = await verifyPassword(password, user[0].passwordHash);
  
  if (!isPasswordValid) {
    return null;
  }

  return {
    id: user[0].id as number,
    name: user[0].name,
    email: user[0].email,
    role: user[0].role,
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
