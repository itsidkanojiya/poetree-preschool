-- Standards become rows the Super Admin maintains, not four values compiled in.
--
-- The enum said PLAY_GROUP, NURSERY, JUNIOR_KG, SENIOR_KG and nothing else could
-- ever exist. A publisher selling into a school that calls its first year
-- "Toddler" had no way to say so, and adding one meant a migration and a
-- release. MySQL stores an enum as its string label, so the existing four rows
-- keep their exact values through this change and nothing has to be rewritten.
ALTER TABLE `class_levels` MODIFY COLUMN `code` VARCHAR(40) NOT NULL;

-- Retiring a standard has to be possible without deleting it: classrooms,
-- fee structures and a term of history point at it.
ALTER TABLE `class_levels` ADD COLUMN `isActive` BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE `class_levels` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
ALTER TABLE `class_levels` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
