-- The film introduces a chapter, not a whole book.
--
-- One film per book meant a single video standing in for everything between
-- two covers. A chapter is what a book is actually divided into — "we're on
-- chapter three" — so it is the unit a child is introduced to.

ALTER TABLE `chapters` ADD COLUMN `animationUrl` VARCHAR(500) NULL;

-- Nothing is lost: a book's film moves to the chapter it opens with. A book
-- with a film and no chapters keeps nothing, which is why this runs before the
-- column is dropped and is reported rather than assumed.
UPDATE `chapters` c
  JOIN (
    SELECT `bookId`, MIN(`sortOrder`) AS `first`
    FROM `chapters`
    GROUP BY `bookId`
  ) f ON f.`bookId` = c.`bookId` AND f.`first` = c.`sortOrder`
  JOIN `books` b ON b.`id` = c.`bookId`
SET c.`animationUrl` = b.`animationUrl`
WHERE b.`animationUrl` IS NOT NULL;

CREATE TABLE `chapter_animation_views` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `chapterId` VARCHAR(191) NOT NULL,
  `watchedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `chapter_animation_views_studentId_chapterId_key`(`studentId`, `chapterId`),
  INDEX `chapter_animation_views_schoolId_studentId_idx`(`schoolId`, `studentId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- A watch of a book's film counts as a watch of the chapter that film moved to,
-- so no child is asked to sit through something they have already seen.
INSERT INTO `chapter_animation_views` (`id`, `schoolId`, `studentId`, `chapterId`, `watchedAt`)
SELECT v.`id`, v.`schoolId`, v.`studentId`, c.`id`, v.`watchedAt`
FROM `book_animation_views` v
JOIN `chapters` c ON c.`bookId` = v.`bookId`
JOIN (
  SELECT `bookId`, MIN(`sortOrder`) AS `first`
  FROM `chapters`
  GROUP BY `bookId`
) f ON f.`bookId` = c.`bookId` AND f.`first` = c.`sortOrder`;

ALTER TABLE `chapter_animation_views`
  ADD CONSTRAINT `chapter_animation_views_schoolId_fkey`
    FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `chapter_animation_views_studentId_fkey`
    FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `chapter_animation_views_chapterId_fkey`
    FOREIGN KEY (`chapterId`) REFERENCES `chapters`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

DROP TABLE `book_animation_views`;
ALTER TABLE `books` DROP COLUMN `animationUrl`;
