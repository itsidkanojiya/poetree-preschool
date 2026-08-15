/**
 * Lifts activity content out of `contentJson` and into question rows.
 *
 * The seeded activities were written before questions were rows: 13 of them,
 * 56 items, all emoji. They keep working either way — the API falls back to the
 * stored blob for anything with no rows — but nothing can be *edited* until it
 * has been lifted, and an author opening "Counting apples" to add a question
 * should not find it empty.
 *
 * Safe to run more than once: an activity that already has questions is left
 * alone rather than doubled.
 *
 *   npx tsx prisma/migrate-content-to-questions.ts
 */
import { PrismaClient } from '@prisma/client';
import { composeContent } from '../src/services/question.service.js';

const prisma = new PrismaClient();

interface Media {
  glyph?: string;
  text?: string;
  imageUrl?: string;
}

/** Old content stored options as bare strings; new content as objects. */
function toMedia(option: unknown): Media {
  if (typeof option === 'string') {
    // A digit or a word rather than a picture — "1", "2", "3" are options in
    // the counting activities, and they are text, not emoji.
    return /^[0-9]{1,3}$/.test(option) ? { text: option } : { glyph: option };
  }
  return (option ?? {}) as Media;
}

async function main(): Promise<void> {
  const activities = await prisma.learningActivity.findMany({
    select: { id: true, code: true, title: true, type: true, contentJson: true },
    orderBy: { code: 'asc' },
  });

  let lifted = 0;
  let skipped = 0;
  let empty = 0;

  for (const activity of activities) {
    const existing = await prisma.activityQuestion.count({ where: { activityId: activity.id } });
    if (existing > 0) {
      skipped += 1;
      continue;
    }

    // Parsed loosely: this content was written against the older shape, so the
    // strict schema would reject the very rows we are here to rescue.
    const raw = activity.contentJson as { kind?: string; items?: unknown[] } | null;
    if (!raw || !Array.isArray(raw.items) || raw.items.length === 0) {
      empty += 1;
      console.warn(`  – ${activity.code}: nothing to lift`);
      continue;
    }

    let order = 0;
    for (const item of raw.items) {
      const entry = item as {
        say?: string;
        title?: string;
        glyph?: string;
        strokes?: unknown;
        prompt?: { say?: string; glyph?: string };
        options?: unknown[];
        answer?: number;
      };

      const say = entry.prompt?.say ?? entry.say ?? entry.title ?? 'Look at this';
      const promptGlyph = entry.prompt?.glyph ?? entry.glyph ?? null;

      await prisma.activityQuestion.create({
        data: {
          activityId: activity.id,
          sortOrder: order,
          say: say.slice(0, 200),
          promptGlyph: promptGlyph ? promptGlyph.slice(0, 16) : null,
          strokesJson: (entry.strokes ?? undefined) as never,
          options: {
            create: (entry.options ?? []).map((option, index) => {
              const media = toMedia(option);
              return {
                sortOrder: index,
                text: media.text ?? null,
                glyph: media.glyph ?? null,
                // The old content had no pictures at all, so nothing to carry.
                fileId: null,
                isCorrect: index === entry.answer,
              };
            }),
          },
        },
      });

      order += 1;
    }

    lifted += 1;
    console.warn(`  ✓ ${activity.code}: ${raw.items.length} questions`);
  }

  console.warn(`\nLifted ${lifted}, already had rows ${skipped}, nothing to lift ${empty}.`);

  // Prove the round trip rather than assume it, using the very function that
  // serves the app rather than a second copy of it. The first draft of this
  // check reimplemented composing and forgot pictures, and reported perfectly
  // good content as broken — a verifier that disagrees with production is
  // worse than no verifier.
  let unreadable = 0;
  for (const activity of activities) {
    const questions = await prisma.activityQuestion.count({ where: { activityId: activity.id } });
    if (questions === 0) continue;

    const content = await composeContent({ id: activity.id, type: activity.type });
    if (!content) {
      unreadable += 1;
      console.error(`  ! ${activity.code} has no playable questions after lifting`);
    }
  }

  if (unreadable > 0) {
    console.error(`
${unreadable} activities are unplayable after lifting. Fix before deploying.`);
    process.exitCode = 1;
  } else {
    console.warn('Every lifted activity composes back into something the app can play.');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
