CREATE TABLE `purchaseOrderExtractionReviews` (
	`reviewId` varchar(50) NOT NULL,
	`purchaseOrderId` varchar(50) NOT NULL,
	`reviewSubmissionId` varchar(100) NOT NULL,
	`extractionProvider` varchar(64) NOT NULL,
	`documentType` varchar(32) NOT NULL,
	`reviewStatus` enum('CONFIRMED') NOT NULL DEFAULT 'CONFIRMED',
	`reviewerUserId` varchar(100) NOT NULL,
	`reviewerName` varchar(255),
	`reviewedAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`extractedHeaderJson` text NOT NULL,
	`extractedItemsJson` text NOT NULL,
	`extractedTotalsJson` text NOT NULL,
	`reconciliationJson` text NOT NULL,
	`warningsJson` text NOT NULL,
	`correctedFieldsJson` text NOT NULL,
	`finalReviewedValuesJson` text NOT NULL,
	CONSTRAINT `purchaseOrderExtractionReviews_reviewId` PRIMARY KEY(`reviewId`),
	CONSTRAINT `purchaseOrderExtractionReviews_reviewId_unique` UNIQUE(`reviewId`),
	CONSTRAINT `purchaseOrderExtractionReviews_purchaseOrder_unique` UNIQUE(`purchaseOrderId`),
	CONSTRAINT `purchaseOrderExtractionReviews_submission_unique` UNIQUE(`reviewSubmissionId`)
);
--> statement-breakpoint
CREATE INDEX `purchaseOrderExtractionReviews_reviewer_createdAt_idx` ON `purchaseOrderExtractionReviews` (`reviewerUserId`,`createdAt`);