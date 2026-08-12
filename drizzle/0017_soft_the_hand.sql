CREATE TABLE `purchaseOrderHistory` (
	`historyId` varchar(50) NOT NULL,
	`purchaseOrderId` varchar(50) NOT NULL,
	`eventType` varchar(50) NOT NULL,
	`actorId` varchar(100) NOT NULL,
	`actorName` varchar(255),
	`eventSummary` varchar(500) NOT NULL,
	`details` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `purchaseOrderHistory_historyId_unique` UNIQUE(`historyId`)
);
--> statement-breakpoint
CREATE INDEX `purchaseOrderHistory_purchaseOrder_createdAt_idx` ON `purchaseOrderHistory` (`purchaseOrderId`,`createdAt`);
