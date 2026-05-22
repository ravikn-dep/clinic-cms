-- Add openId and loginMethod columns to users table
ALTER TABLE `users` ADD COLUMN `openId` varchar(64) NOT NULL UNIQUE AFTER `id`;
ALTER TABLE `users` ADD COLUMN `loginMethod` varchar(64) AFTER `openId`;

-- Create index for openId if not exists
CREATE INDEX `users_openId_unique` ON `users` (`openId`);
