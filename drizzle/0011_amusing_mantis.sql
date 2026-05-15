CREATE TABLE `vendors` (
	`vendorId` varchar(50) NOT NULL,
	`name` varchar(150) NOT NULL,
	`contactNumber` varchar(20),
	`gstNumber` varchar(50),
	`address` text,
	`dlNumber` json,
	`email` varchar(320),
	`isActive` boolean DEFAULT true,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vendors_vendorId` PRIMARY KEY(`vendorId`)
);
