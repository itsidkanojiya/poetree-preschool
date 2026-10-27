import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  isDatabaseReachable,
  resetDatabase,
  seedBaseline,
  seedSchool,
  type Baseline,
  type TestSchool,
} from '../helpers/db.js';
import { api, auth, BASE, login, type Session } from '../helpers/api.js';
import { disconnectPrisma, prismaUnscoped } from '../../src/db/prisma.js';

/**
 * The activity types made from the Pre-Primary books: each one written the way
 * the portal writes it, and served the way the app reads it.
 */

const dbUp = await isDatabaseReachable();

/** A picture with a see-through background, as the library's are. */
const picture = (colour: string): Promise<Buffer> =>
  sharp({
    create: { width: 48, height: 48, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="48" height="48"><circle cx="24" cy="24" r="16" fill="${colour}"/></svg>`,
        ),
      },
    ])
    .png()
    .toBuffer();

describe.skipIf(!dbUp)('activities from the books', () => {
  let baseline: Baseline;
  let school: TestSchool;
  let publisher: Session;
  let parent: Session;
  let bookId: string;
  let skillId: string;
  let deerId: string;
  let ballId: string;

  /** A new activity of this type, in the school's book. */
  async function activity(code: string, type: string): Promise<string> {
    const created = await api
      .post(`${BASE}/publication/activities`)
      .set(auth(publisher))
      .send({ code, title: code.toLowerCase(), type, skillId, bookIds: [bookId] });
    expect(created.status).toBe(201);
    return created.body.id as string;
  }

  async function question(activityId: string, body: object) {
    const written = await api
      .post(`${BASE}/publication/activities/${activityId}/questions`)
      .set(auth(publisher))
      .send(body);
    expect(written.status).toBe(201);
    return written.body;
  }

  /** What the app is given to play. */
  async function served(activityId: string) {
    const offered = await api.get(`${BASE}/progress/activities`).set(auth(parent));
    return offered.body.find((row: { id: string }) => row.id === activityId)?.contentJson;
  }

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    school = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    publisher = await login(baseline.superAdminEmail);
    parent = await login(school.parentPhone);

    skillId = (
      await prismaUnscoped.skill.create({ data: { code: 'BOOKS', name: 'From the books' } })
    ).id;
    const nursery = await prismaUnscoped.classLevel.findUniqueOrThrow({
      where: { code: 'NURSERY' },
      select: { id: true },
    });
    const book = await api
      .post(`${BASE}/publication/books`)
      .set(auth(publisher))
      .send({ code: 'HOLISTIC_A', name: 'Holistic Book A', classLevelId: nursery.id });
    bookId = book.body.id as string;
    await api
      .put(`${BASE}/publication/schools/${school.id}/books`)
      .set(auth(publisher))
      .send({ books: [{ bookId, enabled: true }] });

    deerId = (
      await api
        .post(`${BASE}/publication/assets`)
        .set(auth(publisher))
        .attach('file', await picture('#c2410c'), 'deer.png')
    ).body.id as string;
    ballId = (
      await api
        .post(`${BASE}/publication/assets`)
        .set(auth(publisher))
        .attach('file', await picture('#2563eb'), 'ball.png')
    ).body.id as string;
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('matches pairs, with a shadow made from the picture itself', async () => {
    const id = await activity('MATCH_SHADOW', 'MATCH_PAIRS');

    const lonely = await question(id, {
      say: 'Match each one',
      options: [{ glyph: 'A', matchGlyph: 'a' }],
    });
    expect(lonely.problem).toBe('Needs at least two pairs to match');

    const written = await question(id, {
      say: 'Match each animal to its shadow',
      options: [
        { fileId: deerId, matchShadow: true },
        { glyph: 'A', matchGlyph: 'a' },
        { text: 'Cow', matchText: 'Calf' },
      ],
    });
    expect(written.problem).toBeNull();
    expect(written.options[0].matchShadow).toBe(true);
    expect(written.options[1].matchGlyph).toBe('a');

    const content = await served(id);
    expect(content.kind).toBe('MATCH_PAIRS');
    // The broken one is left out rather than served.
    expect(content.items).toHaveLength(1);
    expect(content.items[0].pairs[0]).toEqual({
      left: { imageUrl: `/api/v1/catalogue/assets/${deerId}` },
      right: { imageUrl: `/api/v1/catalogue/assets/${deerId}`, silhouette: true },
    });
    expect(content.items[0].pairs[2]).toEqual({ left: { text: 'Cow' }, right: { text: 'Calf' } });
  });

  it('refuses a shadow with no picture to make it from', async () => {
    const id = await activity('MATCH_NO_PICTURE', 'MATCH_PAIRS');
    const written = await question(id, {
      say: 'Match',
      options: [
        { glyph: 'B', matchShadow: true },
        { glyph: 'C', matchGlyph: 'c' },
      ],
    });
    expect(written.problem).toBe('Pair 1 needs a picture on the left to make a shadow of');
  });

  it('sorts cards into two or three baskets', async () => {
    const id = await activity('HEALTHY_OR_JUNK', 'SORT_GROUPS');

    const loose = await question(id, {
      say: 'Put each food in its basket',
      settings: {
        groups: [
          { label: 'Healthy', glyph: '✓' },
          { label: 'Junk', glyph: '✗' },
        ],
      },
      options: [
        { glyph: '🍎', groupIndex: 0 },
        { glyph: '🍔', groupIndex: 2 },
      ],
    });
    expect(loose.problem).toBe('Card 2 is not in a basket');

    const written = await question(id, {
      say: 'Put each food in its basket',
      settings: {
        groups: [
          { label: 'Healthy', glyph: '✓', fileId: ballId },
          { label: 'Junk', glyph: '✗' },
        ],
      },
      options: [
        { glyph: '🍎', groupIndex: 0 },
        { glyph: '🍔', groupIndex: 1 },
        { text: 'Milk', groupIndex: 0 },
      ],
    });
    expect(written.problem).toBeNull();
    expect(written.settings.groups[0].imageUrl).toBe(`/api/v1/catalogue/assets/${ballId}`);

    const content = await served(id);
    expect(content.kind).toBe('SORT_GROUPS');
    expect(content.items[0].groups).toEqual([
      { label: 'Healthy', glyph: '✓', imageUrl: `/api/v1/catalogue/assets/${ballId}` },
      { label: 'Junk', glyph: '✗' },
    ]);
    expect(content.items[0].cards).toEqual([
      { glyph: '🍎', group: 0 },
      { glyph: '🍔', group: 1 },
      { text: 'Milk', group: 0 },
    ]);
  });

  it('counts out exactly N of one picture', async () => {
    const id = await activity('COLOUR_ELEVEN', 'COUNT_OUT');

    const noPicture = await question(id, { say: 'Colour 11 balls', settings: { target: 11 } });
    expect(noPicture.problem).toBe('Choose the picture to colour');

    const tooFew = await question(id, {
      say: 'Colour 11 balls',
      promptFileId: ballId,
      settings: { target: 11, shown: 5 },
    });
    expect(tooFew.problem).toBe('Show at least as many pictures as there are to colour');

    await question(id, { say: 'Colour 11 balls', promptFileId: ballId, settings: { target: 11 } });
    await question(id, {
      say: 'Colour 3 stars',
      promptGlyph: '⭐',
      settings: { target: 3, shown: 8 },
    });

    const content = await served(id);
    expect(content.kind).toBe('COUNT_OUT');
    expect(content.items).toEqual([
      {
        prompt: { say: 'Colour 11 balls' },
        target: 11,
        shown: 17,
        picture: { imageUrl: `/api/v1/catalogue/assets/${ballId}` },
      },
      { prompt: { say: 'Colour 3 stars' }, target: 3, shown: 8, picture: { glyph: '⭐' } },
    ]);
  });

  it('fills the gaps in a row, with nearby wrong tiles', async () => {
    const id = await activity('MISSING_NUMBERS', 'FILL_GAP');

    const noGap = await question(id, { say: 'Fill it in', settings: { row: '1 2 3' } });
    expect(noGap.problem).toBe('Put at least one gap in brackets, like [3]');

    await question(id, {
      say: 'Which numbers are missing?',
      settings: { row: '1 2 [3] 4 [5]' },
    });
    await question(id, {
      say: 'Apple starts with…',
      promptFileId: ballId,
      settings: { row: '[a] p p l e', extras: 'o u' },
    });

    const content = await served(id);
    expect(content.kind).toBe('FILL_GAP');
    expect(content.items[0].cells.map((cell: { gap: boolean }) => cell.gap)).toEqual([
      false,
      false,
      true,
      false,
      true,
    ]);
    expect(content.items[0].choices).toEqual(['3', '5', '6', '7']);
    expect(content.items[1].prompt.imageUrl).toBe(`/api/v1/catalogue/assets/${ballId}`);
    expect(content.items[1].choices).toEqual(['a', 'o', 'u']);
  });

  it('hunts for a letter in a grid typed as one line', async () => {
    const id = await activity('FIND_D', 'LETTER_HUNT');

    const absent = await question(id, {
      say: 'Find every Z',
      settings: { targets: 'Z', grid: 'A B C' },
    });
    expect(absent.problem).toBe('Nothing in the grid is what the child has to find');

    await question(id, {
      say: 'Find every D and d',
      settings: { targets: 'D d', grid: 'DAdDdEDOD' },
    });
    await question(id, {
      say: 'Find 7 on the train',
      settings: { targets: '7', grid: '8 7 7 6 5 2' },
    });

    const content = await served(id);
    expect(content.kind).toBe('LETTER_HUNT');
    expect(content.items[0]).toEqual({
      prompt: { say: 'Find every D and d' },
      cells: ['D', 'A', 'd', 'D', 'd', 'E', 'D', 'O', 'D'],
      targets: ['D', 'd'],
    });
    expect(content.items[1].cells).toEqual(['8', '7', '7', '6', '5', '2']);
  });

  it('asks Odd One Out for three or more', async () => {
    const id = await activity('ODD_BAGS', 'ODD_ONE_OUT');
    const two = await question(id, {
      say: 'Which one is different?',
      options: [
        { glyph: '🎒', isCorrect: false },
        { glyph: '📚', isCorrect: true },
      ],
    });
    expect(two.problem).toBe('Needs at least three, so one can be different');

    await question(id, {
      say: 'Which one is different?',
      options: [
        { glyph: '🎒' },
        { glyph: '🎒' },
        { glyph: '📚', isCorrect: true },
        { glyph: '🎒' },
      ],
    });
    const content = await served(id);
    expect(content.kind).toBe('ODD_ONE_OUT');
    expect(content.items[0].answer).toBe(2);
  });

  it('lets Find Them All have eight to sift', async () => {
    const id = await activity('PETS', 'MULTIPLE_CHOICE');
    const written = await question(id, {
      say: 'Tap every pet',
      options: ['🐴', '🐱', '🐷', '🐶', '🦜', '🐰', '🐪', '🐘'].map((glyph) => ({
        glyph,
        isCorrect: ['🐱', '🐶', '🐰'].includes(glyph),
      })),
    });
    expect(written.problem).toBeNull();
    const content = await served(id);
    expect(content.items[0].answers).toEqual([1, 3, 5]);
  });

  it('reads a rhyme a line at a time', async () => {
    const id = await activity('TWINKLE', 'RHYME');
    await question(id, {
      say: 'Twinkle Twinkle',
      settings: {
        lines:
          'Twinkle, twinkle, little star,\nHow I wonder what you are.\n\nUp above the world so high,',
      },
    });
    const content = await served(id);
    expect(content.items[0].lines).toEqual([
      'Twinkle, twinkle, little star,',
      'How I wonder what you are.',
      'Up above the world so high,',
    ]);
  });

  it('changes and clears a question’s settings', async () => {
    const id = await activity('COLOUR_FIVE', 'COUNT_OUT');
    const written = await question(id, {
      say: 'Colour 5',
      promptGlyph: '⚽',
      settings: { target: 5 },
    });

    const changed = await api
      .patch(`${BASE}/publication/questions/${written.id}`)
      .set(auth(publisher))
      .send({ settings: { target: 7, shown: 12 } });
    expect(changed.body.settings.target).toBe(7);
    expect(changed.body.settings.shown).toBe(12);

    // Not sent: left as it was.
    const untouched = await api
      .patch(`${BASE}/publication/questions/${written.id}`)
      .set(auth(publisher))
      .send({ say: 'Colour 7' });
    expect(untouched.body.settings.target).toBe(7);

    const cleared = await api
      .patch(`${BASE}/publication/questions/${written.id}`)
      .set(auth(publisher))
      .send({ settings: null });
    expect(cleared.body.settings.target).toBeNull();
    expect(cleared.body.problem).toBe('Say how many to colour');
  });

  it('keeps a school’s picture out of a pair or a basket', async () => {
    const admin = await login(school.adminEmail);
    const own = await api
      .post(`${BASE}/files`)
      .set(auth(admin))
      .attach('file', await picture('#16a34a'), 'a-child.png');

    const id = await activity('MATCH_LEAK', 'MATCH_PAIRS');
    const pair = await api
      .post(`${BASE}/publication/activities/${id}/questions`)
      .set(auth(publisher))
      .send({
        say: 'Match',
        options: [
          { glyph: 'A', matchFileId: own.body.id },
          { glyph: 'B', matchGlyph: 'b' },
        ],
      });
    expect(pair.status).toBe(400);

    const sortId = await activity('SORT_LEAK', 'SORT_GROUPS');
    const basket = await api
      .post(`${BASE}/publication/activities/${sortId}/questions`)
      .set(auth(publisher))
      .send({
        say: 'Sort',
        settings: { groups: [{ label: 'Ours', fileId: own.body.id }, { label: 'Theirs' }] },
        options: [{ glyph: '🍎', groupIndex: 0 }],
      });
    expect(basket.status).toBe(400);
  });
});
