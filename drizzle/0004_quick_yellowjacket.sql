ALTER TABLE `bills` ADD `receiptDeliveryStatus` enum('Not Sent','Sent','Failed','Pending') DEFAULT 'Not Sent';--> statement-breakpoint
ALTER TABLE `bills` ADD `receiptDeliveryMethod` varchar(50);--> statement-breakpoint
ALTER TABLE `bills` ADD `receiptDeliveryTimestamp` timestamp;--> statement-breakpoint
ALTER TABLE `purchaseOrders` ADD `approvalStatus` enum('Pending Approval','Approved','Rejected') DEFAULT 'Pending Approval';--> statement-breakpoint
ALTER TABLE `purchaseOrders` ADD `rejectionReason` text;--> statement-breakpoint
ALTER TABLE `purchaseOrders` ADD `approvedBy` varchar(100);--> statement-breakpoint
ALTER TABLE `purchaseOrders` ADD `approvalTimestamp` timestamp;