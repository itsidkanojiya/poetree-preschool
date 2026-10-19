-- The book itself, as a PDF a child reads in the app.
--
-- A school's subjects open onto its books, and a book now opens onto its pages
-- as printed — the PDF the publisher uploads — rather than onto a contents page
-- of activities. Nullable, no backfill: a book with no PDF yet says so in the
-- app instead of opening onto nothing.
ALTER TABLE `books` ADD COLUMN `pdfFileId` VARCHAR(191) NULL;

-- The PDF is made smaller for phones after it is uploaded; this is its size
-- before that, so the publisher can see what was saved. Null until then.
ALTER TABLE `books` ADD COLUMN `pdfOriginalSizeBytes` INTEGER NULL;

-- SET NULL, matching the cover: deleting a file must never delete the book.
ALTER TABLE `books`
  ADD CONSTRAINT `books_pdfFileId_fkey`
  FOREIGN KEY (`pdfFileId`) REFERENCES `file_objects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
