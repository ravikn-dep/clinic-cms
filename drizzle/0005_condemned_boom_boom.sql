ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','consultant','staff') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `users` ADD `userId` varchar(50);--> statement-breakpoint
ALTER TABLE `users` ADD `username` varchar(100);--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` text;--> statement-breakpoint
ALTER TABLE `users` ADD `phone` varchar(20);--> statement-breakpoint
ALTER TABLE `users` ADD `department` varchar(100);--> statement-breakpoint
ALTER TABLE `users` ADD `isActive` boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE `users` ADD `qrcodeLoginUrl` text;--> statement-breakpoint
ALTER TABLE `users` ADD `qrcodeLoginKey` text;--> statement-breakpoint
ALTER TABLE `users` ADD `createdBy` int;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_userId_unique` UNIQUE(`userId`);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_username_unique` UNIQUE(`username`);