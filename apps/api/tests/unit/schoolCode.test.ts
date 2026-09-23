import { describe, expect, it } from 'vitest';
import { codeFromName, nextFreeCode, organisationScopeKey } from '../../src/lib/scope.js';

/**
 * Codes are generated now rather than typed, and a generated code becomes an
 * Android application-id segment that can never be changed afterwards. So the
 * shape of what comes out is worth pinning down here, where no database is
 * needed to check it.
 */
describe('school and group codes', () => {
  const VALID = /^[a-z][a-z0-9]{2,29}$/;

  it('reads like the school it names', () => {
    expect(codeFromName('Sunrise Preschool')).toBe('sunrisepreschool');
    expect(codeFromName('Sunrise')).toBe('sunrise');
    // The third word onwards is what every school shares — "International
    // School and Day Care" names nobody.
    expect(codeFromName('Shree Swaminarayan International Pre-School')).toBe('shreeswaminarayan');
  });

  it('always produces something a build can use', () => {
    const awkward = [
      'Sunrise Preschool',
      '2nd Chance Academy', // must not start with a digit
      'ABC',
      'A B', // too short once joined
      'Śrī Vidyā Mandir', // accents stripped, not dropped
      'St. Mary’s',
      '123',
      'Nursery & Day-Care',
    ];

    for (const name of awkward) {
      expect(codeFromName(name), name).toMatch(VALID);
    }
  });

  it('takes the next free code when the obvious one has gone', async () => {
    const used = new Set(['sunrise', 'sunrise2']);
    const taken = (code: string) => Promise.resolve(used.has(code));

    expect(await nextFreeCode('sunrise', taken)).toBe('sunrise3');
    expect(await nextFreeCode('poppins', taken)).toBe('poppins');
  });

  it('numbers a group’s branches under the group’s own code', async () => {
    // What the Super Admin sees when adding branches to "sunrise": 01, then 02.
    const used = new Set<string>();
    const taken = (code: string) => Promise.resolve(used.has(code));
    const options = { firstSuffix: 1, padTo: 2 };

    const first = await nextFreeCode('sunrise', taken, options);
    used.add(first);
    const second = await nextFreeCode('sunrise', taken, options);

    expect(first).toBe('sunrise01');
    expect(second).toBe('sunrise02');
    expect(first).toMatch(VALID);
  });

  it('keeps generated codes inside the 30-character column', async () => {
    const long = codeFromName('Shreemati Kamalaben Vidyalaya Trust');
    const used = new Set([long]);
    const next = await nextFreeCode(long, (code) => Promise.resolve(used.has(code)));

    expect(next.length).toBeLessThanOrEqual(30);
    expect(next).toMatch(VALID);
  });

  it('scopes a group administrator by their group, not by a school', () => {
    // The uniqueness constraints on email and phone are (scopeKey, value), so a
    // group admin with no school needs a key of their own — and one that cannot
    // collide with a school id, which is what a school user's key is.
    const key = organisationScopeKey('clx1234567890abcdefghijkl');

    expect(key).toBe('org:clx1234567890abcdefghijkl');
    expect(key.length).toBeLessThanOrEqual(32);
  });
});
