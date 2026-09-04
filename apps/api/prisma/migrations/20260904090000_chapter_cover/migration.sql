-- A picture for a chapter, so a contents page is something a child can read.
--
-- The shelf already shows covers, because a four-year-old finds the orange book
-- with the apple on it long before they can read "EVS". Inside the book that
-- help stopped: every chapter was a numbered rectangle, told apart only by
-- words. This is the same idea one level down.
--
-- Nullable, and no backfill. A book of twelve chapters is twelve pictures to
-- draw, and asking for all of them before any of them help is how a feature
-- goes unused. A chapter with no picture keeps its own colour, so a
-- half-illustrated book is not a half-broken one.
ALTER TABLE `chapters` ADD COLUMN `coverFileId` VARCHAR(191) NULL;

-- SET NULL rather than CASCADE, matching the book's cover: deleting a picture
-- must never delete the chapter that was wearing it.
ALTER TABLE `chapters`
  ADD CONSTRAINT `chapters_coverFileId_fkey`
  FOREIGN KEY (`coverFileId`) REFERENCES `file_objects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
