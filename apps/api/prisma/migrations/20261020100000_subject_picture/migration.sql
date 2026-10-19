-- A picture for a subject, uploaded in the publisher's panel and shown on the
-- subject's tile in the app — the way a book has a cover. Nullable: until one
-- is uploaded the subject keeps the icon it was given, so nothing changes for
-- a subject nobody has drawn yet.
ALTER TABLE `book_subjects` ADD COLUMN `pictureFileId` VARCHAR(191) NULL;

-- SET NULL, matching a book's cover: deleting a picture never deletes a subject.
ALTER TABLE `book_subjects`
  ADD CONSTRAINT `book_subjects_pictureFileId_fkey`
  FOREIGN KEY (`pictureFileId`) REFERENCES `file_objects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
