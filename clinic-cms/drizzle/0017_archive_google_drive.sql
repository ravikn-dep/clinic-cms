CREATE TABLE IF NOT EXISTS `archiveRuns` (
  `runId` varchar(50) NOT NULL,
  `startedAt` timestamp NOT NULL DEFAULT (now()),
  `finishedAt` timestamp NULL DEFAULT NULL,
  `status` enum('running','completed','failed') NOT NULL DEFAULT 'running',
  `fileCount` int DEFAULT 0,
  `archiveSizeBytes` int,
  `driveFileId` varchar(255),
  `driveFolderId` varchar(255),
  `error` text,
  `triggeredBy` varchar(100),
  PRIMARY KEY(`runId`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `googleDriveTokens` (
  `id` varchar(50) NOT NULL,
  `accessTokenEnc` text,
  `refreshTokenEnc` text NOT NULL,
  `expiryDate` timestamp NULL DEFAULT NULL,
  `connectedEmail` varchar(320),
  `driveFolderId` varchar(255),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(`id`)
);
