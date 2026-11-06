-- A child removed because their only parent here was removed, and by whose
-- removal: restoring that parent brings the child back. Nullable, so every
-- existing child is untouched.
ALTER TABLE `students` ADD COLUMN `removedWithParentId` VARCHAR(191) NULL;
