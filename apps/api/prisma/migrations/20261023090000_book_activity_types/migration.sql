-- The activities the Pre-Primary books ask for.
--
-- Six new ways to play: odd one out, find the letter, match the pairs, sort
-- into groups, count and colour, fill the gap. Widening the enum is additive;
-- the older values stay so anything stored under them still reads.
ALTER TABLE `learning_activities`
  MODIFY `type` ENUM(
    'SINGLE_CHOICE',
    'MULTIPLE_CHOICE',
    'MATCHING',
    'TRACING',
    'COUNTING',
    'SORTING',
    'COLOURING',
    'DRAG_DROP',
    'FLASHCARD',
    'RHYME',
    'STORY',
    'ODD_ONE_OUT',
    'LETTER_HUNT',
    'MATCH_PAIRS',
    'SORT_GROUPS',
    'COUNT_OUT',
    'FILL_GAP'
  ) NOT NULL;

-- Matching, Counting, Sorting, Colouring and Drag and drop all played as "tap
-- the one right answer", which is Pick the Right One. Their questions are
-- already that shape, so only the name changes and a child sees nothing new.
UPDATE `learning_activities`
  SET `type` = 'SINGLE_CHOICE'
  WHERE `type` IN ('MATCHING', 'COUNTING', 'SORTING', 'COLOURING', 'DRAG_DROP');

-- What a question needs beyond its options: the number to colour, the row
-- with its gaps, the letters to find, the baskets to sort into.
ALTER TABLE `activity_questions` ADD COLUMN `settingsJson` JSON NULL;

-- A card's basket, and a pair's partner on the right.
ALTER TABLE `question_options`
  ADD COLUMN `groupIndex` INTEGER NULL,
  ADD COLUMN `matchText` VARCHAR(80) NULL,
  ADD COLUMN `matchGlyph` VARCHAR(16) NULL,
  ADD COLUMN `matchFileId` VARCHAR(191) NULL,
  ADD COLUMN `matchShadow` BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE `question_options`
  ADD CONSTRAINT `question_options_matchFileId_fkey`
  FOREIGN KEY (`matchFileId`) REFERENCES `file_objects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
