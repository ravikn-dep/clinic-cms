ALTER TABLE `patients` DROP INDEX `patients_barcodeData_unique`;--> statement-breakpoint
ALTER TABLE `users` DROP INDEX `users_userId_unique`;--> statement-breakpoint
ALTER TABLE `users` DROP INDEX `users_username_unique`;--> statement-breakpoint
ALTER TABLE `appointments` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `auditLogs` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `billItems` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `billTemplates` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `bills` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `consultantAvailability` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `consultations` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `inventory` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `notificationPreferences` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `notifications` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `patients` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `purchaseOrderItems` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `purchaseOrders` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `rolePermissions` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `users` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `vendors` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `appointments` MODIFY COLUMN `reminderSent` tinyint;--> statement-breakpoint
ALTER TABLE `appointments` MODIFY COLUMN `reminderSent` tinyint DEFAULT 0;--> statement-breakpoint
ALTER TABLE `appointments` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `auditLogs` MODIFY COLUMN `timestamp` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `billItems` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `billTemplates` MODIFY COLUMN `isActive` tinyint DEFAULT 1;--> statement-breakpoint
ALTER TABLE `billTemplates` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `bills` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `consultantAvailability` MODIFY COLUMN `isActive` tinyint DEFAULT 1;--> statement-breakpoint
ALTER TABLE `consultantAvailability` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `consultations` MODIFY COLUMN `consultationDate` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `consultations` MODIFY COLUMN `isFinalized` tinyint;--> statement-breakpoint
ALTER TABLE `consultations` MODIFY COLUMN `isFinalized` tinyint DEFAULT 0;--> statement-breakpoint
ALTER TABLE `consultations` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `inventory` MODIFY COLUMN `lastRestocked` timestamp DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `inventory` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `notificationPreferences` MODIFY COLUMN `appointmentReminders` tinyint DEFAULT 1;--> statement-breakpoint
ALTER TABLE `notificationPreferences` MODIFY COLUMN `billingNotifications` tinyint DEFAULT 1;--> statement-breakpoint
ALTER TABLE `notificationPreferences` MODIFY COLUMN `followUpNotifications` tinyint DEFAULT 1;--> statement-breakpoint
ALTER TABLE `notificationPreferences` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `notifications` MODIFY COLUMN `isRead` tinyint;--> statement-breakpoint
ALTER TABLE `notifications` MODIFY COLUMN `isRead` tinyint DEFAULT 0;--> statement-breakpoint
ALTER TABLE `notifications` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `patients` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `purchaseOrderItems` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `purchaseOrders` MODIFY COLUMN `orderDate` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `purchaseOrders` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `rolePermissions` MODIFY COLUMN `role` varchar(20) NOT NULL;--> statement-breakpoint
ALTER TABLE `rolePermissions` MODIFY COLUMN `isEnabled` tinyint DEFAULT 1;--> statement-breakpoint
ALTER TABLE `rolePermissions` MODIFY COLUMN `createdAt` timestamp DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `rolePermissions` MODIFY COLUMN `updatedAt` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `isActive` tinyint DEFAULT 1;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `lastSignedIn` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `vendors` MODIFY COLUMN `isActive` tinyint DEFAULT 1;--> statement-breakpoint
ALTER TABLE `vendors` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `purchaseOrders` ADD `vendorGstNumber` varchar(50);--> statement-breakpoint
CREATE INDEX `patients_barcodeData_unique` ON `patients` (`barcodeData`);--> statement-breakpoint
CREATE INDEX `unique_role_feature` ON `rolePermissions` (`role`,`featureKey`);--> statement-breakpoint
CREATE INDEX `idx_role` ON `rolePermissions` (`role`);--> statement-breakpoint
CREATE INDEX `users_userId_unique` ON `users` (`userId`);--> statement-breakpoint
CREATE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
ALTER TABLE `purchaseOrders` DROP COLUMN `vendorGSTNumber`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `qrcodeLoginUrl`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `qrcodeLoginKey`;