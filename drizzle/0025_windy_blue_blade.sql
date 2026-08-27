ALTER TABLE `appointments` MODIFY COLUMN `status` enum('Scheduled','Checked-in','Completed','Cancelled','No-show','Rescheduled') DEFAULT 'Scheduled';--> statement-breakpoint
ALTER TABLE `appointments` ADD `appointmentSource` enum('MANUAL','WALK_IN','PHONE') DEFAULT 'MANUAL' NOT NULL;--> statement-breakpoint
ALTER TABLE `consultations` ADD `appointmentId` varchar(50);--> statement-breakpoint
ALTER TABLE `consultations` ADD CONSTRAINT `consultations_appointmentId_unique` UNIQUE(`appointmentId`);