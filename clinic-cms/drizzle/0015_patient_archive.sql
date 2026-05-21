ALTER TABLE `patients` ADD COLUMN `isArchived` boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE `patients` ADD COLUMN `archivedAt` timestamp NULL;
