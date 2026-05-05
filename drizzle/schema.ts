import { decimal, int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, json, index } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "consultant", "staff"]).default("user").notNull(),
  // RBAC fields for consultant/staff management
  userId: varchar("userId", { length: 50 }).unique(), // Unique ID for consultant/staff
  username: varchar("username", { length: 100 }).unique(), // Username for local login
  passwordHash: text("passwordHash"), // Hashed password for local login
  phone: varchar("phone", { length: 20 }),
  department: varchar("department", { length: 100 }), // e.g., Orthopedics, General
  isActive: boolean("isActive").default(true),
  qrcodeLoginUrl: text("qrcodeLoginUrl"), // QR code data URL for easy login
  qrcodeLoginKey: text("qrcodeLoginKey"), // Storage key for QR code image
  createdBy: int("createdBy"), // Admin user ID who created this user
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Patients Module
export const patients = mysqlTable("patients", {
  patientId: varchar("patientId", { length: 50 }).primaryKey(),
  firstName: varchar("firstName", { length: 100 }).notNull(),
  lastName: varchar("lastName", { length: 100 }).notNull(),
  dateOfBirth: varchar("dateOfBirth", { length: 10 }).notNull(),
  gender: varchar("gender", { length: 20 }),
  contactNumber: varchar("contactNumber", { length: 20 }).notNull(),
  email: varchar("email", { length: 255 }),
  address: text("address"),
  barcodeData: varchar("barcodeData", { length: 255 }).unique(),
  barcodeImageUrl: text("barcodeImageUrl"),
  barcodeImageKey: text("barcodeImageKey"),
  qrcodeImageUrl: text("qrcodeImageUrl"),
  qrcodeImageKey: text("qrcodeImageKey"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Patient = typeof patients.$inferSelect;
export type InsertPatient = typeof patients.$inferInsert;

// Clinical Documentation - Consultations
export const consultations = mysqlTable("consultations", {
  consultationId: varchar("consultationId", { length: 50 }).primaryKey(),
  patientId: varchar("patientId", { length: 50 }).notNull(),
  consultationDate: timestamp("consultationDate").defaultNow().notNull(),
  audioFileUrl: text("audioFileUrl"),
  audioFileKey: text("audioFileKey"),
  rawTranscript: text("rawTranscript"),
  clinicalHistory: text("clinicalHistory"),
  presentComplaints: text("presentComplaints"),
  advisedInvestigations: text("advisedInvestigations"),
  treatmentPlan: text("treatmentPlan"),
  digitalSignature: text("digitalSignature"),
  isFinalized: boolean("isFinalized").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Consultation = typeof consultations.$inferSelect;
export type InsertConsultation = typeof consultations.$inferInsert;

// Pharmacy Inventory
export const inventory = mysqlTable("inventory", {
  itemId: varchar("itemId", { length: 50 }).primaryKey(),
  itemName: varchar("itemName", { length: 255 }).notNull(),
  batchNumber: varchar("batchNumber", { length: 100 }).notNull(),
  expiryDate: varchar("expiryDate", { length: 10 }).notNull(),
  quantityAvailable: int("quantityAvailable").default(0),
  reorderLevel: int("reorderLevel").default(10),
  unitPrice: decimal("unitPrice", { precision: 10, scale: 2 }).notNull(),
  lastRestocked: timestamp("lastRestocked").defaultNow(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type InventoryItem = typeof inventory.$inferSelect;
export type InsertInventoryItem = typeof inventory.$inferInsert;

// Billing - Bills
export const bills = mysqlTable("bills", {
  billId: varchar("billId", { length: 50 }).primaryKey(),
  patientId: varchar("patientId", { length: 50 }).notNull(),
  consultationId: varchar("consultationId", { length: 50 }),
  totalAmount: decimal("totalAmount", { precision: 10, scale: 2 }).notNull(),
  discountAmount: decimal("discountAmount", { precision: 10, scale: 2 }).default("0.00"),
  taxAmount: decimal("taxAmount", { precision: 10, scale: 2 }).default("0.00"),
  finalAmount: decimal("finalAmount", { precision: 10, scale: 2 }).notNull(),
  paymentStatus: mysqlEnum("paymentStatus", ["Pending", "Paid", "Partial"]).default("Pending"),
  invoicePdfUrl: text("invoicePdfUrl"),
  invoicePdfKey: text("invoicePdfKey"),
  receiptPdfUrl: text("receiptPdfUrl"),
  receiptPdfKey: text("receiptPdfKey"),
  consultationNotes: text("consultationNotes"),
  receiptDeliveryStatus: mysqlEnum("receiptDeliveryStatus", ["Not Sent", "Sent", "Failed", "Pending"]).default("Not Sent"),
  receiptDeliveryMethod: varchar("receiptDeliveryMethod", { length: 50 }),
  receiptDeliveryTimestamp: timestamp("receiptDeliveryTimestamp"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Bill = typeof bills.$inferSelect;
export type InsertBill = typeof bills.$inferInsert;

// Billing - Bill Items
export const billItems = mysqlTable("billItems", {
  billItemId: varchar("billItemId", { length: 50 }).primaryKey(),
  billId: varchar("billId", { length: 50 }).notNull(),
  itemType: varchar("itemType", { length: 50 }).notNull(), // 'Consultation', 'Medicine', 'Procedure'
  description: varchar("description", { length: 255 }),
  quantity: int("quantity").default(1),
  unitPrice: decimal("unitPrice", { precision: 10, scale: 2 }),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type BillItem = typeof billItems.$inferSelect;
export type InsertBillItem = typeof billItems.$inferInsert;

// Audit Logs - Immutable
export const auditLogs = mysqlTable("auditLogs", {
  logId: varchar("logId", { length: 50 }).primaryKey(),
  userId: varchar("userId", { length: 100 }),
  actionType: varchar("actionType", { length: 50 }).notNull(), // CREATE, UPDATE, DELETE, ACCESS
  tableName: varchar("tableName", { length: 50 }),
  recordId: varchar("recordId", { length: 100 }),
  oldValue: json("oldValue"),
  newValue: json("newValue"),
  ipAddress: varchar("ipAddress", { length: 45 }),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

// Notifications
export const notifications = mysqlTable("notifications", {
  notificationId: varchar("notificationId", { length: 50 }).primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content"),
  notificationType: varchar("notificationType", { length: 50 }).notNull(), // 'patient_registration', 'invoice_generated', 'low_stock'
  isRead: boolean("isRead").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

// Pharmacy Purchase Orders
export const purchaseOrders = mysqlTable("purchaseOrders", {
  purchaseOrderId: varchar("purchaseOrderId", { length: 50 }).primaryKey(),
  vendorName: varchar("vendorName", { length: 255 }).notNull(),
  vendorContactNumber: varchar("vendorContactNumber", { length: 20 }).notNull(),
  vendorEmail: varchar("vendorEmail", { length: 255 }),
  vendorGSTNumber: varchar("vendorGSTNumber", { length: 50 }),
  vendorBankDetails: text("vendorBankDetails"),
  vendorAddress: text("vendorAddress"),
  totalAmount: decimal("totalAmount", { precision: 10, scale: 2 }).notNull(),
  paymentStatus: mysqlEnum("paymentStatus", ["Pending", "Paid", "Partial"]).default("Pending"),
  approvalStatus: mysqlEnum("approvalStatus", ["Pending Approval", "Approved", "Rejected"]).default("Pending Approval"),
  rejectionReason: text("rejectionReason"),
  approvedBy: varchar("approvedBy", { length: 100 }),
  approvalTimestamp: timestamp("approvalTimestamp"),
  orderDate: timestamp("orderDate").defaultNow().notNull(),
  expectedDeliveryDate: varchar("expectedDeliveryDate", { length: 10 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type InsertPurchaseOrder = typeof purchaseOrders.$inferInsert;

// Purchase Order Items
export const purchaseOrderItems = mysqlTable("purchaseOrderItems", {
  poItemId: varchar("poItemId", { length: 50 }).primaryKey(),
  purchaseOrderId: varchar("purchaseOrderId", { length: 50 }).notNull(),
  itemName: varchar("itemName", { length: 255 }).notNull(),
  quantity: int("quantity").default(1),
  unitPrice: decimal("unitPrice", { precision: 10, scale: 2 }).notNull(),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PurchaseOrderItem = typeof purchaseOrderItems.$inferSelect;
export type InsertPurchaseOrderItem = typeof purchaseOrderItems.$inferInsert;