-- Three ways to play that the catalogue had no word for.
--
-- SINGLE_CHOICE and DRAG_DROP hold exactly what MATCHING already held — a
-- prompt, some options, and which one is right — and differ only in how the
-- child answers. MULTIPLE_CHOICE is the one that is genuinely different: more
-- than one option may be marked correct.
--
-- Widening an enum is additive. Nothing stored today changes value, and every
-- existing activity keeps the type it had.
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
    'STORY'
  ) NOT NULL;
