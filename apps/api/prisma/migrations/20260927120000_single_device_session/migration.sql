-- Parents and teachers are signed in on one device at a time.
ALTER TABLE `users` ADD COLUMN `currentSessionId` VARCHAR(40) NULL;
ALTER TABLE `refresh_tokens` ADD COLUMN `sessionId` VARCHAR(40) NULL;
