-- AlterTable
ALTER TABLE `publications` ADD COLUMN `googleClientId` VARCHAR(255) NULL,
    ADD COLUMN `googleClientSecretSealed` TEXT NULL,
    ADD COLUMN `googleRedirectUri` VARCHAR(500) NULL;

-- AlterTable
ALTER TABLE `file_objects` ADD COLUMN `provider` ENUM('LOCAL', 'GOOGLE_DRIVE') NOT NULL DEFAULT 'LOCAL',
    ADD COLUMN `thumbKey` VARCHAR(300) NULL;

-- CreateTable
CREATE TABLE `gallery_videos` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `videoId` VARCHAR(32) NOT NULL,
    `url` VARCHAR(500) NOT NULL,
    `caption` VARCHAR(200) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `gallery_videos_schoolId_eventId_sortOrder_idx`(`schoolId`, `eventId`, `sortOrder`),
    INDEX `gallery_videos_eventId_idx`(`eventId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `school_drive_connections` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `googleEmail` VARCHAR(254) NOT NULL,
    `refreshTokenSealed` TEXT NOT NULL,
    `folderId` VARCHAR(128) NOT NULL,
    `thumbFolderId` VARCHAR(128) NOT NULL,
    `brokenAt` DATETIME(3) NULL,
    `connectedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `school_drive_connections_schoolId_key`(`schoolId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `gallery_videos` ADD CONSTRAINT `gallery_videos_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `gallery_events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gallery_videos` ADD CONSTRAINT `gallery_videos_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `school_drive_connections` ADD CONSTRAINT `school_drive_connections_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

