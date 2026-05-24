CREATE TABLE `userPermissions` (
	`permissionId` varchar(50) NOT NULL,
	`userId` int NOT NULL,
	`featureKey` varchar(100) NOT NULL,
	`isEnabled` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `userPermissions_permissionId` PRIMARY KEY(`permissionId`)
);
--> statement-breakpoint
ALTER TABLE `patients` ADD `isArchived` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `patients` ADD `archivedAt` timestamp NULL DEFAULT NULL;--> statement-breakpoint
CREATE INDEX `idx_user_feature` ON `userPermissions` (`userId`,`featureKey`);