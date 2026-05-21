CREATE TABLE `userPermissions` (
	`permissionId` varchar(50) NOT NULL,
	`userId` int NOT NULL,
	`featureKey` varchar(100) NOT NULL,
	`isEnabled` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `userPermissions_permissionId` PRIMARY KEY(`permissionId`),
	CONSTRAINT `userPermissions_userId_featureKey` UNIQUE(`userId`,`featureKey`)
);
--> statement-breakpoint
CREATE INDEX `idx_user_feature` ON `userPermissions` (`userId`,`featureKey`);
