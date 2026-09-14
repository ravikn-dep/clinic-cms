CREATE TABLE `scannedGoodsReceiptItems` (
	`receiptItemId` varchar(50) NOT NULL,
	`receiptId` varchar(50) NOT NULL,
	`lineNumber` int NOT NULL,
	`catalogItemId` varchar(50) NOT NULL,
	`itemName` varchar(255) NOT NULL,
	`extractedDescription` varchar(255) NOT NULL,
	`batchNumber` varchar(100) NOT NULL,
	`expiryDate` varchar(10) NOT NULL,
	`receivedQuantity` int NOT NULL,
	`unitCost` decimal(10,2) NOT NULL,
	`previousQuantity` int NOT NULL,
	`resultingQuantity` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `scannedGoodsReceiptItems_receiptItemId` PRIMARY KEY(`receiptItemId`),
	CONSTRAINT `scannedGoodsReceiptItems_receipt_line_unique` UNIQUE(`receiptId`,`lineNumber`),
	CONSTRAINT `scannedGoodsReceiptItems_receipt_catalog_batch_unique` UNIQUE(`receiptId`,`catalogItemId`,`batchNumber`,`expiryDate`)
);
--> statement-breakpoint
CREATE TABLE `scannedGoodsReceipts` (
	`receiptId` varchar(50) NOT NULL,
	`receiptNumber` varchar(100) NOT NULL,
	`receiptDate` varchar(10) NOT NULL,
	`vendorName` varchar(255) NOT NULL,
	`normalizedVendorName` varchar(255) NOT NULL,
	`vendorGstin` varchar(50),
	`documentType` enum('PURCHASE_ORDER','GST_INVOICE','UNKNOWN') NOT NULL,
	`reviewSubmissionId` varchar(100) NOT NULL,
	`reviewJson` text NOT NULL,
	`warningsJson` text NOT NULL,
	`receivedBy` varchar(100) NOT NULL,
	`receivedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`status` enum('POSTED','VOIDED') NOT NULL DEFAULT 'POSTED',
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `scannedGoodsReceipts_receiptId` PRIMARY KEY(`receiptId`),
	CONSTRAINT `scannedGoodsReceipts_vendor_receipt_date_unique` UNIQUE(`normalizedVendorName`,`receiptNumber`,`receiptDate`),
	CONSTRAINT `scannedGoodsReceipts_submission_unique` UNIQUE(`reviewSubmissionId`)
);
--> statement-breakpoint
CREATE TABLE `scannedReceiptInventoryLocks` (
	`lockKey` varchar(255) NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scannedReceiptInventoryLocks_lockKey` PRIMARY KEY(`lockKey`)
);
--> statement-breakpoint
CREATE TABLE `scannedReceiptStockMovements` (
	`movementId` varchar(50) NOT NULL,
	`receiptId` varchar(50) NOT NULL,
	`receiptItemId` varchar(50) NOT NULL,
	`inventoryItemId` varchar(50) NOT NULL,
	`catalogItemId` varchar(50) NOT NULL,
	`itemName` varchar(255) NOT NULL,
	`batchNumber` varchar(100) NOT NULL,
	`quantityAdded` int NOT NULL,
	`previousQuantity` int NOT NULL,
	`resultingQuantity` int NOT NULL,
	`actorId` varchar(100) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `scannedReceiptStockMovements_movementId` PRIMARY KEY(`movementId`),
	CONSTRAINT `scannedReceiptStockMovements_receiptItem_unique` UNIQUE(`receiptItemId`)
);
--> statement-breakpoint
CREATE INDEX `scannedGoodsReceiptItems_catalog_batch_idx` ON `scannedGoodsReceiptItems` (`catalogItemId`,`batchNumber`,`expiryDate`);--> statement-breakpoint
CREATE INDEX `scannedGoodsReceipts_receivedAt_idx` ON `scannedGoodsReceipts` (`receivedAt`);--> statement-breakpoint
CREATE INDEX `scannedReceiptStockMovements_receipt_idx` ON `scannedReceiptStockMovements` (`receiptId`);
