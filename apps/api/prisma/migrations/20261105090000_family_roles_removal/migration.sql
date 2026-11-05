-- One person, two roles; a role per session; accounts the school removes; and
-- a registration that names the class and proves the second number.
--
-- Nothing is deleted or rewritten. Every column is new and either nullable or
-- defaulted, so existing accounts, sessions and waiting registrations carry on
-- exactly as they were.

-- A role is held by holding its profile. These say when the school took the
-- role away; the profile stays so a removed person's name still reads on the
-- records they left behind, and restoring them is clearing the date.
ALTER TABLE `teacher_profiles` ADD COLUMN `removedAt` DATETIME(3) NULL;
ALTER TABLE `parent_profiles` ADD COLUMN `removedAt` DATETIME(3) NULL;

-- The role a sign-in is acting as, for someone who is both a parent and a
-- teacher. Null: the account's own role, which is every session today.
ALTER TABLE `refresh_tokens` ADD COLUMN `activeRole` ENUM('PUBLICATION_ADMIN', 'ORG_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'PARENT') NULL;

-- The registration's class, the second contact's relation, proof and email,
-- and the account a child is for when the family already has one.
ALTER TABLE `parent_registrations` ADD COLUMN `classLevelId` VARCHAR(191) NULL,
    ADD COLUMN `motherEmail` VARCHAR(160) NULL,
    ADD COLUMN `motherPhoneVerified` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `parentUserId` VARCHAR(191) NULL,
    ADD COLUMN `secondContactRelation` ENUM('FATHER', 'MOTHER', 'GUARDIAN', 'OTHER') NOT NULL DEFAULT 'MOTHER';

ALTER TABLE `parent_registrations` ADD CONSTRAINT `parent_registrations_classLevelId_fkey` FOREIGN KEY (`classLevelId`) REFERENCES `class_levels`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `parent_registrations` ADD CONSTRAINT `parent_registrations_parentUserId_fkey` FOREIGN KEY (`parentUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Every teacher and parent account holds its role through its profile from
-- now on. Accounts made by every path in this codebase already have one; this
-- writes one for any that somehow do not, so nobody is locked out by the
-- change. Ids are cuid-shaped ('c' and 24 hex) to pass the API's id checks.
INSERT INTO `teacher_profiles` (`id`, `userId`, `schoolId`, `createdAt`, `updatedAt`)
SELECT CONCAT('c', LOWER(SUBSTRING(REPLACE(UUID(), '-', ''), 1, 24))), u.`id`, u.`schoolId`, NOW(3), NOW(3)
FROM `users` u
LEFT JOIN `teacher_profiles` t ON t.`userId` = u.`id`
WHERE u.`role` = 'TEACHER' AND u.`schoolId` IS NOT NULL AND t.`id` IS NULL;

INSERT INTO `parent_profiles` (`id`, `userId`, `schoolId`, `relation`, `createdAt`, `updatedAt`)
SELECT CONCAT('c', LOWER(SUBSTRING(REPLACE(UUID(), '-', ''), 1, 24))), u.`id`, u.`schoolId`, 'GUARDIAN', NOW(3), NOW(3)
FROM `users` u
LEFT JOIN `parent_profiles` p ON p.`userId` = u.`id`
WHERE u.`role` = 'PARENT' AND u.`schoolId` IS NOT NULL AND p.`id` IS NULL;

-- An account the school had already deactivated by removing it is removed in
-- the new sense too, so it does not come back as a teacher or parent.
UPDATE `teacher_profiles` t JOIN `users` u ON u.`id` = t.`userId`
SET t.`removedAt` = u.`deletedAt`
WHERE u.`deletedAt` IS NOT NULL AND t.`removedAt` IS NULL;

UPDATE `parent_profiles` p JOIN `users` u ON u.`id` = p.`userId`
SET p.`removedAt` = u.`deletedAt`
WHERE u.`deletedAt` IS NOT NULL AND p.`removedAt` IS NULL;
