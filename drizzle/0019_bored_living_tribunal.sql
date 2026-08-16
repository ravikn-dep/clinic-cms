CREATE TABLE `externalRequestReplays` (
	`replayId` varchar(64) NOT NULL,
	`serviceKeyId` varchar(100) NOT NULL,
	`requestId` varchar(64) NOT NULL,
	`endpoint` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `externalRequestReplays_key_request_unique` UNIQUE(`serviceKeyId`,`requestId`)
);
--> statement-breakpoint
CREATE INDEX `externalRequestReplays_createdAt_idx` ON `externalRequestReplays` (`createdAt`);