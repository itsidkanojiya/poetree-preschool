-- A question type can be a page of several books, or of all of them.
--
-- The same "trace the letter A" belongs in Nursery English and in the phonics
-- book. Holding one bookId meant copying the page to do that: three rows to fix
-- when the wording changed, and three separate piles of attempts for what a
-- child experienced as one page.

CREATE TABLE `activity_books` (
  `activityId` VARCHAR(191) NOT NULL,
  `bookId` VARCHAR(191) NOT NULL,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `activity_books_bookId_idx`(`bookId`),
  PRIMARY KEY (`activityId`, `bookId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Every page keeps the book it already had. Done before the column goes, or
-- the catalogue would arrive on the other side belonging to nothing.
INSERT INTO `activity_books` (`activityId`, `bookId`)
SELECT `id`, `bookId` FROM `learning_activities` WHERE `bookId` IS NOT NULL;

ALTER TABLE `activity_books`
  ADD CONSTRAINT `activity_books_activityId_fkey`
    FOREIGN KEY (`activityId`) REFERENCES `learning_activities`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `activity_books_bookId_fkey`
    FOREIGN KEY (`bookId`) REFERENCES `books`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

-- "All books" is a standing rule, not a list ticked once: a page that belongs
-- everywhere should be in the book written next March without anybody
-- remembering to come back for it.
ALTER TABLE `learning_activities`
  ADD COLUMN `allBooks` BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE `learning_activities` DROP FOREIGN KEY `learning_activities_bookId_fkey`;
DROP INDEX `learning_activities_bookId_idx` ON `learning_activities`;
ALTER TABLE `learning_activities` DROP COLUMN `bookId`;
