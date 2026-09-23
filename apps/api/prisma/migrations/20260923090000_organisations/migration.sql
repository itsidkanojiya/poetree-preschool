-- A customer that runs more than one school, and the branch administrator who
-- works across them.
--
-- A branch is a `schools` row, not a new dimension on every table. Forty-six
-- tables carry `schoolId` and one Prisma extension filters them all; a
-- `branchId` beside it would be forty-six columns and a second filter to get
-- wrong. As a school row, a branch already has its own children, staff, fees,
-- admission-number series and ID card settings, already isolated.
--
-- Everything here is additive and nullable. An independent school has
-- `organisationId` NULL and nothing about it changes.
CREATE TABLE `organisations` (
  `id` VARCHAR(191) NOT NULL,
  `publicationId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(160) NOT NULL,

  -- The group's code. A branch's own code is derived from it (sunrise →
  -- sunrise01, sunrise02), and the group's branded app is built with this one,
  -- so a group ships one app rather than one per branch.
  `code` VARCHAR(30) NOT NULL,

  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `organisations_code_key`(`code`),
  INDEX `organisations_publicationId_idx`(`publicationId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `organisations`
  ADD CONSTRAINT `organisations_publicationId_fkey`
  FOREIGN KEY (`publicationId`) REFERENCES `publications`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- RESTRICT, not CASCADE: deleting a group must never take its branches — and
-- with them every child's record — along with it.
ALTER TABLE `schools` ADD COLUMN `organisationId` VARCHAR(191) NULL;
CREATE INDEX `schools_organisationId_idx` ON `schools`(`organisationId`);
ALTER TABLE `schools`
  ADD CONSTRAINT `schools_organisationId_fkey`
  FOREIGN KEY (`organisationId`) REFERENCES `organisations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- ORG_ADMIN: a group's own administrator. They hold no school of their own
-- until they pick a branch, at which point their session is an ordinary school
-- admin session for that branch.
ALTER TABLE `users` MODIFY `role` ENUM('PUBLICATION_ADMIN', 'ORG_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'PARENT') NOT NULL;
ALTER TABLE `users` ADD COLUMN `organisationId` VARCHAR(191) NULL;
CREATE INDEX `users_organisationId_idx` ON `users`(`organisationId`);
ALTER TABLE `users`
  ADD CONSTRAINT `users_organisationId_fkey`
  FOREIGN KEY (`organisationId`) REFERENCES `organisations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Which branch a group administrator was working in when the session started.
-- Held on the session rather than re-derived on refresh, so a refresh cannot
-- silently drop them back to "no branch chosen" midway through a task.
ALTER TABLE `refresh_tokens` ADD COLUMN `activeSchoolId` VARCHAR(191) NULL;
