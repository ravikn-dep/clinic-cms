CREATE TABLE `appointmentBookingLocks` (
	`consultantId` int NOT NULL,
	`appointmentDate` varchar(10) NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `appointmentBookingLocks_consultant_date_unique` UNIQUE(`consultantId`,`appointmentDate`)
);
--> statement-breakpoint
CREATE TABLE `appointments` (
	`appointmentId` varchar(50) NOT NULL,
	`patientId` varchar(50) NOT NULL,
	`consultantId` int NOT NULL,
	`appointmentDate` varchar(10) NOT NULL,
	`appointmentTime` varchar(5) NOT NULL,
	`duration` int DEFAULT 30,
	`status` enum('Scheduled','Completed','Cancelled','No-show','Rescheduled') DEFAULT 'Scheduled',
	`notes` text,
	`reminderSent` tinyint DEFAULT 0,
	`reminderSentAt` timestamp,
	`notificationMethod` varchar(50),
	`checkedInAt` timestamp,
	`checkedInBy` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `appointments_appointmentId_unique` UNIQUE(`appointmentId`)
);
--> statement-breakpoint
CREATE TABLE `auditLogs` (
	`logId` varchar(50) NOT NULL,
	`userId` varchar(100),
	`actionType` varchar(50) NOT NULL,
	`tableName` varchar(50),
	`recordId` varchar(100),
	`oldValue` json,
	`newValue` json,
	`ipAddress` varchar(45),
	`timestamp` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `billItems` (
	`billItemId` varchar(50) NOT NULL,
	`billId` varchar(50) NOT NULL,
	`itemType` varchar(50) NOT NULL,
	`description` varchar(255),
	`quantity` int DEFAULT 1,
	`unitPrice` decimal(10,2),
	`subtotal` decimal(10,2),
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `billTemplates` (
	`templateId` varchar(50) NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`itemsJson` json NOT NULL,
	`isActive` tinyint DEFAULT 1,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `bills` (
	`billId` varchar(50) NOT NULL,
	`patientId` varchar(50) NOT NULL,
	`consultationId` varchar(50),
	`totalAmount` decimal(10,2) NOT NULL,
	`discountAmount` decimal(10,2) DEFAULT '0.00',
	`taxAmount` decimal(10,2) DEFAULT '0.00',
	`finalAmount` decimal(10,2) NOT NULL,
	`paymentStatus` enum('Pending','Paid','Partial') DEFAULT 'Pending',
	`invoicePdfUrl` text,
	`invoicePdfKey` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`receiptDeliveryStatus` enum('Not Sent','Sent','Failed','Pending') DEFAULT 'Not Sent',
	`receiptDeliveryMethod` varchar(50),
	`receiptDeliveryTimestamp` timestamp,
	`receiptPdfUrl` text,
	`receiptPdfKey` text,
	`consultationNotes` text
);
--> statement-breakpoint
CREATE TABLE `consultantAvailability` (
	`availabilityId` varchar(50) NOT NULL,
	`consultantId` int NOT NULL,
	`dayOfWeek` int NOT NULL,
	`startTime` varchar(5) NOT NULL,
	`endTime` varchar(5) NOT NULL,
	`slotDuration` int DEFAULT 30,
	`maxAppointmentsPerDay` int DEFAULT 10,
	`isActive` tinyint DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `consultations` (
	`consultationId` varchar(50) NOT NULL,
	`patientId` varchar(50) NOT NULL,
	`consultationDate` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`audioFileUrl` text,
	`audioFileKey` text,
	`rawTranscript` text,
	`clinicalHistory` text,
	`presentComplaints` text,
	`advisedInvestigations` text,
	`treatmentPlan` text,
	`digitalSignature` text,
	`isFinalized` tinyint DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`consultantId` int
);
--> statement-breakpoint
CREATE TABLE `enquiries` (
	`enquiryId` varchar(64) NOT NULL,
	`patientId` varchar(50),
	`appointmentId` varchar(50),
	`channel` enum('VOICE','WHATSAPP','PHONE','WALK_IN','WEBSITE','GOOGLE','INSTAGRAM','REFERRAL','OTHER') NOT NULL,
	`sourceDetail` varchar(255),
	`lifecycleStage` enum('NEW','DETAILS_COLLECTED','APPOINTMENT_OFFERED','BOOKED','CONFIRMED','CHECKED_IN','OP_COMPLETED','NO_SHOW','CANCELLED','LOST') NOT NULL DEFAULT 'NEW',
	`preferredLanguage` enum('en-IN','hi-IN','te-IN','mixed') NOT NULL DEFAULT 'mixed',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `enquiries_enquiryId_unique` UNIQUE(`enquiryId`)
);
--> statement-breakpoint
CREATE TABLE `externalApiAuditLogs` (
	`auditId` varchar(64) NOT NULL,
	`requestId` varchar(64) NOT NULL,
	`serviceKeyId` varchar(100),
	`action` varchar(100) NOT NULL,
	`resourceType` varchar(50) NOT NULL,
	`resourceId` varchar(100),
	`result` enum('SUCCESS','DENIED','ERROR','IDEMPOTENT_REPLAY') NOT NULL,
	`safeMetadata` json,
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `externalApiAuditLogs_auditId_unique` UNIQUE(`auditId`)
);
--> statement-breakpoint
CREATE TABLE `externalIdempotencyKeys` (
	`idempotencyId` varchar(64) NOT NULL,
	`operation` varchar(100) NOT NULL,
	`idempotencyKey` varchar(128) NOT NULL,
	`requestHash` varchar(64) NOT NULL,
	`serviceKeyId` varchar(100) NOT NULL,
	`resourceType` varchar(50),
	`resourceId` varchar(100),
	`responseStatus` int NOT NULL,
	`responseBody` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp,
	CONSTRAINT `externalIdempotency_operation_key_unique` UNIQUE(`operation`,`idempotencyKey`),
	CONSTRAINT `externalIdempotency_idempotencyId_unique` UNIQUE(`idempotencyId`)
);
--> statement-breakpoint
CREATE TABLE `externalRequestReplays` (
	`replayId` varchar(64) NOT NULL,
	`serviceKeyId` varchar(100) NOT NULL,
	`requestId` varchar(64) NOT NULL,
	`endpoint` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `externalRequestReplays_key_request_unique` UNIQUE(`serviceKeyId`,`requestId`)
);
--> statement-breakpoint
CREATE TABLE `goodsReceiptItems` (
	`goodsReceiptItemId` varchar(50) NOT NULL,
	`goodsReceiptId` varchar(50) NOT NULL,
	`purchaseOrderId` varchar(50) NOT NULL,
	`poItemId` varchar(50) NOT NULL,
	`itemName` varchar(255) NOT NULL,
	`receivedQuantity` int NOT NULL,
	`batchNumber` varchar(100) NOT NULL,
	`expiryDate` varchar(10) NOT NULL,
	`unitCost` decimal(10,2),
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	CONSTRAINT `goodsReceiptItems_goodsReceiptItemId_unique` UNIQUE(`goodsReceiptItemId`),
	CONSTRAINT `goodsReceiptItems_receipt_poItem_batch_unique` UNIQUE(`goodsReceiptId`,`poItemId`,`batchNumber`)
);
--> statement-breakpoint
CREATE TABLE `goodsReceipts` (
	`goodsReceiptId` varchar(50) NOT NULL,
	`purchaseOrderId` varchar(50) NOT NULL,
	`receivedAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`receivedBy` varchar(100) NOT NULL,
	`status` enum('Posted','Voided') NOT NULL DEFAULT 'Posted',
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	CONSTRAINT `goodsReceipts_goodsReceiptId_unique` UNIQUE(`goodsReceiptId`)
);
--> statement-breakpoint
CREATE TABLE `inventory` (
	`itemId` varchar(50) NOT NULL,
	`itemName` varchar(255) NOT NULL,
	`batchNumber` varchar(100) NOT NULL,
	`expiryDate` varchar(10) NOT NULL,
	`quantityAvailable` int DEFAULT 0,
	`reorderLevel` int DEFAULT 10,
	`unitPrice` decimal(10,2) NOT NULL,
	`sourcePurchaseOrderId` varchar(50),
	`sourceGoodsReceiptId` varchar(50),
	`lastRestocked` timestamp DEFAULT 'CURRENT_TIMESTAMP',
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inventory_item_batch_expiry_unique` UNIQUE(`itemName`,`batchNumber`,`expiryDate`)
);
--> statement-breakpoint
CREATE TABLE `notificationPreferences` (
	`preferenceId` varchar(50) NOT NULL,
	`patientId` varchar(50) NOT NULL,
	`appointmentReminders` tinyint DEFAULT 1,
	`reminderMethod` enum('SMS','Email','Both') DEFAULT 'SMS',
	`billingNotifications` tinyint DEFAULT 1,
	`followUpNotifications` tinyint DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`notificationId` varchar(50) NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`content` text,
	`notificationType` varchar(50) NOT NULL,
	`isRead` tinyint DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `patients` (
	`patientId` varchar(50) NOT NULL,
	`firstName` varchar(100) NOT NULL,
	`lastName` varchar(100) NOT NULL,
	`dateOfBirth` varchar(10),
	`age` int,
	`gender` varchar(20),
	`contactNumber` varchar(20) NOT NULL,
	`normalizedContactNumber` varchar(15),
	`email` varchar(255),
	`address` text,
	`barcodeData` varchar(255),
	`barcodeImageUrl` text,
	`qrcodeImageUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`barcodeImageKey` text,
	`qrcodeImageKey` text,
	CONSTRAINT `patients_patientId_unique` UNIQUE(`patientId`)
);
--> statement-breakpoint
CREATE TABLE `purchaseOrderHistory` (
	`historyId` varchar(50) NOT NULL,
	`purchaseOrderId` varchar(50) NOT NULL,
	`eventType` varchar(50) NOT NULL,
	`actorId` varchar(100) NOT NULL,
	`actorName` varchar(255),
	`eventSummary` varchar(500) NOT NULL,
	`details` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `purchaseOrderHistory_historyId_unique` UNIQUE(`historyId`)
);
--> statement-breakpoint
CREATE TABLE `purchaseOrderItems` (
	`poItemId` varchar(50) NOT NULL,
	`purchaseOrderId` varchar(50) NOT NULL,
	`itemName` varchar(255) NOT NULL,
	`quantity` int DEFAULT 1,
	`receivedQuantity` int NOT NULL DEFAULT 0,
	`unitPrice` decimal(10,2) NOT NULL,
	`subtotal` decimal(10,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `purchaseOrders` (
	`purchaseOrderId` varchar(50) NOT NULL,
	`vendorName` varchar(255) NOT NULL,
	`vendorContactNumber` varchar(20) NOT NULL,
	`vendorEmail` varchar(255),
	`vendorGstNumber` varchar(50),
	`vendorBankDetails` text,
	`vendorAddress` text,
	`totalAmount` decimal(10,2) NOT NULL,
	`paymentStatus` enum('Pending','Paid','Partial') DEFAULT 'Pending',
	`orderDate` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`expectedDeliveryDate` varchar(10),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`approvalStatus` enum('Pending Approval','Approved','Rejected') DEFAULT 'Pending Approval',
	`rejectionReason` text,
	`approvedBy` varchar(100),
	`approvalTimestamp` timestamp,
	`authorizationNotes` text
);
--> statement-breakpoint
CREATE TABLE `rolePermissions` (
	`permissionId` varchar(50) NOT NULL,
	`role` varchar(20) NOT NULL,
	`featureKey` varchar(100) NOT NULL,
	`isEnabled` tinyint DEFAULT 1,
	`createdAt` timestamp DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `stockMovements` (
	`movementId` varchar(50) NOT NULL,
	`goodsReceiptId` varchar(50) NOT NULL,
	`goodsReceiptItemId` varchar(50) NOT NULL,
	`purchaseOrderId` varchar(50) NOT NULL,
	`inventoryItemId` varchar(50) NOT NULL,
	`itemName` varchar(255) NOT NULL,
	`batchNumber` varchar(100) NOT NULL,
	`quantityAdded` int NOT NULL,
	`previousQuantity` int NOT NULL,
	`resultingQuantity` int NOT NULL,
	`actorId` varchar(100) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	CONSTRAINT `stockMovements_movementId_unique` UNIQUE(`movementId`),
	CONSTRAINT `stockMovements_receiptItem_unique` UNIQUE(`goodsReceiptItemId`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`loginMethod` varchar(64),
	`name` text,
	`email` varchar(320),
	`role` enum('user','admin','consultant','staff') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`userId` varchar(50),
	`username` varchar(100),
	`passwordHash` text,
	`phone` varchar(20),
	`department` varchar(100),
	`isActive` tinyint DEFAULT 1,
	`createdBy` int,
	`stateCounsilSection` varchar(100),
	`registrationNumber` varchar(100),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
--> statement-breakpoint
CREATE TABLE `vendors` (
	`vendorId` varchar(50) NOT NULL,
	`name` varchar(150) NOT NULL,
	`contactNumber` varchar(20),
	`gstNumber` varchar(50),
	`address` text,
	`dlNumber` json,
	`email` varchar(320),
	`isActive` tinyint DEFAULT 1,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `appointments_patientId_idx` ON `appointments` (`patientId`);--> statement-breakpoint
CREATE INDEX `enquiries_patientId_idx` ON `enquiries` (`patientId`);--> statement-breakpoint
CREATE INDEX `enquiries_appointmentId_idx` ON `enquiries` (`appointmentId`);--> statement-breakpoint
CREATE INDEX `externalApiAuditLogs_requestId_idx` ON `externalApiAuditLogs` (`requestId`);--> statement-breakpoint
CREATE INDEX `externalApiAuditLogs_serviceKeyId_idx` ON `externalApiAuditLogs` (`serviceKeyId`);--> statement-breakpoint
CREATE INDEX `externalIdempotency_serviceKeyId_idx` ON `externalIdempotencyKeys` (`serviceKeyId`);--> statement-breakpoint
CREATE INDEX `externalRequestReplays_createdAt_idx` ON `externalRequestReplays` (`createdAt`);--> statement-breakpoint
CREATE INDEX `goodsReceiptItems_purchaseOrderId_idx` ON `goodsReceiptItems` (`purchaseOrderId`);--> statement-breakpoint
CREATE INDEX `goodsReceiptItems_poItemId_idx` ON `goodsReceiptItems` (`poItemId`);--> statement-breakpoint
CREATE INDEX `goodsReceipts_purchaseOrderId_idx` ON `goodsReceipts` (`purchaseOrderId`);--> statement-breakpoint
CREATE INDEX `patients_barcodeData_unique` ON `patients` (`barcodeData`);--> statement-breakpoint
CREATE INDEX `patients_normalizedContactNumber_idx` ON `patients` (`normalizedContactNumber`);--> statement-breakpoint
CREATE INDEX `purchaseOrderHistory_purchaseOrder_createdAt_idx` ON `purchaseOrderHistory` (`purchaseOrderId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `unique_role_feature` ON `rolePermissions` (`role`,`featureKey`);--> statement-breakpoint
CREATE INDEX `idx_role` ON `rolePermissions` (`role`);--> statement-breakpoint
CREATE INDEX `stockMovements_goodsReceiptId_idx` ON `stockMovements` (`goodsReceiptId`);--> statement-breakpoint
CREATE INDEX `stockMovements_purchaseOrderId_idx` ON `stockMovements` (`purchaseOrderId`);--> statement-breakpoint
CREATE INDEX `users_userId_unique` ON `users` (`userId`);--> statement-breakpoint
CREATE INDEX `users_username_unique` ON `users` (`username`);