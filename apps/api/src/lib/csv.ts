/**
 * CSV serialisation.
 *
 * Exports from this system are opened in Excel by school offices, which makes
 * two things matter beyond commas and quotes.
 */

/**
 * Byte order mark. Excel guesses the system codepage without it, so an
 * accented or Devanagari name arrives as mojibake in a school office.
 * Written as an escape: the literal character is invisible in an editor.
 */
const BOM = '﻿';

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

/**
 * Characters that make Excel treat a cell as a formula.
 *
 * A parent named "=cmd" or a note beginning with "+" would otherwise be
 * executed rather than displayed when the file is opened — the export becomes
 * an attack on whoever opens it. Prefixing with a single quote makes Excel show
 * the text verbatim, and other tools ignore it.
 */
const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r'];

function escapeCell(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return '';

  let value = String(raw);

  if (FORMULA_TRIGGERS.some((trigger) => value.startsWith(trigger))) {
    value = `'${value}`;
  }

  // RFC 4180: double the quotes, wrap anything containing a delimiter.
  if (/[",\n\r]/.test(value)) {
    value = `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

export function toCsv<T>(rows: T[], columns: Array<CsvColumn<T>>): string {
  const lines = [columns.map((c) => escapeCell(c.header)).join(',')];

  for (const row of rows) {
    lines.push(columns.map((c) => escapeCell(c.value(row))).join(','));
  }

  // CRLF per RFC 4180, and a BOM so Excel reads UTF-8 rather than guessing the
  // system codepage — without it a plain ASCII name survives but any accented
  // or Devanagari character does not. Written as an escape rather than a
  // literal, which is invisible in an editor and trips lint.
  return BOM + lines.join('\r\n') + '\r\n';
}

/** Money is stored in paise; a spreadsheet wants rupees it can sum. */
export function paiseToRupees(paise: number): string {
  return (paise / 100).toFixed(2);
}

/** A filename a school office can find again in a downloads folder. */
export function reportFilename(name: string, extension = 'csv'): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `${name}-${stamp}.${extension}`;
}
