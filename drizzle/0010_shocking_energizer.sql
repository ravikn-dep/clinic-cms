CREATE TABLE `billTemplates` (
	`templateId` varchar(50) NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`itemsJson` json NOT NULL,
	`isActive` boolean DEFAULT true,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `billTemplates_templateId` PRIMARY KEY(`templateId`)
);
