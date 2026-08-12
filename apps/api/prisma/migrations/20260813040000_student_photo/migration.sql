-- A child's photograph, as an uploaded file rather than a URL.
--
-- `avatarUrl` stays for the same reason `schools.logoUrl` did: it may already
-- hold a live value, and replacing a working column with an empty one is not an
-- upgrade. The uploaded file is preferred when both are set.
--
-- Unlike a school's logo this is never served publicly. It is a photograph of
-- somebody's four-year-old, and it stays behind /files/:id where the API asks
-- who is looking.
ALTER TABLE `students` ADD COLUMN `photoFileId` VARCHAR(191) NULL;

ALTER TABLE `students`
  ADD CONSTRAINT `students_photoFileId_fkey`
  FOREIGN KEY (`photoFileId`) REFERENCES `file_objects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
