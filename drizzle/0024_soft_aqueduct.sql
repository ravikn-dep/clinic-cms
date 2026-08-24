CREATE TABLE `procurementPostingLocks` (
	`purchaseOrderId` varchar(50) NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `procurementPostingLocks_purchaseOrderId` PRIMARY KEY(`purchaseOrderId`)
);
--> statement-breakpoint
ALTER TABLE `inventory` ADD `catalogItemId` varchar(50);--> statement-breakpoint
ALTER TABLE `purchaseOrders` ADD `vendorId` varchar(50);--> statement-breakpoint
ALTER TABLE `stockMovements` ADD `catalogItemId` varchar(50);--> statement-breakpoint
ALTER TABLE `vendors` ADD `normalizedVendorName` varchar(255);--> statement-breakpoint
ALTER TABLE `vendors` ADD `normalizedGstNumber` varchar(50);--> statement-breakpoint
ALTER TABLE `vendors` ADD `bankDetails` text;--> statement-breakpoint
ALTER TABLE `inventory` ADD CONSTRAINT `inventory_catalog_batch_expiry_unique` UNIQUE(`catalogItemId`,`batchNumber`,`expiryDate`);--> statement-breakpoint
CREATE INDEX `purchaseOrders_vendorId_idx` ON `purchaseOrders` (`vendorId`);--> statement-breakpoint
CREATE INDEX `vendors_active_normalizedVendorName_idx` ON `vendors` (`isActive`,`normalizedVendorName`);--> statement-breakpoint
CREATE INDEX `vendors_normalizedGstNumber_idx` ON `vendors` (`normalizedGstNumber`);