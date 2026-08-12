-- The school's logo, as an uploaded file rather than a URL somebody typed.
--
-- `logoUrl` stays: it is a perfectly good way to point at a logo already hosted
-- somewhere, and dropping a column that may hold a live value to replace it
-- with an empty one is not an upgrade. Whichever is set is what the clients
-- show, with the uploaded file preferred.
ALTER TABLE `schools` ADD COLUMN `logoFileId` VARCHAR(191) NULL;

-- SET NULL rather than CASCADE: a logo deleted by mistake should cost the
-- school its picture, not its row.
ALTER TABLE `schools`
  ADD CONSTRAINT `schools_logoFileId_fkey`
  FOREIGN KEY (`logoFileId`) REFERENCES `file_objects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
