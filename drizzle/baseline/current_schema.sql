CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
CREATE TABLE `auditLogs` (
	`logId` varchar(50) NOT NULL,
	`userId` varchar(100),
	`actionType` varchar(50) NOT NULL,
	`tableName` varchar(50),
	`recordId` varchar(100),
	`oldValue` json,
	`newValue` json,
	`ipAddress` varchar(45),
	`timestamp` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `auditLogs_logId` PRIMARY KEY(`logId`)
);
CREATE TABLE `billItems` (
	`billItemId` varchar(50) NOT NULL,
	`billId` varchar(50) NOT NULL,
	`itemType` varchar(50) NOT NULL,
	`description` varchar(255),
	`quantity` int DEFAULT 1,
	`unitPrice` decimal(10,2),
	`subtotal` decimal(10,2),
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `billItems_billItemId` PRIMARY KEY(`billItemId`)
);
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
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bills_billId` PRIMARY KEY(`billId`)
);
CREATE TABLE `consultations` (
	`consultationId` varchar(50) NOT NULL,
	`patientId` varchar(50) NOT NULL,
	`consultationDate` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`audioFileUrl` text,
	`audioFileKey` text,
	`rawTranscript` text,
	`clinicalHistory` text,
	`presentComplaints` text,
	`advisedInvestigations` text,
	`treatmentPlan` text,
	`digitalSignature` text,
	`isFinalized` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `consultations_consultationId` PRIMARY KEY(`consultationId`)
);
CREATE TABLE `inventory` (
	`itemId` varchar(50) NOT NULL,
	`itemName` varchar(255) NOT NULL,
	`batchNumber` varchar(100) NOT NULL,
	`expiryDate` varchar(10) NOT NULL,
	`quantityAvailable` int DEFAULT 0,
	`reorderLevel` int DEFAULT 10,
	`unitPrice` decimal(10,2) NOT NULL,
	`lastRestocked` timestamp DEFAULT CURRENT_TIMESTAMP,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inventory_itemId` PRIMARY KEY(`itemId`)
);
CREATE TABLE `notifications` (
	`notificationId` varchar(50) NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`content` text,
	`notificationType` varchar(50) NOT NULL,
	`isRead` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `notifications_notificationId` PRIMARY KEY(`notificationId`)
);
CREATE TABLE `patients` (
	`patientId` varchar(50) NOT NULL,
	`firstName` varchar(100) NOT NULL,
	`lastName` varchar(100) NOT NULL,
	`dateOfBirth` varchar(10) NOT NULL,
	`gender` varchar(20),
	`contactNumber` varchar(20) NOT NULL,
	`email` varchar(255),
	`address` text,
	`barcodeData` varchar(255),
	`barcodeImageUrl` text,
	`qrcodeImageUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `patients_patientId` PRIMARY KEY(`patientId`),
	CONSTRAINT `patients_barcodeData_unique` UNIQUE(`barcodeData`)
);
ALTER TABLE `patients` ADD `barcodeImageKey` text;
ALTER TABLE `patients` ADD `qrcodeImageKey` text;
CREATE TABLE `purchaseOrderItems` (
	`poItemId` varchar(50) NOT NULL,
	`purchaseOrderId` varchar(50) NOT NULL,
	`itemName` varchar(255) NOT NULL,
	`quantity` int DEFAULT 1,
	`unitPrice` decimal(10,2) NOT NULL,
	`subtotal` decimal(10,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `purchaseOrderItems_poItemId` PRIMARY KEY(`poItemId`)
);
CREATE TABLE `purchaseOrders` (
	`purchaseOrderId` varchar(50) NOT NULL,
	`vendorName` varchar(255) NOT NULL,
	`vendorContactNumber` varchar(20) NOT NULL,
	`vendorEmail` varchar(255),
	`vendorGSTNumber` varchar(50),
	`vendorBankDetails` text,
	`vendorAddress` text,
	`totalAmount` decimal(10,2) NOT NULL,
	`paymentStatus` enum('Pending','Paid','Partial') DEFAULT 'Pending',
	`orderDate` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`expectedDeliveryDate` varchar(10),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `purchaseOrders_purchaseOrderId` PRIMARY KEY(`purchaseOrderId`)
);
ALTER TABLE `bills` ADD `receiptPdfUrl` text;
ALTER TABLE `bills` ADD `receiptPdfKey` text;
ALTER TABLE `bills` ADD `consultationNotes` text;
ALTER TABLE `bills` ADD `receiptDeliveryStatus` enum('Not Sent','Sent','Failed','Pending') DEFAULT 'Not Sent';
ALTER TABLE `bills` ADD `receiptDeliveryMethod` varchar(50);
ALTER TABLE `bills` ADD `receiptDeliveryTimestamp` timestamp;
ALTER TABLE `purchaseOrders` ADD `approvalStatus` enum('Pending Approval','Approved','Rejected') DEFAULT 'Pending Approval';
ALTER TABLE `purchaseOrders` ADD `rejectionReason` text;
ALTER TABLE `purchaseOrders` ADD `approvedBy` varchar(100);
ALTER TABLE `purchaseOrders` ADD `approvalTimestamp` timestamp;
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','consultant','staff') NOT NULL DEFAULT 'user';
ALTER TABLE `users` ADD `userId` varchar(50);
ALTER TABLE `users` ADD `username` varchar(100);
ALTER TABLE `users` ADD `passwordHash` text;
ALTER TABLE `users` ADD `phone` varchar(20);
ALTER TABLE `users` ADD `department` varchar(100);
ALTER TABLE `users` ADD `isActive` boolean DEFAULT true;
ALTER TABLE `users` ADD `qrcodeLoginUrl` text;
ALTER TABLE `users` ADD `qrcodeLoginKey` text;
ALTER TABLE `users` ADD `createdBy` int;
ALTER TABLE `users` ADD CONSTRAINT `users_userId_unique` UNIQUE(`userId`);
ALTER TABLE `users` ADD CONSTRAINT `users_username_unique` UNIQUE(`username`);
CREATE TABLE `appointments` (
	`appointmentId` varchar(50) NOT NULL,
	`patientId` varchar(50) NOT NULL,
	`consultantId` int NOT NULL,
	`appointmentDate` varchar(10) NOT NULL,
	`appointmentTime` varchar(5) NOT NULL,
	`duration` int DEFAULT 30,
	`status` enum('Scheduled','Completed','Cancelled','No-show','Rescheduled') DEFAULT 'Scheduled',
	`notes` text,
	`reminderSent` boolean DEFAULT false,
	`reminderSentAt` timestamp,
	`notificationMethod` varchar(50),
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `appointments_appointmentId` PRIMARY KEY(`appointmentId`)
);
CREATE TABLE `consultantAvailability` (
	`availabilityId` varchar(50) NOT NULL,
	`consultantId` int NOT NULL,
	`dayOfWeek` int NOT NULL,
	`startTime` varchar(5) NOT NULL,
	`endTime` varchar(5) NOT NULL,
	`slotDuration` int DEFAULT 30,
	`maxAppointmentsPerDay` int DEFAULT 10,
	`isActive` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `consultantAvailability_availabilityId` PRIMARY KEY(`availabilityId`)
);
CREATE TABLE `notificationPreferences` (
	`preferenceId` varchar(50) NOT NULL,
	`patientId` varchar(50) NOT NULL,
	`appointmentReminders` boolean DEFAULT true,
	`reminderMethod` enum('SMS','Email','Both') DEFAULT 'SMS',
	`billingNotifications` boolean DEFAULT true,
	`followUpNotifications` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notificationPreferences_preferenceId` PRIMARY KEY(`preferenceId`)
);
CREATE TABLE `rolePermissions` (
	`permissionId` varchar(50) NOT NULL,
	`role` enum('admin','consultant','staff') NOT NULL,
	`featureKey` varchar(100) NOT NULL,
	`isEnabled` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rolePermissions_permissionId` PRIMARY KEY(`permissionId`)
);
ALTER TABLE `patients` MODIFY COLUMN `dateOfBirth` varchar(10);
ALTER TABLE `consultations` ADD `consultantId` int;
CREATE TABLE `billTemplates` (
	`templateId` varchar(50) NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`itemsJson` json NOT NULL,
	`isActive` boolean DEFAULT true,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `billTemplates_templateId` PRIMARY KEY(`templateId`)
);
CREATE TABLE `vendors` (
	`vendorId` varchar(50) NOT NULL,
	`name` varchar(150) NOT NULL,
	`contactNumber` varchar(20),
	`gstNumber` varchar(50),
	`address` text,
	`dlNumber` json,
	`email` varchar(320),
	`isActive` boolean DEFAULT true,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vendors_vendorId` PRIMARY KEY(`vendorId`)
);
ALTER TABLE `users` ADD `stateCounsilSection` varchar(100);
ALTER TABLE `users` ADD `registrationNumber` varchar(100);
ALTER TABLE `purchaseOrders` ADD `authorizationNotes` text;
ALTER TABLE `patients` DROP INDEX `patients_barcodeData_unique`;
ALTER TABLE `users` DROP INDEX `users_userId_unique`;
ALTER TABLE `users` DROP INDEX `users_username_unique`;
ALTER TABLE `appointments` DROP PRIMARY KEY;
ALTER TABLE `auditLogs` DROP PRIMARY KEY;
ALTER TABLE `billItems` DROP PRIMARY KEY;
ALTER TABLE `billTemplates` DROP PRIMARY KEY;
ALTER TABLE `bills` DROP PRIMARY KEY;
ALTER TABLE `consultantAvailability` DROP PRIMARY KEY;
ALTER TABLE `consultations` DROP PRIMARY KEY;
ALTER TABLE `inventory` DROP PRIMARY KEY;
ALTER TABLE `notificationPreferences` DROP PRIMARY KEY;
ALTER TABLE `notifications` DROP PRIMARY KEY;
ALTER TABLE `patients` DROP PRIMARY KEY;
ALTER TABLE `purchaseOrderItems` DROP PRIMARY KEY;
ALTER TABLE `purchaseOrders` DROP PRIMARY KEY;
ALTER TABLE `rolePermissions` DROP PRIMARY KEY;
ALTER TABLE `vendors` DROP PRIMARY KEY;
ALTER TABLE `appointments` MODIFY COLUMN `reminderSent` tinyint;
ALTER TABLE `appointments` MODIFY COLUMN `reminderSent` tinyint DEFAULT 0;
ALTER TABLE `appointments` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE `auditLogs` MODIFY COLUMN `timestamp` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE `billItems` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE `billTemplates` MODIFY COLUMN `isActive` tinyint DEFAULT 1;
ALTER TABLE `billTemplates` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE `bills` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE `consultantAvailability` MODIFY COLUMN `isActive` tinyint DEFAULT 1;
ALTER TABLE `consultantAvailability` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE `consultations` MODIFY COLUMN `consultationDate` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE `consultations` MODIFY COLUMN `isFinalized` tinyint;
ALTER TABLE `consultations` MODIFY COLUMN `isFinalized` tinyint DEFAULT 0;
ALTER TABLE `consultations` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE `inventory` MODIFY COLUMN `lastRestocked` timestamp DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE `inventory` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE `notificationPreferences` MODIFY COLUMN `appointmentReminders` tinyint DEFAULT 1;
ALTER TABLE `notificationPreferences` MODIFY COLUMN `billingNotifications` tinyint DEFAULT 1;
ALTER TABLE `notificationPreferences` MODIFY COLUMN `followUpNotifications` tinyint DEFAULT 1;
ALTER TABLE `notificationPreferences` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE `notifications` MODIFY COLUMN `isRead` tinyint;
ALTER TABLE `notifications` MODIFY COLUMN `isRead` tinyint DEFAULT 0;
ALTER TABLE `notifications` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE `patients` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE `purchaseOrderItems` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE `purchaseOrders` MODIFY COLUMN `orderDate` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE `purchaseOrders` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE `rolePermissions` MODIFY COLUMN `role` varchar(20) NOT NULL;
ALTER TABLE `rolePermissions` MODIFY COLUMN `isEnabled` tinyint DEFAULT 1;
ALTER TABLE `rolePermissions` MODIFY COLUMN `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE `rolePermissions` MODIFY COLUMN `updatedAt` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE `users` MODIFY COLUMN `isActive` tinyint DEFAULT 1;
ALTER TABLE `users` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE `users` MODIFY COLUMN `lastSignedIn` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE `vendors` MODIFY COLUMN `isActive` tinyint DEFAULT 1;
ALTER TABLE `vendors` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX `patients_barcodeData_unique` ON `patients` (`barcodeData`);
CREATE INDEX `unique_role_feature` ON `rolePermissions` (`role`,`featureKey`);
CREATE INDEX `idx_role` ON `rolePermissions` (`role`);
CREATE INDEX `users_userId_unique` ON `users` (`userId`);
CREATE INDEX `users_username_unique` ON `users` (`username`);
ALTER TABLE `purchaseOrders` DROP COLUMN `vendorGSTNumber`;
ALTER TABLE `users` DROP COLUMN `qrcodeLoginUrl`;
ALTER TABLE `users` DROP COLUMN `qrcodeLoginKey`;
CREATE TABLE IF NOT EXISTS `appointmentBookingLocks` (
	`consultantId` int NOT NULL,
	`appointmentDate` varchar(10) NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `appointmentBookingLocks_consultant_date_unique` UNIQUE(`consultantId`,`appointmentDate`)
);
CREATE TABLE IF NOT EXISTS `enquiries` (
	`enquiryId` varchar(64) NOT NULL,
	`patientId` varchar(50),
	`appointmentId` varchar(50),
	`channel` enum('VOICE','WHATSAPP','PHONE','WALK_IN','WEBSITE','GOOGLE','INSTAGRAM','REFERRAL','OTHER') NOT NULL,
	`sourceDetail` varchar(255),
	`lifecycleStage` enum('NEW','DETAILS_COLLECTED','APPOINTMENT_OFFERED','BOOKED','CONFIRMED','CHECKED_IN','OP_COMPLETED','NO_SHOW','CANCELLED','LOST') NOT NULL DEFAULT 'NEW',
	`preferredLanguage` enum('en-IN','hi-IN','te-IN','mixed') NOT NULL DEFAULT 'mixed',
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `enquiries_enquiryId_unique` UNIQUE(`enquiryId`)
);
CREATE TABLE IF NOT EXISTS `externalApiAuditLogs` (
	`auditId` varchar(64) NOT NULL,
	`requestId` varchar(64) NOT NULL,
	`serviceKeyId` varchar(100),
	`action` varchar(100) NOT NULL,
	`resourceType` varchar(50) NOT NULL,
	`resourceId` varchar(100),
	`result` enum('SUCCESS','DENIED','ERROR','IDEMPOTENT_REPLAY') NOT NULL,
	`safeMetadata` json,
	`timestamp` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `externalApiAuditLogs_auditId_unique` UNIQUE(`auditId`)
);
CREATE TABLE IF NOT EXISTS `externalIdempotencyKeys` (
	`idempotencyId` varchar(64) NOT NULL,
	`operation` varchar(100) NOT NULL,
	`idempotencyKey` varchar(128) NOT NULL,
	`requestHash` varchar(64) NOT NULL,
	`serviceKeyId` varchar(100) NOT NULL,
	`resourceType` varchar(50),
	`resourceId` varchar(100),
	`responseStatus` int NOT NULL,
	`responseBody` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`expiresAt` timestamp,
	CONSTRAINT `externalIdempotency_operation_key_unique` UNIQUE(`operation`,`idempotencyKey`),
	CONSTRAINT `externalIdempotency_idempotencyId_unique` UNIQUE(`idempotencyId`)
);
ALTER TABLE `appointments` ADD `checkedInAt` timestamp;
ALTER TABLE `appointments` ADD `checkedInBy` varchar(100);
ALTER TABLE `patients` ADD `age` int;
ALTER TABLE `patients` ADD `normalizedContactNumber` varchar(15);
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_appointmentId_unique` UNIQUE(`appointmentId`);
ALTER TABLE `patients` ADD CONSTRAINT `patients_patientId_unique` UNIQUE(`patientId`);
CREATE INDEX `enquiries_patientId_idx` ON `enquiries` (`patientId`);
CREATE INDEX `enquiries_appointmentId_idx` ON `enquiries` (`appointmentId`);
CREATE INDEX `externalApiAuditLogs_requestId_idx` ON `externalApiAuditLogs` (`requestId`);
CREATE INDEX `externalApiAuditLogs_serviceKeyId_idx` ON `externalApiAuditLogs` (`serviceKeyId`);
CREATE INDEX `externalIdempotency_serviceKeyId_idx` ON `externalIdempotencyKeys` (`serviceKeyId`);
CREATE INDEX `appointments_patientId_idx` ON `appointments` (`patientId`);
CREATE INDEX `patients_normalizedContactNumber_idx` ON `patients` (`normalizedContactNumber`);
ALTER TABLE `enquiries` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE `externalApiAuditLogs` MODIFY COLUMN `timestamp` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE `externalIdempotencyKeys` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE TABLE `purchaseOrderHistory` (
	`historyId` varchar(50) NOT NULL,
	`purchaseOrderId` varchar(50) NOT NULL,
	`eventType` varchar(50) NOT NULL,
	`actorId` varchar(100) NOT NULL,
	`actorName` varchar(255),
	`eventSummary` varchar(500) NOT NULL,
	`details` text,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `purchaseOrderHistory_historyId_unique` UNIQUE(`historyId`)
);
CREATE INDEX `purchaseOrderHistory_purchaseOrder_createdAt_idx` ON `purchaseOrderHistory` (`purchaseOrderId`,`createdAt`);
ALTER TABLE `purchaseOrderHistory` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE TABLE `externalRequestReplays` (
	`replayId` varchar(64) NOT NULL,
	`serviceKeyId` varchar(100) NOT NULL,
	`requestId` varchar(64) NOT NULL,
	`endpoint` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `externalRequestReplays_key_request_unique` UNIQUE(`serviceKeyId`,`requestId`)
);
CREATE INDEX `externalRequestReplays_createdAt_idx` ON `externalRequestReplays` (`createdAt`);
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
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `goodsReceiptItems_goodsReceiptItemId_unique` UNIQUE(`goodsReceiptItemId`),
	CONSTRAINT `goodsReceiptItems_receipt_poItem_batch_unique` UNIQUE(`goodsReceiptId`,`poItemId`,`batchNumber`)
);
CREATE TABLE `goodsReceipts` (
	`goodsReceiptId` varchar(50) NOT NULL,
	`purchaseOrderId` varchar(50) NOT NULL,
	`receivedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`receivedBy` varchar(100) NOT NULL,
	`status` enum('Posted','Voided') NOT NULL DEFAULT 'Posted',
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `goodsReceipts_goodsReceiptId_unique` UNIQUE(`goodsReceiptId`)
);
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
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `stockMovements_movementId_unique` UNIQUE(`movementId`),
	CONSTRAINT `stockMovements_receiptItem_unique` UNIQUE(`goodsReceiptItemId`)
);
ALTER TABLE `inventory` ADD `sourcePurchaseOrderId` varchar(50);
ALTER TABLE `inventory` ADD `sourceGoodsReceiptId` varchar(50);
ALTER TABLE `purchaseOrderItems` ADD `receivedQuantity` int DEFAULT 0 NOT NULL;
ALTER TABLE `inventory` ADD CONSTRAINT `inventory_item_batch_expiry_unique` UNIQUE(`itemName`,`batchNumber`,`expiryDate`);
CREATE INDEX `goodsReceiptItems_purchaseOrderId_idx` ON `goodsReceiptItems` (`purchaseOrderId`);
CREATE INDEX `goodsReceiptItems_poItemId_idx` ON `goodsReceiptItems` (`poItemId`);
CREATE INDEX `goodsReceipts_purchaseOrderId_idx` ON `goodsReceipts` (`purchaseOrderId`);
CREATE INDEX `stockMovements_goodsReceiptId_idx` ON `stockMovements` (`goodsReceiptId`);
CREATE INDEX `stockMovements_purchaseOrderId_idx` ON `stockMovements` (`purchaseOrderId`);
