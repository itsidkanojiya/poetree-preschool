/**
 * Dates for the fee pages, on the school's calendar.
 *
 * Due dates and follow-up dates arrive as bare YYYY-MM-DD. They are worked on
 * as text and spelled out by hand rather than through `new Date()` and
 * toLocaleDateString: a bare date read as a Date is UTC midnight, which shows
 * as the day before anywhere west of Greenwich, and the server and the browser
 * do not always agree on a month's short name. Written out here, a date reads
 * the same in both, which a table rendered on one and hydrated on the other
 * needs.
 */

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Schools here are in India, and the API counts "today" in IST. */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

const pad = (value: number) => String(value).padStart(2, '0');

function parts(day: string | null | undefined): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(day ?? '');
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** "1 Oct 2026", from YYYY-MM-DD or the date part of a timestamp. */
export function formatDay(day: string | null | undefined): string {
  const date = parts(day);
  if (!date) return '—';
  return `${date[2]} ${SHORT_MONTHS[date[1] - 1]} ${date[0]}`;
}

/** An instant as the school's clock showed it: "14 Oct 2026, 10:30 am". */
export function formatMoment(iso: string | null | undefined): string {
  const time = iso ? Date.parse(iso) : Number.NaN;
  if (Number.isNaN(time)) return '—';
  const at = new Date(time + IST_OFFSET_MS);
  const hours = at.getUTCHours();
  return `${formatDay(at.toISOString())}, ${hours % 12 || 12}:${pad(at.getUTCMinutes())} ${
    hours < 12 ? 'am' : 'pm'
  }`;
}

/** Today on the school's calendar, YYYY-MM-DD. */
export function schoolToday(): string {
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** A date some days on, YYYY-MM-DD. */
export function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day.slice(0, 10)}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** A date some months on. The 31st becomes the last day of a shorter month. */
export function addMonths(day: string, months: number): string {
  const date = parts(day);
  if (!date) return day;
  const index = date[0] * 12 + (date[1] - 1) + months;
  const year = Math.floor(index / 12);
  const month = index - year * 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${pad(month + 1)}-${pad(Math.min(date[2], lastDay))}`;
}

/** Calendar months from one date to another, both counted: April to March is 12. */
export function monthsSpanned(start: string, end: string): number {
  const from = parts(start);
  const to = parts(end);
  if (!from || !to) return 12;
  return (to[0] - from[0]) * 12 + (to[1] - from[1]) + 1;
}

/** The month a date falls in, by name: "April". */
export function monthName(day: string): string {
  const date = parts(day);
  return date ? MONTH_NAMES[date[1] - 1] : '';
}
