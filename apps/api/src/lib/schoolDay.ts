/**
 * School days as instants.
 *
 * A day on a school's calendar is a day in India Standard Time — the same
 * offset `schoolToday` in feeSchedule.ts uses. Something posted at 11 pm on
 * the 8th is the 8th's, though the server's clock and the database call it
 * 17:30 UTC; and something posted at 1 am on the 9th is the 9th's, though
 * UTC still says the 8th.
 */

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface SchoolDays {
  /** Midnight IST at the start of the first day. */
  start: Date;
  /** Midnight IST after the last day: the span is [start, end). */
  end: Date;
  /** The first and last day as calendar dates, for date-only columns. */
  firstDate: Date;
  lastDate: Date;
}

/**
 * The span from the start of [from] to the end of [to], both `YYYY-MM-DD`
 * school days and both included. Either may be left out for an open end.
 * Null when neither is given.
 */
export function schoolDays(from?: string, to?: string): SchoolDays | null {
  if (!from && !to) return null;

  const first = Date.parse(`${from ?? '1970-01-01'}T00:00:00.000Z`);
  const last = Date.parse(`${to ?? '9999-12-31'}T00:00:00.000Z`);

  return {
    start: new Date(first - IST_OFFSET_MS),
    end: new Date(last + DAY_MS - IST_OFFSET_MS),
    firstDate: new Date(first),
    lastDate: new Date(last),
  };
}
