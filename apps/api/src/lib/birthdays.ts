/**
 * Birthdays, on the school's calendar. Dates are YYYY-MM-DD strings, so the
 * arithmetic never meets a time zone.
 */

const isLeapYear = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/**
 * The day a child born on `dateOfBirth` has their birthday in `year`. A child
 * born on 29 February has theirs on the 28th when the year has no 29th —
 * wished a day early rather than not at all.
 */
export function birthdayThisYear(dateOfBirth: string, year: number): string {
  const monthDay = dateOfBirth.slice(5, 10);
  if (monthDay === '02-29' && !isLeapYear(year)) return `${year}-02-28`;
  return `${year}-${monthDay}`;
}

/** Whether `today` is the child's birthday. */
export function isBirthdayOn(dateOfBirth: string, today: string): boolean {
  return birthdayThisYear(dateOfBirth, Number(today.slice(0, 4))) === today;
}
