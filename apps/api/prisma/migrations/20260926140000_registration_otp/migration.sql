-- Proving the number and the address before the form is sent.
--
-- The code is asked for BEFORE there is a registration — the contact details
-- have to be proved before the form they belong to is sent, or a family fills
-- in three screens only to be told at the end that they mistyped their own
-- number. So the challenge is its own table rather than a column on the
-- registration.
--
-- One table for both channels: a code to a phone and a code to an inbox are
-- the same problem with different plumbing, and two tables would be two sets
-- of expiry, attempt-counting and spending rules to keep in step.
--
-- The code is hashed: four digits sitting in a database is a number anybody
-- who can read the table could use.
CREATE TABLE `otp_challenges` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `channel` ENUM('PHONE', 'EMAIL') NOT NULL,
  `destination` VARCHAR(160) NOT NULL,
  `codeHash` VARCHAR(64) NOT NULL,
  -- Wrong guesses. One in ten thousand is worth nothing if it may be guessed
  -- without limit.
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `expiresAt` DATETIME(3) NOT NULL,
  `verifiedAt` DATETIME(3) NULL,
  -- Set when a registration has been sent with it, so one proof cannot open
  -- two accounts.
  `usedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `otp_challenges_schoolId_channel_destination_idx`(`schoolId`, `channel`, `destination`),
  INDEX `otp_challenges_expiresAt_idx`(`expiresAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `otp_challenges`
  ADD CONSTRAINT `otp_challenges_schoolId_fkey`
  FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- The father's number signs in and is already `phone`. This is the mother's,
-- which the school rings when the first does not answer.
ALTER TABLE `parent_registrations` ADD COLUMN `motherPhone` VARCHAR(20) NULL;
