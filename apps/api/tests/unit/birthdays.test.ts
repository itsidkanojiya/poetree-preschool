import { describe, expect, it } from 'vitest';
import { birthdayThisYear, isBirthdayOn } from '../../src/lib/birthdays.js';

describe('birthdays', () => {
  it('falls on the same day and month, whatever the year', () => {
    expect(isBirthdayOn('2021-11-25', '2026-11-25')).toBe(true);
    expect(isBirthdayOn('2021-11-25', '2026-11-26')).toBe(false);
  });

  it('keeps a 29 February birthday on 28 February when there is no 29th', () => {
    expect(isBirthdayOn('2020-02-29', '2027-02-28')).toBe(true);
    expect(isBirthdayOn('2020-02-29', '2028-02-28')).toBe(false);
    expect(isBirthdayOn('2020-02-29', '2028-02-29')).toBe(true);
  });

  it('says when this year’s birthday is', () => {
    expect(birthdayThisYear('2020-02-29', 2027)).toBe('2027-02-28');
    expect(birthdayThisYear('2021-07-04', 2027)).toBe('2027-07-04');
  });
});
