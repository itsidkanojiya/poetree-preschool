-- A parent can ask the school for access, and the school decides.
--
-- Until now an account could only come into existence one way: a school admin
-- typed it in. A family with a phone and a child at the school had no way to
-- start, and the sign-in screen ended with "ask the office".
--
-- A registration is not an account. Deliberately not a `users` row with a
-- pending status: `users` is unique on (scopeKey, phone), so a pending account
-- would hold a phone number nobody had approved, and a half-real parent would
-- show up in rosters, counts and every guardian picker in the portal.
--
-- It claims a child the school has ALREADY enrolled, matched on admission
-- number. Registering does not create a pupil — the office still does that — so
-- no plan seat is spent by a stranger and nobody can invent a student.
CREATE TABLE `parent_registrations` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,

  -- The child being claimed, resolved from the admission number at submit.
  `studentId` VARCHAR(191) NOT NULL,
  -- Kept alongside the resolved child so the office sees the claim as it was
  -- typed, not only what it matched.
  `admissionNo` VARCHAR(40) NOT NULL,

  -- The guardian. This becomes the user on approval.
  `guardianName` VARCHAR(120) NOT NULL,
  `relation` ENUM('FATHER', 'MOTHER', 'GUARDIAN', 'OTHER') NOT NULL DEFAULT 'GUARDIAN',
  `phone` VARCHAR(20) NOT NULL,
  `email` VARCHAR(160) NULL,
  -- Hashed on arrival. The plaintext is never stored anywhere, and approval
  -- copies this across rather than asking for it again.
  `passwordHash` VARCHAR(72) NOT NULL,
  `address` VARCHAR(300) NULL,

  -- Declared about the child, for the office to check against its own records.
  -- Approval writes these onto the student only where the school holds nothing.
  `studentName` VARCHAR(120) NOT NULL,
  `fatherName` VARCHAR(120) NULL,
  `motherName` VARCHAR(120) NULL,
  `bloodGroup` VARCHAR(8) NULL,
  `emergencyContactName` VARCHAR(120) NULL,
  `emergencyContactPhone` VARCHAR(20) NULL,

  `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  `reviewedById` VARCHAR(191) NULL,
  `reviewedAt` DATETIME(3) NULL,
  `rejectionReason` VARCHAR(300) NULL,

  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  -- No unique on (schoolId, phone) on purpose. A mother and a father
  -- legitimately register against the same child, and a family whose first
  -- request was rejected must be able to send a corrected one. "Already
  -- waiting" is a rule with a sentence attached, not a constraint violation.
  INDEX `parent_registrations_schoolId_status_idx`(`schoolId`, `status`),
  INDEX `parent_registrations_schoolId_admissionNo_idx`(`schoolId`, `admissionNo`),
  INDEX `parent_registrations_studentId_idx`(`studentId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `parent_registrations`
  ADD CONSTRAINT `parent_registrations_schoolId_fkey`
  FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- A child who leaves takes their pending requests with them.
ALTER TABLE `parent_registrations`
  ADD CONSTRAINT `parent_registrations_studentId_fkey`
  FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- The reviewer is a record of who decided, so it survives them leaving.
ALTER TABLE `parent_registrations`
  ADD CONSTRAINT `parent_registrations_reviewedById_fkey`
  FOREIGN KEY (`reviewedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- The school's own ID card settings.
--
-- A fixed list of sizes rather than free millimetres: a layout that reads well
-- on a credit-card blank looks wrong at twice the width, and every size here is
-- drawn and looked at before it ships.
ALTER TABLE `schools`
  ADD COLUMN `idCardSize` ENUM('CR80', 'LARGE', 'HALF_A5', 'A6') NOT NULL DEFAULT 'CR80',
  -- Separate columns rather than a JSON blob, so they are typed, queryable and
  -- visible in a migration.
  ADD COLUMN `idCardShowBloodGroup` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `idCardShowGuardianPhone` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `idCardShowAddress` BOOLEAN NOT NULL DEFAULT false;
