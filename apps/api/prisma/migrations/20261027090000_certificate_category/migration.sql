-- What a certificate is for — an achievement, a test, behaviour — so a
-- family's app can sort and colour them. Every certificate already issued
-- was an award for doing something well, so it starts as an achievement.
ALTER TABLE `certificates`
  ADD COLUMN `category` ENUM('ACHIEVEMENT', 'TEST', 'BEHAVIOUR') NOT NULL DEFAULT 'ACHIEVEMENT';
