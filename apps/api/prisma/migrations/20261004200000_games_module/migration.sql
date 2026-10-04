-- AlterTable
ALTER TABLE `publications` ADD COLUMN `gamesEnabled` BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE `games` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(40) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `games_key_key`(`key`),
    INDEX `games_sortOrder_idx`(`sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `game_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `gameKey` VARCHAR(40) NOT NULL,
    `language` VARCHAR(8) NOT NULL,
    `total` INTEGER NOT NULL,
    `correct` INTEGER NOT NULL,
    `wrong` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `game_sessions_schoolId_studentId_idx`(`schoolId`, `studentId`),
    INDEX `game_sessions_studentId_gameKey_language_idx`(`studentId`, `gameKey`, `language`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `game_sessions` ADD CONSTRAINT `game_sessions_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `game_sessions` ADD CONSTRAINT `game_sessions_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

