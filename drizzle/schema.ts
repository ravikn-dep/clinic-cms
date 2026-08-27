import { mysqlTable, mysqlSchema, AnyMySqlColumn, varchar, int, mysqlEnum, text, timestamp, json, decimal, index, tinyint, uniqueIndex } from "drizzle-orm/mysql-core"
import { sql } from "drizzle-orm"

export const appointments = mysqlTable("appointments", {
	appointmentId: varchar({ length: 50 }).notNull(),
	patientId: varchar({ length: 50 }).notNull(),
	consultantId: int().notNull(),
	appointmentDate: varchar({ length: 10 }).notNull(),
	appointmentTime: varchar({ length: 5 }).notNull(),
	duration: int().default(30),
	status: mysqlEnum(['Scheduled','Checked-in','Completed','Cancelled','No-show','Rescheduled']).default('Scheduled'),
	appointmentSource: mysqlEnum(['MANUAL','WALK_IN','PHONE']).default('MANUAL').notNull(),
	notes: text(),
	reminderSent: tinyint().default(0),
	reminderSentAt: timestamp({ mode: 'string' }),
	notificationMethod: varchar({ length: 50 }),
	checkedInAt: timestamp({ mode: 'string' }),
	checkedInBy: varchar({ length: 100 }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	uniqueIndex("appointments_appointmentId_unique").on(table.appointmentId),
	index("appointments_patientId_idx").on(table.patientId),
]);

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
	encounterId: varchar({ length: 50 }),
	}, (table) => [
		uniqueIndex("bills_consultationId_unique").on(table.consultationId),
		uniqueIndex("bills_encounterId_unique").on(table.encounterId),
	]);

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

export const patientIdSequences = mysqlTable("patientIdSequences", {
	sequenceDate: varchar({ length: 10 }).notNull(),
	nextSequence: int().notNull().default(1),
	createdAt: timestamp({ mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, (table) => [
	uniqueIndex("patientIdSequences_sequenceDate_unique").on(table.sequenceDate),
]);

export const encounters = mysqlTable("encounters", {
	encounterId: varchar({ length: 50 }).notNull(),
	patientId: varchar({ length: 50 }).notNull(),
	consultantId: int().notNull(),
	appointmentId: varchar({ length: 50 }),
	source: mysqlEnum(['WALK_IN','APPOINTMENT','PHONE','MANUAL']).default('WALK_IN').notNull(),
	status: mysqlEnum(['Present','Checked-in','OP Generated','Ready for Billing','Closed']).default('Present').notNull(),
	createdBy: varchar({ length: 100 }).notNull(),
	createdAt: timestamp({ mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	closedAt: timestamp({ mode: 'string' }),
}, (table) => [
	uniqueIndex("encounters_encounterId_unique").on(table.encounterId),
	uniqueIndex("encounters_appointmentId_unique").on(table.appointmentId),
	index("encounters_patientId_idx").on(table.patientId),
	index("encounters_consultantId_idx").on(table.consultantId),
]);

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
		appointmentId: varchar({ length: 50 }),
		encounterId: varchar({ length: 50 }),
	}, (table) => [
		uniqueIndex("consultations_appointmentId_unique").on(table.appointmentId),
		uniqueIndex("consultations_encounterId_unique").on(table.encounterId),
]);

export const inventory = mysqlTable("inventory", {
	itemId: varchar({ length: 50 }).notNull(),
	itemName: varchar({ length: 255 }).notNull(),
	catalogItemId: varchar({ length: 50 }),
	batchNumber: varchar({ length: 100 }).notNull(),
	expiryDate: varchar({ length: 10 }).notNull(),
	quantityAvailable: int().default(0),
	reorderLevel: int().default(10),
	unitPrice: decimal({ precision: 10, scale: 2 }).notNull(),
	sourcePurchaseOrderId: varchar({ length: 50 }),
	sourceGoodsReceiptId: varchar({ length: 50 }),
	lastRestocked: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP'),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
	(table) => [
		uniqueIndex("inventory_item_batch_expiry_unique").on(table.itemName, table.batchNumber, table.expiryDate),
		uniqueIndex("inventory_catalog_batch_expiry_unique").on(table.catalogItemId, table.batchNumber, table.expiryDate),
	]);

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
	age: int(),
	gender: varchar({ length: 20 }),
	contactNumber: varchar({ length: 20 }).notNull(),
	normalizedContactNumber: varchar({ length: 15 }),
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
	uniqueIndex("patients_patientId_unique").on(table.patientId),
	index("patients_barcodeData_unique").on(table.barcodeData),
	index("patients_normalizedContactNumber_idx").on(table.normalizedContactNumber),
]);

export const purchaseOrderItems = mysqlTable("purchaseOrderItems", {
	poItemId: varchar({ length: 50 }).notNull(),
	purchaseOrderId: varchar({ length: 50 }).notNull(),
	itemName: varchar({ length: 255 }).notNull(),
	catalogItemId: varchar({ length: 50 }),
	quantity: int().default(1),
	receivedQuantity: int().default(0).notNull(),
	unitPrice: decimal({ precision: 10, scale: 2 }).notNull(),
	subtotal: decimal({ precision: 10, scale: 2 }).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const purchaseOrders = mysqlTable("purchaseOrders", {
	purchaseOrderId: varchar({ length: 50 }).notNull(),
	vendorId: varchar({ length: 50 }),
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
},
	(table) => [
		index("purchaseOrders_vendorId_idx").on(table.vendorId),
	]);

export const goodsReceipts = mysqlTable("goodsReceipts", {
	goodsReceiptId: varchar({ length: 50 }).notNull(),
	purchaseOrderId: varchar({ length: 50 }).notNull(),
	receivedAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	receivedBy: varchar({ length: 100 }).notNull(),
	status: mysqlEnum(['Posted','Voided']).default('Posted').notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
	(table) => [
		uniqueIndex("goodsReceipts_goodsReceiptId_unique").on(table.goodsReceiptId),
		index("goodsReceipts_purchaseOrderId_idx").on(table.purchaseOrderId),
	]);

export const goodsReceiptItems = mysqlTable("goodsReceiptItems", {
	goodsReceiptItemId: varchar({ length: 50 }).notNull(),
	goodsReceiptId: varchar({ length: 50 }).notNull(),
	purchaseOrderId: varchar({ length: 50 }).notNull(),
	poItemId: varchar({ length: 50 }).notNull(),
	itemName: varchar({ length: 255 }).notNull(),
	receivedQuantity: int().notNull(),
	batchNumber: varchar({ length: 100 }).notNull(),
	expiryDate: varchar({ length: 10 }).notNull(),
	unitCost: decimal({ precision: 10, scale: 2 }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
	(table) => [
		uniqueIndex("goodsReceiptItems_goodsReceiptItemId_unique").on(table.goodsReceiptItemId),
		uniqueIndex("goodsReceiptItems_receipt_poItem_batch_unique").on(table.goodsReceiptId, table.poItemId, table.batchNumber),
		index("goodsReceiptItems_purchaseOrderId_idx").on(table.purchaseOrderId),
		index("goodsReceiptItems_poItemId_idx").on(table.poItemId),
	]);

export const stockMovements = mysqlTable("stockMovements", {
	movementId: varchar({ length: 50 }).notNull(),
	goodsReceiptId: varchar({ length: 50 }).notNull(),
	goodsReceiptItemId: varchar({ length: 50 }).notNull(),
	purchaseOrderId: varchar({ length: 50 }).notNull(),
	inventoryItemId: varchar({ length: 50 }).notNull(),
	catalogItemId: varchar({ length: 50 }),
	itemName: varchar({ length: 255 }).notNull(),
	batchNumber: varchar({ length: 100 }).notNull(),
	quantityAdded: int().notNull(),
	previousQuantity: int().notNull(),
	resultingQuantity: int().notNull(),
	actorId: varchar({ length: 100 }).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
	(table) => [
		uniqueIndex("stockMovements_movementId_unique").on(table.movementId),
		uniqueIndex("stockMovements_receiptItem_unique").on(table.goodsReceiptItemId),
		index("stockMovements_goodsReceiptId_idx").on(table.goodsReceiptId),
		index("stockMovements_purchaseOrderId_idx").on(table.purchaseOrderId),
	]);

export const purchaseOrderHistory = mysqlTable("purchaseOrderHistory", {
	historyId: varchar({ length: 50 }).notNull(),
	purchaseOrderId: varchar({ length: 50 }).notNull(),
	eventType: varchar({ length: 50 }).notNull(),
	actorId: varchar({ length: 100 }).notNull(),
	actorName: varchar({ length: 255 }),
	eventSummary: varchar({ length: 500 }).notNull(),
	details: text(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	uniqueIndex("purchaseOrderHistory_historyId_unique").on(table.historyId),
	index("purchaseOrderHistory_purchaseOrder_createdAt_idx").on(table.purchaseOrderId, table.createdAt),
]);

/**
 * Immutable, one-per-PO evidence snapshot created only with an explicitly
 * submitted reviewed OCR/parser purchase order. The project schema does not
 * currently declare relational foreign keys; uniqueness and application-level
 * transaction boundaries preserve the PO linkage consistently.
 */
export const purchaseOrderExtractionReviews = mysqlTable("purchaseOrderExtractionReviews", {
	reviewId: varchar({ length: 50 }).primaryKey(),
	purchaseOrderId: varchar({ length: 50 }).notNull(),
	reviewSubmissionId: varchar({ length: 100 }).notNull(),
	extractionProvider: varchar({ length: 64 }).notNull(),
	documentType: varchar({ length: 32 }).notNull(),
	reviewStatus: mysqlEnum(["CONFIRMED"]).default("CONFIRMED").notNull(),
	reviewerUserId: varchar({ length: 100 }).notNull(),
	reviewerName: varchar({ length: 255 }),
	reviewedAt: timestamp({ mode: "string" }).default("CURRENT_TIMESTAMP").notNull(),
	createdAt: timestamp({ mode: "string" }).default("CURRENT_TIMESTAMP").notNull(),
	extractedHeaderJson: text().notNull(),
	extractedItemsJson: text().notNull(),
	extractedTotalsJson: text().notNull(),
	reconciliationJson: text().notNull(),
	warningsJson: text().notNull(),
	correctedFieldsJson: text().notNull(),
	finalReviewedValuesJson: text().notNull(),
	catalogResolutionsJson: text(),
}, (table) => [
	uniqueIndex("purchaseOrderExtractionReviews_reviewId_unique").on(table.reviewId),
	uniqueIndex("purchaseOrderExtractionReviews_purchaseOrder_unique").on(table.purchaseOrderId),
	uniqueIndex("purchaseOrderExtractionReviews_submission_unique").on(table.reviewSubmissionId),
	index("purchaseOrderExtractionReviews_reviewer_createdAt_idx").on(table.reviewerUserId, table.createdAt),
]);

/**
 * Canonical product identity. Inventory remains batch-centric and must not be
 * treated as this catalog; catalog data is curated explicitly and never
 * inferred from OCR or a supplier invoice.
 */
export const catalogItems = mysqlTable("catalogItems", {
	catalogItemId: varchar({ length: 50 }).primaryKey(),
	canonicalName: varchar({ length: 255 }).notNull(),
	normalizedName: varchar({ length: 255 }).notNull(),
	genericName: varchar({ length: 255 }),
	brandName: varchar({ length: 255 }),
	strength: varchar({ length: 100 }),
	dosageForm: varchar({ length: 100 }),
	manufacturer: varchar({ length: 255 }),
	hsnCode: varchar({ length: 32 }),
	gstRate: decimal({ precision: 5, scale: 2 }),
	active: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: "string" }).default("CURRENT_TIMESTAMP").notNull(),
	updatedAt: timestamp({ mode: "string" }).defaultNow().onUpdateNow().notNull(),
}, (table) => [
	uniqueIndex("catalogItems_catalogItemId_unique").on(table.catalogItemId),
	uniqueIndex("catalogItems_normalizedName_unique").on(table.normalizedName),
	index("catalogItems_active_normalizedName_idx").on(table.active, table.normalizedName),
]);

/**
 * Controlled aliases for catalog entries. An empty vendorId denotes a global
 * alias; vendor-specific aliases retain their actual vendor ID. No automatic
 * alias-learning endpoint is introduced in Step 5.
 */
export const catalogItemAliases = mysqlTable("catalogItemAliases", {
	aliasId: varchar({ length: 50 }).primaryKey(),
	catalogItemId: varchar({ length: 50 }).notNull(),
	vendorId: varchar({ length: 50 }).notNull().default(""),
	aliasText: varchar({ length: 255 }).notNull(),
	normalizedAlias: varchar({ length: 255 }).notNull(),
	source: varchar({ length: 50 }).notNull(),
	active: tinyint().default(1).notNull(),
	createdBy: varchar({ length: 100 }),
	createdAt: timestamp({ mode: "string" }).default("CURRENT_TIMESTAMP").notNull(),
}, (table) => [
	uniqueIndex("catalogItemAliases_aliasId_unique").on(table.aliasId),
	uniqueIndex("catalogItemAliases_vendor_alias_unique").on(table.vendorId, table.normalizedAlias),
	index("catalogItemAliases_catalogItem_active_idx").on(table.catalogItemId, table.active),
]);

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
		openId: varchar({ length: 64 }).notNull().unique(),
		loginMethod: varchar({ length: 64 }),
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
		qualifications: varchar({ length: 255 }),
		specialization: varchar({ length: 255 }),
		designation: varchar({ length: 255 }),
		prescriptionHeaderText: text(),
		consultantLogoKey: text(),
		signatureKey: text(),
		consultantLocation: text(),
	},
(table) => [
	index("users_userId_unique").on(table.userId),
	index("users_username_unique").on(table.username),
]);

export const vendors = mysqlTable("vendors", {
	vendorId: varchar({ length: 50 }).notNull(),
	name: varchar({ length: 150 }).notNull(),
	normalizedVendorName: varchar({ length: 255 }),
	contactNumber: varchar({ length: 20 }),
	gstNumber: varchar({ length: 50 }),
	normalizedGstNumber: varchar({ length: 50 }),
	address: text(),
	bankDetails: text(),
	dlNumber: json(),
	email: varchar({ length: 320 }),
	isActive: tinyint().default(1),
	createdBy: int().notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
	(table) => [
		index("vendors_active_normalizedVendorName_idx").on(table.isActive, table.normalizedVendorName),
		index("vendors_normalizedGstNumber_idx").on(table.normalizedGstNumber),
	]);

/**
 * A stable row per PO serializes all app-mediated receipt posts for that PO.
 * The lock is acquired inside the same database transaction that posts a
 * Goods Receipt, preventing concurrent receipts from exceeding ordered stock.
 */
export const procurementPostingLocks = mysqlTable("procurementPostingLocks", {
	purchaseOrderId: varchar({ length: 50 }).primaryKey(),
	updatedAt: timestamp({ mode: "string" }).defaultNow().onUpdateNow().notNull(),
});

export const enquiries = mysqlTable("enquiries", {
	enquiryId: varchar({ length: 64 }).notNull(),
	patientId: varchar({ length: 50 }),
	appointmentId: varchar({ length: 50 }),
	channel: mysqlEnum(['VOICE', 'WHATSAPP', 'PHONE', 'WALK_IN', 'WEBSITE', 'GOOGLE', 'INSTAGRAM', 'REFERRAL', 'OTHER']).notNull(),
	sourceDetail: varchar({ length: 255 }),
	lifecycleStage: mysqlEnum(['NEW', 'DETAILS_COLLECTED', 'APPOINTMENT_OFFERED', 'BOOKED', 'CONFIRMED', 'CHECKED_IN', 'OP_COMPLETED', 'NO_SHOW', 'CANCELLED', 'LOST']).default('NEW').notNull(),
	preferredLanguage: mysqlEnum(['en-IN', 'hi-IN', 'te-IN', 'mixed']).default('mixed').notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	uniqueIndex("enquiries_enquiryId_unique").on(table.enquiryId),
	index("enquiries_patientId_idx").on(table.patientId),
	index("enquiries_appointmentId_idx").on(table.appointmentId),
]);

export const externalApiAuditLogs = mysqlTable("externalApiAuditLogs", {
	auditId: varchar({ length: 64 }).notNull(),
	requestId: varchar({ length: 64 }).notNull(),
	serviceKeyId: varchar({ length: 100 }),
	action: varchar({ length: 100 }).notNull(),
	resourceType: varchar({ length: 50 }).notNull(),
	resourceId: varchar({ length: 100 }),
	result: mysqlEnum(['SUCCESS', 'DENIED', 'ERROR', 'IDEMPOTENT_REPLAY']).notNull(),
	safeMetadata: json(),
	timestamp: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	uniqueIndex("externalApiAuditLogs_auditId_unique").on(table.auditId),
	index("externalApiAuditLogs_requestId_idx").on(table.requestId),
	index("externalApiAuditLogs_serviceKeyId_idx").on(table.serviceKeyId),
]);

export const externalIdempotencyKeys = mysqlTable("externalIdempotencyKeys", {
	idempotencyId: varchar({ length: 64 }).notNull(),
	operation: varchar({ length: 100 }).notNull(),
	idempotencyKey: varchar({ length: 128 }).notNull(),
	requestHash: varchar({ length: 64 }).notNull(),
	serviceKeyId: varchar({ length: 100 }).notNull(),
	resourceType: varchar({ length: 50 }),
	resourceId: varchar({ length: 100 }),
	responseStatus: int().notNull(),
	responseBody: json().notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	expiresAt: timestamp({ mode: 'string' }),
},
(table) => [
	uniqueIndex("externalIdempotency_operation_key_unique").on(table.operation, table.idempotencyKey),
	uniqueIndex("externalIdempotency_idempotencyId_unique").on(table.idempotencyId),
	index("externalIdempotency_serviceKeyId_idx").on(table.serviceKeyId),
]);

export const appointmentBookingLocks = mysqlTable("appointmentBookingLocks", {
	consultantId: int().notNull(),
	appointmentDate: varchar({ length: 10 }).notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	uniqueIndex("appointmentBookingLocks_consultant_date_unique").on(table.consultantId, table.appointmentDate),
]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const externalRequestReplays = mysqlTable("externalRequestReplays", {
	replayId: varchar({ length: 64 }).notNull(),
	serviceKeyId: varchar({ length: 100 }).notNull(),
	requestId: varchar({ length: 64 }).notNull(),
	endpoint: varchar({ length: 255 }).notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	uniqueIndex("externalRequestReplays_key_request_unique").on(table.serviceKeyId, table.requestId),
	index("externalRequestReplays_createdAt_idx").on(table.createdAt),
]);
