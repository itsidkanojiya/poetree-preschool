-- A child's name in three parts, the way an Indian school form asks for it:
-- given name, father's name, surname — "Dishan Krunal Patel".
--
-- The middle part is a person, not a spelling, and schools sort and search on
-- it. Run into the surname, as it had to be until now, nothing could ever
-- separate it again.
--
-- Nullable and additive throughout: every existing child keeps the two parts
-- they have, and every request already in the queue keeps the one name it was
-- sent with.
ALTER TABLE `students` ADD COLUMN `middleName` VARCHAR(60) NULL AFTER `firstName`;

-- The same three parts as a family types them, kept beside the written-out name
-- so the office puts them on the child's record exactly as they were given.
ALTER TABLE `parent_registrations`
  ADD COLUMN `studentFirstName` VARCHAR(60) NULL,
  ADD COLUMN `studentMiddleName` VARCHAR(60) NULL,
  ADD COLUMN `studentLastName` VARCHAR(60) NULL;
