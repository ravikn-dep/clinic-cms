CREATE TABLE `auditLogs` (
	`logId` varchar(50) NOT NULL,
	`userId` varchar(100),
	`actionType` varchar(50) NOT NULL,
	`tableName` varchar(50),
	`recordId` varchar(100),
	`oldValue` json,
	`newValue` json,
	`ipAddress` varchar(45),
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auditLogs_logId` PRIMARY KEY(`logId`)
);
--> statement-breakpoint
CREATE TABLE `billItems` (
	`billItemId` varchar(50) NOT NULL,
	`billId` varchar(50) NOT NULL,
	`itemType` varchar(50) NOT NULL,
	`description` varchar(255),
	`quantity` int DEFAULT 1,
	`unitPrice` decimal(10,2),
	`subtotal` decimal(10,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `billItems_billItemId` PRIMARY KEY(`billItemId`)
);
--> statement-breakpoint
CREATE TABLE `bills` (
	`billId` varchar(50) NOT NULL,
	`patientId` varchar(50) NOT NULL,
	`consultationId` varchar(50),
	`totalAmount` decimal(10,2) NOT NULL,
	`discountAmount` decimal(10,2) DEFAULT '0.00',
	`taxAmount` decimal(10,2) DEFAULT '0.00',
	`finalAmount` decimal(10,2) NOT NULL,
	`paymentStatus` enum('Pending','Paid','Partial') DEFAULT 'Pending',
	`invoicePdfUrl` text,
	`invoicePdfKey` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bills_billId` PRIMARY KEY(`billId`)
);
--> statement-breakpoint
CREATE TABLE `consultations` (
	`consultationId` varchar(50) NOT NULL,
	`patientId` varchar(50) NOT NULL,
	`consultationDate` timestamp NOT NULL DEFAULT (now()),
	`audioFileUrl` text,
	`audioFileKey` text,
	`rawTranscript` text,
	`clinicalHistory` text,
	`presentComplaints` text,
	`advisedInvestigations` text,
	`treatmentPlan` text,
	`digitalSignature` text,
	`isFinalized` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `consultations_consultationId` PRIMARY KEY(`consultationId`)
);
--> statement-breakpoint
CREATE TABLE `inventory` (
	`itemId` varchar(50) NOT NULL,
	`itemName` varchar(255) NOT NULL,
	`batchNumber` varchar(100) NOT NULL,
	`expiryDate` varchar(10) NOT NULL,
	`quantityAvailable` int DEFAULT 0,
	`reorderLevel` int DEFAULT 10,
	`unitPrice` decimal(10,2) NOT NULL,
	`lastRestocked` timestamp DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inventory_itemId` PRIMARY KEY(`itemId`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`notificationId` varchar(50) NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`content` text,
	`notificationType` varchar(50) NOT NULL,
	`isRead` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_notificationId` PRIMARY KEY(`notificationId`)
);
--> statement-breakpoint
CREATE TABLE `patients` (
	`patientId` varchar(50) NOT NULL,
	`firstName` varchar(100) NOT NULL,
	`lastName` varchar(100) NOT NULL,
	`dateOfBirth` varchar(10) NOT NULL,
	`gender` varchar(20),
	`contactNumber` varchar(20) NOT NULL,
	`email` varchar(255),
	`address` text,
	`barcodeData` varchar(255),
	`barcodeImageUrl` text,
	`qrcodeImageUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `patients_patientId` PRIMARY KEY(`patientId`),
	CONSTRAINT `patients_barcodeData_unique` UNIQUE(`barcodeData`)
);
