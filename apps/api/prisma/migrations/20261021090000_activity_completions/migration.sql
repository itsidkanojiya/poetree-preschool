-- That a child finished an activity, whether or not it had a score.
--
-- A chapter in the 2D & 3D Animation flow is finished when its video has been
-- watched and every activity in it is done. Scored activities already leave
-- an attempt behind; flashcards leave nothing, by design, because a score for
-- looking at pictures would inflate the skills figures. This records "done"
-- for both, apart from the scores.
CREATE TABLE `activity_completions` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `activityId` VARCHAR(191) NOT NULL,
  `completedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `activity_completions_studentId_activityId_key`(`studentId`, `activityId`),
  INDEX `activity_completions_schoolId_studentId_idx`(`schoolId`, `studentId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `activity_completions`
  ADD CONSTRAINT `activity_completions_schoolId_fkey`
    FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `activity_completions_studentId_fkey`
    FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `activity_completions_activityId_fkey`
    FOREIGN KEY (`activityId`) REFERENCES `learning_activities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Every activity a child has already finished with a score counts as done, so
-- nobody is asked to do again what they did last week. The first attempt's id
-- is unique per child and activity, so it serves as the row's id.
INSERT INTO `activity_completions` (`id`, `schoolId`, `studentId`, `activityId`, `completedAt`)
SELECT MIN(a.`id`), MIN(a.`schoolId`), a.`studentId`, a.`activityId`,
       MIN(COALESCE(a.`completedAt`, a.`createdAt`))
FROM `activity_attempts` a
GROUP BY a.`studentId`, a.`activityId`;
