-- A family can register without already holding an admission number.
--
-- Asking for one meant a family could only apply if the office had already
-- given them a piece of paper — which is the wrong way round for a family
-- joining the school. The office issues the number now, when it approves, and
-- decides at the same moment whether this is a child already on the roll or a
-- new record to create.
--
-- Both columns keep every value they hold: existing rows claimed a child, and
-- that is still true of them.
ALTER TABLE `parent_registrations`
  MODIFY `studentId` VARCHAR(191) NULL,
  MODIFY `admissionNo` VARCHAR(40) NULL,
  -- A name alone is not an identity: a school with two Aaravs cannot tell which
  -- family a request belongs to. Nullable because rows already in the queue
  -- were never asked.
  ADD COLUMN `studentDateOfBirth` DATETIME(3) NULL;
