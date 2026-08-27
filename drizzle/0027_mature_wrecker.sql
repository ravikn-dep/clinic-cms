CREATE TABLE `encounters` (
	`encounterId` varchar(50) NOT NULL,
	`patientId` varchar(50) NOT NULL,
	`consultantId` int NOT NULL,
	`appointmentId` varchar(50),
	`source` enum('WALK_IN','APPOINTMENT','PHONE','MANUAL') NOT NULL DEFAULT 'WALK_IN',
	`status` enum('Present','Checked-in','OP Generated','Ready for Billing','Closed') NOT NULL DEFAULT 'Present',
	`createdBy` varchar(100) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`closedAt` timestamp,
	CONSTRAINT `encounters_encounterId_unique` UNIQUE(`encounterId`),
	CONSTRAINT `encounters_appointmentId_unique` UNIQUE(`appointmentId`)
);
--> statement-breakpoint
CREATE TABLE `patientIdSequences` (
	`sequenceDate` varchar(10) NOT NULL,
	`nextSequence` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `patientIdSequences_sequenceDate_unique` UNIQUE(`sequenceDate`)
);
--> statement-breakpoint
ALTER TABLE `bills` ADD `encounterId` varchar(50);--> statement-breakpoint
ALTER TABLE `consultations` ADD `encounterId` varchar(50);--> statement-breakpoint
ALTER TABLE `bills` ADD CONSTRAINT `bills_encounterId_unique` UNIQUE(`encounterId`);--> statement-breakpoint
ALTER TABLE `consultations` ADD CONSTRAINT `consultations_encounterId_unique` UNIQUE(`encounterId`);--> statement-breakpoint
CREATE INDEX `encounters_patientId_idx` ON `encounters` (`patientId`);--> statement-breakpoint
CREATE INDEX `encounters_consultantId_idx` ON `encounters` (`consultantId`);