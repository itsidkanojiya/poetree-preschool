-- Books, and which school has which.
--
-- The thing Poetree sells: "Nursery EVS", "Junior KG Phonics". A book belongs
-- to one standard and holds the question types a child plays. Publication-owned
-- like every other catalogue row — there is no schoolId here on purpose.
CREATE TABLE `books` (
  `id` VARCHAR(191) NOT NULL,
  `code` VARCHAR(40) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `classLevelId` VARCHAR(191) NOT NULL,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `coverFileId` VARCHAR(191) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `books_code_key`(`code`),
  INDEX `books_classLevelId_sortOrder_idx`(`classLevelId`, `sortOrder`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `books`
  ADD CONSTRAINT `books_classLevelId_fkey`
  FOREIGN KEY (`classLevelId`) REFERENCES `class_levels`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `books`
  ADD CONSTRAINT `books_coverFileId_fkey`
  FOREIGN KEY (`coverFileId`) REFERENCES `file_objects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- The question type belongs to a book: "Circle the correct letter" is a page of
-- one. Nullable because the activities that already exist predate books and are
-- filed by a migration script rather than by a DEFAULT that could not know.
ALTER TABLE `learning_activities` ADD COLUMN `bookId` VARCHAR(191) NULL;

ALTER TABLE `learning_activities`
  ADD CONSTRAINT `learning_activities_bookId_fkey`
  FOREIGN KEY (`bookId`) REFERENCES `books`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX `learning_activities_bookId_idx` ON `learning_activities`(`bookId`);

-- What a school bought. A row exists for every school and book pairing so the
-- toggle has something to hold; absence is not the same as "off", because a
-- book added next year must not silently appear at a school that did not buy it
-- — the row is created disabled in that case, by the service.
CREATE TABLE `school_books` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `bookId` VARCHAR(191) NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `school_books_schoolId_bookId_key`(`schoolId`, `bookId`),
  INDEX `school_books_schoolId_enabled_idx`(`schoolId`, `enabled`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `school_books`
  ADD CONSTRAINT `school_books_schoolId_fkey`
  FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `school_books`
  ADD CONSTRAINT `school_books_bookId_fkey`
  FOREIGN KEY (`bookId`) REFERENCES `books`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
