import { mysqlTable, mysqlSchema, AnyMySqlColumn, varchar, int, mysqlEnum, text, timestamp, json, decimal, index, tinyint } from "drizzle-orm/mysql-core"
import { sql } from "drizzle-orm"

export const appointments = mysqlTable("appointments", {
	appointmentId: varchar({ length: 50 }).notNull(),
	patientId: varchar({ length: 50 }).notNull(),
	consultantId: int().notNull(),
	appointmentDate: varchar({ length: 10 }).notNull(),
	appointmentTime: varchar({ length: 5 }).notNull(),
	duration: int().default(30),
	status: mysqlEnum(['Scheduled','Completed','Cancelled','No-show','Rescheduled']).default('Scheduled'),
	notes: text(),
	reminderSent: tinyint().default(0),
	reminderSentAt: timestamp({ mode: 'string' }),
	notificationMethod: varchar({ length: 50 }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const auditLogs = mysqlTable("auditLogs", {
	logId: varchar({ length: 50 }).notNull(),
	userId: varchar({ length: 100 }),
	actionType: varchar({ length: 50 }).notNull(),
	tableName: varchar({ length: 50 }),
	recordId: varchar({ length: 100 }),
	oldValue: json(),
	newValue: json(),
	ipAddress: varchar({ length: 45 }),
	timestamp: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const billItems = mysqlTable("billItems", {
	billItemId: varchar({ length: 50 }).notNull(),
	billId: varchar({ length: 50 }).notNull(),
	itemType: varchar({ length: 50 }).notNull(),
	description: varchar({ length: 255 }),
	quantity: int().default(1),
	unitPrice: decimal({ precision: 10, scale: 2 }),
	subtotal: decimal({ precision: 10, scale: 2 }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const billTemplates = mysqlTable("billTemplates", {
	templateId: varchar({ length: 50 }).notNull(),
	name: varchar({ length: 100 }).notNull(),
	description: text(),
	itemsJson: json().notNull(),
	isActive: tinyint().default(1),
	createdBy: int().notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const bills = mysqlTable("bills", {
	billId: varchar({ length: 50 }).notNull(),
	patientId: varchar({ length: 50 }).notNull(),
	consultationId: varchar({ length: 50 }),
	totalAmount: decimal({ precision: 10, scale: 2 }).notNull(),
	discountAmount: decimal({ precision: 10, scale: 2 }).default('0.00'),
	taxAmount: decimal({ precision: 10, scale: 2 }).default('0.00'),
	finalAmount: decimal({ precision: 10, scale: 2 }).notNull(),
	paymentStatus: mysqlEnum(['Pending','Paid','Partial']).default('Pending'),
	invoicePdfUrl: text(),
	invoicePdfKey: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	receiptDeliveryStatus: mysqlEnum(['Not Sent','Sent','Failed','Pending']).default('Not Sent'),
	receiptDeliveryMethod: varchar({ length: 50 }),
	receiptDeliveryTimestamp: timestamp({ mode: 'string' }),
	receiptPdfUrl: text(),
	receiptPdfKey: text(),
	consultationNotes: text(),
});

export const consultantAvailability = mysqlTable("consultantAvailability", {
	availabilityId: varchar({ length: 50 }).notNull(),
	consultantId: int().notNull(),
	dayOfWeek: int().notNull(),
	startTime: varchar({ length: 5 }).notNull(),
	endTime: varchar({ length: 5 }).notNull(),
	slotDuration: int().default(30),
	maxAppointmentsPerDay: int().default(10),
	isActive: tinyint().default(1),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const consultations = mysqlTable("consultations", {
	consultationId: varchar({ length: 50 }).notNull(),
	patientId: varchar({ length: 50 }).notNull(),
	consultationDate: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	audioFileUrl: text(),
	audioFileKey: text(),
	rawTranscript: text(),
	clinicalHistory: text(),
	presentComplaints: text(),
	advisedInvestigations: text(),
	treatmentPlan: text(),
	digitalSignature: text(),
	isFinalized: tinyint().default(0),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	consultantId: int(),
});

export const inventory = mysqlTable("inventory", {
	itemId: varchar({ length: 50 }).notNull(),
	itemName: varchar({ length: 255 }).notNull(),
	batchNumber: varchar({ length: 100 }).notNull(),
	expiryDate: varchar({ length: 10 }).notNull(),
	quantityAvailable: int().default(0),
	reorderLevel: int().default(10),
	unitPrice: decimal({ precision: 10, scale: 2 }).notNull(),
	lastRestocked: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP'),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const notificationPreferences = mysqlTable("notificationPreferences", {
	preferenceId: varchar({ length: 50 }).notNull(),
	patientId: varchar({ length: 50 }).notNull(),
	appointmentReminders: tinyint().default(1),
	reminderMethod: mysqlEnum(['SMS','Email','Both']).default('SMS'),
	billingNotifications: tinyint().default(1),
	followUpNotifications: tinyint().default(1),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const notifications = mysqlTable("notifications", {
	notificationId: varchar({ length: 50 }).notNull(),
	userId: int().notNull(),
	title: varchar({ length: 255 }).notNull(),
	content: text(),
	notificationType: varchar({ length: 50 }).notNull(),
	isRead: tinyint().default(0),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const patients = mysqlTable("patients", {
	patientId: varchar({ length: 50 }).notNull(),
	firstName: varchar({ length: 100 }).notNull(),
	lastName: varchar({ length: 100 }).notNull(),
	dateOfBirth: varchar({ length: 10 }),
	gender: varchar({ length: 20 }),
	contactNumber: varchar({ length: 20 }).notNull(),
	email: varchar({ length: 255 }),
	address: text(),
	barcodeData: varchar({ length: 255 }),
	barcodeImageUrl: text(),
	qrcodeImageUrl: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	barcodeImageKey: text(),
	qrcodeImageKey: text(),
},
(table) => [
	index("patients_barcodeData_unique").on(table.barcodeData),
]);

export const purchaseOrderItems = mysqlTable("purchaseOrderItems", {
	poItemId: varchar({ length: 50 }).notNull(),
	purchaseOrderId: varchar({ length: 50 }).notNull(),
	itemName: varchar({ length: 255 }).notNull(),
	quantity: int().default(1),
	unitPrice: decimal({ precision: 10, scale: 2 }).notNull(),
	subtotal: decimal({ precision: 10, scale: 2 }).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const purchaseOrders = mysqlTable("purchaseOrders", {
	purchaseOrderId: varchar({ length: 50 }).notNull(),
	vendorName: varchar({ length: 255 }).notNull(),
	vendorContactNumber: varchar({ length: 20 }).notNull(),
	vendorEmail: varchar({ length: 255 }),
	vendorGstNumber: varchar({ length: 50 }),
	vendorBankDetails: text(),
	vendorAddress: text(),
	totalAmount: decimal({ precision: 10, scale: 2 }).notNull(),
	paymentStatus: mysqlEnum(['Pending','Paid','Partial']).default('Pending'),
	orderDate: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	expectedDeliveryDate: varchar({ length: 10 }),
	notes: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	approvalStatus: mysqlEnum(['Pending Approval','Approved','Rejected']).default('Pending Approval'),
	rejectionReason: text(),
	approvedBy: varchar({ length: 100 }),
	approvalTimestamp: timestamp({ mode: 'string' }),
	authorizationNotes: text(),
});

export const rolePermissions = mysqlTable("rolePermissions", {
	permissionId: varchar({ length: 50 }).notNull(),
	role: varchar({ length: 20 }).notNull(),
	featureKey: varchar({ length: 100 }).notNull(),
	isEnabled: tinyint().default(1),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP'),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow(),
},
(table) => [
	index("unique_role_feature").on(table.role, table.featureKey),
	index("idx_role").on(table.role),
]);

export const users = mysqlTable("users", {
	id: int().autoincrement().notNull(),
	name: text(),
	email: varchar({ length: 320 }),
	role: mysqlEnum(['user','admin','consultant','staff']).default('user').notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	lastSignedIn: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	userId: varchar({ length: 50 }),
	username: varchar({ length: 100 }),
	passwordHash: text(),
	phone: varchar({ length: 20 }),
	department: varchar({ length: 100 }),
	isActive: tinyint().default(1),
	createdBy: int(),
	stateCounsilSection: varchar({ length: 100 }),
	registrationNumber: varchar({ length: 100 }),
},
(table) => [
	index("users_userId_unique").on(table.userId),
	index("users_username_unique").on(table.username),
]);

export const vendors = mysqlTable("vendors", {
	vendorId: varchar({ length: 50 }).notNull(),
	name: varchar({ length: 150 }).notNull(),
	contactNumber: varchar({ length: 20 }),
	gstNumber: varchar({ length: 50 }),
	address: text(),
	dlNumber: json(),
	email: varchar({ length: 320 }),
	isActive: tinyint().default(1),
	createdBy: int().notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
