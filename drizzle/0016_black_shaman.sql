ALTER TABLE `enquiries` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT (now());--> statement-breakpoint
ALTER TABLE `externalApiAuditLogs` MODIFY COLUMN `timestamp` timestamp NOT NULL DEFAULT (now());--> statement-breakpoint
ALTER TABLE `externalIdempotencyKeys` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT (now());