import { describe, expect, it } from 'vitest';
import { paiseToRupees, toCsv } from '../../src/lib/csv.js';

describe('csv', () => {
  const columns = [
    { header: 'Name', value: (r: { name: string; note?: string }) => r.name },
    { header: 'Note', value: (r: { name: string; note?: string }) => r.note },
  ];

  it('quotes and escapes fields that contain delimiters', () => {
    const csv = toCsv([{ name: 'Patil, Diya', note: 'She said "hello"' }], columns);

    expect(csv).toContain('"Patil, Diya"');
    expect(csv).toContain('"She said ""hello"""');
  });

  it('neutralises cells Excel would run as a formula', () => {
    // A note beginning with = or + is executed on open, so an export becomes an
    // attack on whoever opens it. The value must still be readable, so it is
    // prefixed rather than stripped.
    const csv = toCsv(
      [
        { name: '=1+1', note: '+HYPERLINK("http://evil","click")' },
        { name: '@SUM(A1)', note: '-2+3' },
      ],
      columns,
    );

    expect(csv).toContain("'=1+1");
    expect(csv).toContain('\'+HYPERLINK');
    expect(csv).toContain("'@SUM(A1)");
    expect(csv).toContain("'-2+3");

    // And nothing survives in a form Excel would evaluate.
    expect(csv).not.toMatch(/(^|,)=/m);
  });

  it('writes a BOM so Excel reads it as UTF-8', () => {
    const csv = toCsv([{ name: 'Sharma' }], columns);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('uses CRLF line endings', () => {
    const csv = toCsv([{ name: 'a' }, { name: 'b' }], columns);
    expect(csv.split('\r\n').length).toBeGreaterThan(2);
  });

  it('renders empty cells for missing values rather than "undefined"', () => {
    const csv = toCsv([{ name: 'Solo' }], columns);
    expect(csv).not.toContain('undefined');
    expect(csv.trim().endsWith('Solo,')).toBe(true);
  });

  it('converts paise to rupees without floating-point drift', () => {
    expect(paiseToRupees(500_000)).toBe('5000.00');
    expect(paiseToRupees(1)).toBe('0.01');
    expect(paiseToRupees(-200_000)).toBe('-2000.00');
  });
});
