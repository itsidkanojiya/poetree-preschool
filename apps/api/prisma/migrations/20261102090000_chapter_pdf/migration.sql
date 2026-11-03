-- Each chapter's pages, as a PDF a child reads in the app.
--
-- A subject is one book, and a child now goes subject → chapter → the
-- chapter's video, activities and pages. The publisher uploads a PDF per
-- chapter instead of the whole book. Nullable, no backfill: a chapter with no
-- PDF simply has nothing to read yet.
ALTER TABLE `chapters` ADD COLUMN `pdfFileId` VARCHAR(191) NULL;

-- Its size before it was made smaller for phones. Null until then.
ALTER TABLE `chapters` ADD COLUMN `pdfOriginalSizeBytes` INTEGER NULL;

-- SET NULL, matching the cover: deleting a file must never delete a chapter.
ALTER TABLE `chapters`
  ADD CONSTRAINT `chapters_pdfFileId_fkey`
  FOREIGN KEY (`pdfFileId`) REFERENCES `file_objects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
