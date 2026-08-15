-- Chapters: the sections a book is divided into.
--
-- A book has chapters, a chapter has pages, a page has questions. The pages are
-- what this system calls question types — "Circle the correct letter" — so the
-- chapter sits between the book and them.
CREATE TABLE `chapters` (
  `id` VARCHAR(191) NOT NULL,
  `bookId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  -- Printed on the page, and not the same as the order: a book can open with
  -- "Chapter 0: Getting ready".
  `number` INTEGER NULL,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `chapters_bookId_sortOrder_idx`(`bookId`, `sortOrder`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `chapters`
  ADD CONSTRAINT `chapters_bookId_fkey`
  FOREIGN KEY (`bookId`) REFERENCES `books`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Nullable for the same reason bookId is: the question types that already exist
-- predate chapters, and a NOT NULL column cannot know where to put them.
ALTER TABLE `learning_activities` ADD COLUMN `chapterId` VARCHAR(191) NULL;

ALTER TABLE `learning_activities`
  ADD CONSTRAINT `learning_activities_chapterId_fkey`
  FOREIGN KEY (`chapterId`) REFERENCES `chapters`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX `learning_activities_chapterId_idx` ON `learning_activities`(`chapterId`);
