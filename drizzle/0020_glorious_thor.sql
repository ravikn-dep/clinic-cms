CREATE TABLE `goodsReceiptItems` (
	`goodsReceiptItemId` varchar(50) NOT NULL,
	`goodsReceiptId` varchar(50) NOT NULL,
	`purchaseOrderId` varchar(50) NOT NULL,
	`poItemId` varchar(50) NOT NULL,
	`itemName` varchar(255) NOT NULL,
	`receivedQuantity` int NOT NULL,
	`batchNumber` varchar(100) NOT NULL,
	`expiryDate` varchar(10) NOT NULL,
	`unitCost` decimal(10,2),
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	CONSTRAINT `goodsReceiptItems_goodsReceiptItemId_unique` UNIQUE(`goodsReceiptItemId`),
	CONSTRAINT `goodsReceiptItems_receipt_poItem_batch_unique` UNIQUE(`goodsReceiptId`,`poItemId`,`batchNumber`)
);
--> statement-breakpoint
CREATE TABLE `goodsReceipts` (
	`goodsReceiptId` varchar(50) NOT NULL,
	`purchaseOrderId` varchar(50) NOT NULL,
	`receivedAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`receivedBy` varchar(100) NOT NULL,
	`status` enum('Posted','Voided') NOT NULL DEFAULT 'Posted',
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	CONSTRAINT `goodsReceipts_goodsReceiptId_unique` UNIQUE(`goodsReceiptId`)
);
--> statement-breakpoint
CREATE TABLE `stockMovements` (
	`movementId` varchar(50) NOT NULL,
	`goodsReceiptId` varchar(50) NOT NULL,
	`goodsReceiptItemId` varchar(50) NOT NULL,
	`purchaseOrderId` varchar(50) NOT NULL,
	`inventoryItemId` varchar(50) NOT NULL,
	`itemName` varchar(255) NOT NULL,
	`batchNumber` varchar(100) NOT NULL,
	`quantityAdded` int NOT NULL,
	`previousQuantity` int NOT NULL,
	`resultingQuantity` int NOT NULL,
	`actorId` varchar(100) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	CONSTRAINT `stockMovements_movementId_unique` UNIQUE(`movementId`),
	CONSTRAINT `stockMovements_receiptItem_unique` UNIQUE(`goodsReceiptItemId`)
);
--> statement-breakpoint
ALTER TABLE `inventory` ADD `sourcePurchaseOrderId` varchar(50);--> statement-breakpoint
ALTER TABLE `inventory` ADD `sourceGoodsReceiptId` varchar(50);--> statement-breakpoint
ALTER TABLE `purchaseOrderItems` ADD `receivedQuantity` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `inventory` ADD CONSTRAINT `inventory_item_batch_expiry_unique` UNIQUE(`itemName`,`batchNumber`,`expiryDate`);--> statement-breakpoint
CREATE INDEX `goodsReceiptItems_purchaseOrderId_idx` ON `goodsReceiptItems` (`purchaseOrderId`);--> statement-breakpoint
CREATE INDEX `goodsReceiptItems_poItemId_idx` ON `goodsReceiptItems` (`poItemId`);--> statement-breakpoint
CREATE INDEX `goodsReceipts_purchaseOrderId_idx` ON `goodsReceipts` (`purchaseOrderId`);--> statement-breakpoint
CREATE INDEX `stockMovements_goodsReceiptId_idx` ON `stockMovements` (`goodsReceiptId`);--> statement-breakpoint
CREATE INDEX `stockMovements_purchaseOrderId_idx` ON `stockMovements` (`purchaseOrderId`);