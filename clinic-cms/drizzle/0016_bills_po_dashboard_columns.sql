-- Dashboard fix: bills + purchaseOrders columns (safe to re-run only via scripts/ensure-schema.ts)
-- Manual run if needed; duplicate ADD will error on MySQL.

ALTER TABLE `bills` ADD `receiptPdfUrl` text;
ALTER TABLE `bills` ADD `receiptPdfKey` text;
ALTER TABLE `bills` ADD `consultationNotes` text;
ALTER TABLE `bills` ADD `receiptDeliveryStatus` enum('Not Sent','Sent','Failed','Pending') DEFAULT 'Not Sent';
ALTER TABLE `bills` ADD `receiptDeliveryMethod` varchar(50);
ALTER TABLE `bills` ADD `receiptDeliveryTimestamp` timestamp;

ALTER TABLE `purchaseOrders` ADD `approvalStatus` enum('Pending Approval','Approved','Rejected') DEFAULT 'Pending Approval';
ALTER TABLE `purchaseOrders` ADD `rejectionReason` text;
ALTER TABLE `purchaseOrders` ADD `approvedBy` varchar(100);
ALTER TABLE `purchaseOrders` ADD `approvalTimestamp` timestamp;
ALTER TABLE `purchaseOrders` ADD `authorizationNotes` text;
