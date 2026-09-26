-- Three things the parent app's new home needs from the database.
--
-- 1. Subjects above books, so a child's shelf can be entered by subject:
--    English, then English Book A or Book B, then its chapters. A list of its
--    own rather than the school's timetable subjects — those belong to each
--    school, and a school renaming "EVS" must not move the publisher's books.
--
-- 2. A second film per chapter, for when the publisher has a 3D version. The
--    existing link stays the 2D one, so nothing already published changes.
--
-- 3. A gallery: events the school photographed, shown only to the classes the
--    office chooses, because the photos are of other people's children.
--
-- All additive. No existing row changes meaning.

CREATE TABLE `book_subjects` (
  `id` VARCHAR(191) NOT NULL,
  `code` VARCHAR(40) NOT NULL,
  `name` VARCHAR(80) NOT NULL,
  -- Which picture the app draws. A key rather than an upload, so a subject
  -- added in the admin panel looks right on day one.
  `icon` VARCHAR(30) NOT NULL DEFAULT 'book',
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `book_subjects_code_key`(`code`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- The subjects a preschool actually teaches, so the app has something to show
-- the moment this ships. The publisher files each book under one of them in
-- the admin panel, and can add or rename subjects there.
INSERT INTO `book_subjects` (`id`, `code`, `name`, `icon`, `sortOrder`, `updatedAt`) VALUES
  ('subj_english',  'ENGLISH',  'English',  'abc',      1, CURRENT_TIMESTAMP(3)),
  ('subj_maths',    'MATHS',    'Maths',    'numbers',  2, CURRENT_TIMESTAMP(3)),
  ('subj_evs',      'EVS',      'EVS',      'globe',    3, CURRENT_TIMESTAMP(3)),
  ('subj_hindi',    'HINDI',    'Hindi',    'hindi',    4, CURRENT_TIMESTAMP(3)),
  ('subj_gujarati', 'GUJARATI', 'Gujarati', 'gujarati', 5, CURRENT_TIMESTAMP(3)),
  ('subj_gk',       'GK',       'GK',       'bulb',     6, CURRENT_TIMESTAMP(3)),
  ('subj_rhymes',   'RHYMES',   'Rhymes',   'music',    7, CURRENT_TIMESTAMP(3)),
  ('subj_phonics',  'PHONICS',  'Phonics',  'phonics',  8, CURRENT_TIMESTAMP(3));

-- Null for a book nobody has filed yet; it appears under "More books" rather
-- than vanishing. SET NULL so retiring a subject never deletes a book.
ALTER TABLE `books` ADD COLUMN `subjectId` VARCHAR(191) NULL;
CREATE INDEX `books_subjectId_idx` ON `books`(`subjectId`);
ALTER TABLE `books`
  ADD CONSTRAINT `books_subjectId_fkey`
  FOREIGN KEY (`subjectId`) REFERENCES `book_subjects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `chapters` ADD COLUMN `animation3dUrl` VARCHAR(500) NULL;

CREATE TABLE `gallery_events` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `eventDate` DATETIME(3) NULL,
  `description` VARCHAR(500) NULL,
  -- Every family in the school instead of the listed classes. A choice, never
  -- a default, so nothing reaches the whole school by accident.
  `visibleToAll` BOOLEAN NOT NULL DEFAULT false,
  `createdById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `gallery_events_schoolId_eventDate_idx`(`schoolId`, `eventDate`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `gallery_event_classrooms` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `eventId` VARCHAR(191) NOT NULL,
  `classroomId` VARCHAR(191) NOT NULL,

  UNIQUE INDEX `gallery_event_classrooms_eventId_classroomId_key`(`eventId`, `classroomId`),
  INDEX `gallery_event_classrooms_schoolId_classroomId_idx`(`schoolId`, `classroomId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `gallery_photos` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `eventId` VARCHAR(191) NOT NULL,
  `fileId` VARCHAR(191) NOT NULL,
  `caption` VARCHAR(200) NULL,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `gallery_photos_eventId_fileId_key`(`eventId`, `fileId`),
  INDEX `gallery_photos_schoolId_eventId_sortOrder_idx`(`schoolId`, `eventId`, `sortOrder`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `gallery_events`
  ADD CONSTRAINT `gallery_events_schoolId_fkey`
    FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `gallery_events_createdById_fkey`
    FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `gallery_event_classrooms`
  ADD CONSTRAINT `gallery_event_classrooms_eventId_fkey`
    FOREIGN KEY (`eventId`) REFERENCES `gallery_events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `gallery_event_classrooms_classroomId_fkey`
    FOREIGN KEY (`classroomId`) REFERENCES `classrooms`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `gallery_event_classrooms_schoolId_fkey`
    FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `gallery_photos`
  ADD CONSTRAINT `gallery_photos_eventId_fkey`
    FOREIGN KEY (`eventId`) REFERENCES `gallery_events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `gallery_photos_fileId_fkey`
    FOREIGN KEY (`fileId`) REFERENCES `file_objects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `gallery_photos_schoolId_fkey`
    FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
