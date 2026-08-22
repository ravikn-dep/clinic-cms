CREATE TABLE `catalogItemAliases` (
	`aliasId` varchar(50) NOT NULL,
	`catalogItemId` varchar(50) NOT NULL,
	`vendorId` varchar(50) NOT NULL DEFAULT '',
	`aliasText` varchar(255) NOT NULL,
	`normalizedAlias` varchar(255) NOT NULL,
	`source` varchar(50) NOT NULL,
	`active` tinyint NOT NULL DEFAULT 1,
	`createdBy` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	CONSTRAINT `catalogItemAliases_aliasId` PRIMARY KEY(`aliasId`),
	CONSTRAINT `catalogItemAliases_aliasId_unique` UNIQUE(`aliasId`),
	CONSTRAINT `catalogItemAliases_vendor_alias_unique` UNIQUE(`vendorId`,`normalizedAlias`)
);
--> statement-breakpoint
CREATE TABLE `catalogItems` (
	`catalogItemId` varchar(50) NOT NULL,
	`canonicalName` varchar(255) NOT NULL,
	`normalizedName` varchar(255) NOT NULL,
	`genericName` varchar(255),
	`brandName` varchar(255),
	`strength` varchar(100),
	`dosageForm` varchar(100),
	`manufacturer` varchar(255),
	`hsnCode` varchar(32),
	`gstRate` decimal(5,2),
	`active` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `catalogItems_catalogItemId` PRIMARY KEY(`catalogItemId`),
	CONSTRAINT `catalogItems_catalogItemId_unique` UNIQUE(`catalogItemId`),
	CONSTRAINT `catalogItems_normalizedName_unique` UNIQUE(`normalizedName`)
);
--> statement-breakpoint
ALTER TABLE `purchaseOrderExtractionReviews` ADD `catalogResolutionsJson` text;--> statement-breakpoint
ALTER TABLE `purchaseOrderItems` ADD `catalogItemId` varchar(50);--> statement-breakpoint
CREATE INDEX `catalogItemAliases_catalogItem_active_idx` ON `catalogItemAliases` (`catalogItemId`,`active`);--> statement-breakpoint
CREATE INDEX `catalogItems_active_normalizedName_idx` ON `catalogItems` (`active`,`normalizedName`);