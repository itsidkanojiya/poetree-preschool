-- A school chooses how its ID cards are drawn, not only how big they are.
--
-- CLASSIC is the card every school printed before there was a choice, so the
-- default leaves nobody's cards changed underneath them.
ALTER TABLE `schools`
  ADD COLUMN `idCardLayout` ENUM('CLASSIC', 'BANNER', 'FRONT_BACK') NOT NULL DEFAULT 'CLASSIC',
  -- Off by default, like the address: a birthday is half of what it takes to
  -- pass as a child's parent on a phone call.
  ADD COLUMN `idCardShowDateOfBirth` BOOLEAN NOT NULL DEFAULT false;
