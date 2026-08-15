-- How long a school's access lasts, on the school itself.
--
-- This lived on a subscription row, which meant setting it required inventing a
-- plan with seat limits and a price. The publisher wanted the date and nothing
-- else: when it passes, the school is locked out until it is extended.
ALTER TABLE `schools` ADD COLUMN `validUntil` DATETIME(3) NULL;

-- Carry across what the plans were already saying, so no school's access
-- changes on the day this ships.
UPDATE `schools` s
  JOIN `school_subscriptions` sub
    ON sub.schoolId = s.id AND sub.isCurrent = 1
  SET s.validUntil = sub.expiresAt
  WHERE s.validUntil IS NULL;
