import { describe, expect, it } from 'vitest';
import { studentName } from '../../src/lib/names.js';

/**
 * A child's name, written out.
 *
 * Eighteen places used to join these by hand, and a child whose name printed in
 * full on an ID card and in half on a receipt is the kind of thing nobody
 * reports and everybody notices. One function, tested here.
 */
describe('studentName', () => {
  it('writes the three parts the way a school form asks for them', () => {
    expect(
      studentName({ firstName: 'Dishan', middleName: 'Krunal', lastName: 'Patel' }),
    ).toBe('Dishan Krunal Patel');
  });

  it('leaves no gap where a part is missing', () => {
    // Every child on the roll before the middle name existed has none, and a
    // family with one name between them is a real family.
    expect(studentName({ firstName: 'Aarav', middleName: null, lastName: 'Joshi' })).toBe(
      'Aarav Joshi',
    );
    expect(studentName({ firstName: 'Aarav', middleName: 'Nikhil', lastName: null })).toBe(
      'Aarav Nikhil',
    );
    expect(studentName({ firstName: 'Aarav' })).toBe('Aarav');
  });

  it('does not let a blank column become a double space', () => {
    // An imported sheet with an empty middle-name column, which is how "Aarav
    // Joshi" becomes "Aarav  Joshi" on a printed register.
    expect(studentName({ firstName: 'Aarav', middleName: '   ', lastName: 'Joshi' })).toBe(
      'Aarav Joshi',
    );
    expect(studentName({ firstName: ' Aarav ', lastName: ' Joshi ' })).toBe('Aarav Joshi');
  });
});
