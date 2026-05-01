CREATE TABLE `purchaseOrderItems` (
	`poItemId` varchar(50) NOT NULL,
	`purchaseOrderId` varchar(50) NOT NULL,
	`itemName` varchar(255) NOT NULL,
	`quantity` int DEFAULT 1,
	`unitPrice` decimal(10,2) NOT NULL,
	`subtotal` decimal(10,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `purchaseOrderItems_poItemId` PRIMARY KEY(`poItemId`)
);
--> statement-breakpoint
CREATE TABLE `purchaseOrders` (
	`purchaseOrderId` varchar(50) NOT NULL,
	`vendorName` varchar(255) NOT NULL,
	`vendorContactNumber` varchar(20) NOT NULL,
	`vendorEmail` varchar(255),
	`vendorGSTNumber` varchar(50),
	`vendorBankDetails` text,
	`vendorAddress` text,
	`totalAmount` decimal(10,2) NOT NULL,
	`paymentStatus` enum('Pending','Paid','Partial') DEFAULT 'Pending',
	`orderDate` timestamp NOT NULL DEFAULT (now()),
	`expectedDeliveryDate` varchar(10),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `purchaseOrders_purchaseOrderId` PRIMARY KEY(`purchaseOrderId`)
);
--> statement-breakpoint
ALTER TABLE `bills` ADD `receiptPdfUrl` text;--> statement-breakpoint
ALTER TABLE `bills` ADD `receiptPdfKey` text;--> statement-breakpoint
ALTER TABLE `bills` ADD `consultationNotes` text;