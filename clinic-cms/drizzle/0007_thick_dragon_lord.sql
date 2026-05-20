CREATE TABLE `rolePermissions` (
	`permissionId` varchar(50) NOT NULL,
	`role` enum('admin','consultant','staff') NOT NULL,
	`featureKey` varchar(100) NOT NULL,
	`isEnabled` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rolePermissions_permissionId` PRIMARY KEY(`permissionId`)
);
