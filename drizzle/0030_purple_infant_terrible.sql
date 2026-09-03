CREATE TABLE `dispensingRecords` (
	`dispensingId` varchar(50) NOT NULL,
	`idempotencyKey` varchar(100) NOT NULL,
	`billId` varchar(50) NOT NULL,
	`billItemId` varchar(50) NOT NULL,
	`catalogItemId` varchar(50),
	`inventoryItemId` varchar(50) NOT NULL,
	`batchNumber` varchar(100) NOT NULL,
	`quantityDispensed` int NOT NULL,
	`actorId` varchar(100) NOT NULL,
	`movementType` varchar(50) NOT NULL DEFAULT 'DISPENSE',
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `dispensingRecords_dispensingId` PRIMARY KEY(`dispensingId`),
	CONSTRAINT `dispensingRecords_idempotency_unique` UNIQUE(`idempotencyKey`),
	CONSTRAINT `dispensingRecords_dispensingId_unique` UNIQUE(`dispensingId`)
);
--> statement-breakpoint
ALTER TABLE `billItems` ADD `catalogItemId` varchar(50);--> statement-breakpoint
ALTER TABLE `billItems` ADD `inventoryItemId` varchar(50);--> statement-breakpoint
ALTER TABLE `billItems` ADD `batchNumber` varchar(100);--> statement-breakpoint
ALTER TABLE `billItems` ADD `expiryDate` varchar(10);--> statement-breakpoint
CREATE INDEX `dispensingRecords_billId_idx` ON `dispensingRecords` (`billId`);--> statement-breakpoint
CREATE INDEX `dispensingRecords_inventoryItemId_idx` ON `dispensingRecords` (`inventoryItemId`);