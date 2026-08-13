/**
 * Publication-level learning content.
 *
 * Progress is measured against skills, so without these the module has nothing
 * to report and a teacher opening the screen sees a blank page and concludes it
 * is broken. This is a starter set covering what a preschool actually teaches;
 * Poetree replaces the activities with real authored content later, and the
 * skills stay put so no child's history is lost.
 *
 *   npx tsx prisma/seed-skills.ts
 */
import { PrismaClient, type ActivityType } from '@prisma/client';

const prisma = new PrismaClient();

interface SkillSeed {
  code: string;
  name: string;
  level: string;
  sortOrder: number;
  activities: Array<{ code: string; title: string; type: ActivityType }>;
}

const SKILLS: SkillSeed[] = [
  {
    code: 'LETTERS_UPPER',
    name: 'Letter recognition A–Z',
    level: 'NURSERY',
    sortOrder: 10,
    activities: [
      { code: 'TRACE_A_E', title: 'Trace letters A to E', type: 'TRACING' },
      { code: 'TRACE_F_J', title: 'Trace letters F to J', type: 'TRACING' },
      { code: 'MATCH_LETTER_PICTURE', title: 'Match the letter to the picture', type: 'MATCHING' },
    ],
  },
  {
    code: 'LETTERS_LOWER',
    name: 'Small letters a–z',
    level: 'JUNIOR_KG',
    sortOrder: 20,
    activities: [{ code: 'TRACE_LOWER_A_E', title: 'Trace a to e', type: 'TRACING' }],
  },
  {
    code: 'NUMBERS_1_20',
    name: 'Numbers 1 to 20',
    level: 'NURSERY',
    sortOrder: 30,
    activities: [
      { code: 'TRACE_1_10', title: 'Trace numbers 1 to 10', type: 'TRACING' },
      { code: 'COUNT_OBJECTS', title: 'Count the objects', type: 'COUNTING' },
    ],
  },
  {
    code: 'SHAPES',
    name: 'Shapes',
    level: 'PLAY_GROUP',
    sortOrder: 40,
    activities: [
      { code: 'MATCH_SHAPES', title: 'Match the shapes', type: 'MATCHING' },
      { code: 'SORT_SHAPES', title: 'Sort shapes into boxes', type: 'SORTING' },
    ],
  },
  {
    code: 'COLOURS',
    name: 'Colours',
    level: 'PLAY_GROUP',
    sortOrder: 50,
    activities: [
      { code: 'MATCH_COLOURS', title: 'Match the colours', type: 'MATCHING' },
      { code: 'COLOUR_THE_FRUIT', title: 'Colour the fruit', type: 'COLOURING' },
    ],
  },
  {
    code: 'ANIMALS',
    name: 'Animal recognition',
    level: 'PLAY_GROUP',
    sortOrder: 60,
    activities: [{ code: 'FLASH_ANIMALS', title: 'Animal flash cards', type: 'FLASHCARD' }],
  },
  {
    code: 'FRUITS',
    name: 'Fruit recognition',
    level: 'PLAY_GROUP',
    sortOrder: 70,
    activities: [{ code: 'FLASH_FRUITS', title: 'Fruit flash cards', type: 'FLASHCARD' }],
  },
  {
    code: 'RHYMES',
    name: 'Rhymes and songs',
    level: 'PLAY_GROUP',
    sortOrder: 80,
    activities: [{ code: 'RHYME_TWINKLE', title: 'Twinkle Twinkle Little Star', type: 'RHYME' }],
  },
];

async function main(): Promise<void> {
  const levels = await prisma.classLevel.findMany({ select: { id: true, code: true } });
  const levelId = new Map(levels.map((l) => [l.code, l.id]));

  if (levelId.size === 0) {
    throw new Error('Class levels are missing. Run the main seed first.');
  }

  let skillCount = 0;
  let activityCount = 0;

  for (const seed of SKILLS) {
    // Upsert on code so re-running never duplicates, and a renamed skill keeps
    // every child's progress attached to it.
    const skill = await prisma.skill.upsert({
      where: { code: seed.code },
      update: { name: seed.name, sortOrder: seed.sortOrder },
      create: {
        code: seed.code,
        name: seed.name,
        sortOrder: seed.sortOrder,
        classLevelId: levelId.get(seed.level) ?? null,
      },
    });
    skillCount += 1;

    for (const activity of seed.activities) {
      await prisma.learningActivity.upsert({
        where: { code: activity.code },
        update: { title: activity.title, skillId: skill.id },
        create: {
          code: activity.code,
          title: activity.title,
          type: activity.type,
          skillId: skill.id,
          classLevelId: levelId.get(seed.level) ?? null,
        },
      });
      activityCount += 1;
    }
  }

  console.warn(`Seeded ${skillCount} skills and ${activityCount} activities.`);
  console.warn('These are placeholders — replace the activities with authored content.');
}

main()
  .catch((error: unknown) => {
    console.error('Skill seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
