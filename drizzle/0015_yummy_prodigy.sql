CREATE TABLE IF NOT EXISTS `appointmentBookingLocks` (
	`consultantId` int NOT NULL,
	`appointmentDate` varchar(10) NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `appointmentBookingLocks_consultant_date_unique` UNIQUE(`consultantId`,`appointmentDate`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `enquiries` (
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
CREATE TABLE IF NOT EXISTS `externalApiAuditLogs` (
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
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp,
	CONSTRAINT `externalIdempotency_operation_key_unique` UNIQUE(`operation`,`idempotencyKey`),
	CONSTRAINT `externalIdempotency_idempotencyId_unique` UNIQUE(`idempotencyId`)
);
--> statement-breakpoint
ALTER TABLE `appointments` ADD `checkedInAt` timestamp;--> statement-breakpoint
ALTER TABLE `appointments` ADD `checkedInBy` varchar(100);--> statement-breakpoint
ALTER TABLE `patients` ADD `age` int;--> statement-breakpoint
ALTER TABLE `patients` ADD `normalizedContactNumber` varchar(15);--> statement-breakpoint
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_appointmentId_unique` UNIQUE(`appointmentId`);--> statement-breakpoint
ALTER TABLE `patients` ADD CONSTRAINT `patients_patientId_unique` UNIQUE(`patientId`);--> statement-breakpoint
CREATE INDEX `enquiries_patientId_idx` ON `enquiries` (`patientId`);--> statement-breakpoint
CREATE INDEX `enquiries_appointmentId_idx` ON `enquiries` (`appointmentId`);--> statement-breakpoint
CREATE INDEX `externalApiAuditLogs_requestId_idx` ON `externalApiAuditLogs` (`requestId`);--> statement-breakpoint
CREATE INDEX `externalApiAuditLogs_serviceKeyId_idx` ON `externalApiAuditLogs` (`serviceKeyId`);--> statement-breakpoint
CREATE INDEX `externalIdempotency_serviceKeyId_idx` ON `externalIdempotencyKeys` (`serviceKeyId`);--> statement-breakpoint
CREATE INDEX `appointments_patientId_idx` ON `appointments` (`patientId`);--> statement-breakpoint
CREATE INDEX `patients_normalizedContactNumber_idx` ON `patients` (`normalizedContactNumber`);
