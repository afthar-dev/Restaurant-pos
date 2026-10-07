import { describe, expect, it } from 'vitest';
import { csvCell, csvRupees, toCsv } from './csv';
import { presetRange } from './ranges';

describe('presetRange (India dates)', () => {
  // Wednesday 7 Oct 2026, 01:00 in India = Tuesday 6 Oct 19:30 UTC.
  const now = Date.UTC(2026, 9, 6, 19, 30);

  it('uses the India date, not the UTC date', () => {
    expect(presetRange('today', now)).toEqual({ from: '2026-10-07', to: '2026-10-07' });
    expect(presetRange('yesterday', now)).toEqual({ from: '2026-10-06', to: '2026-10-06' });
  });

  it('starts weeks on Monday and handles month edges', () => {
    expect(presetRange('thisWeek', now)).toEqual({ from: '2026-10-05', to: '2026-10-07' });
    expect(presetRange('thisMonth', now)).toEqual({ from: '2026-10-01', to: '2026-10-07' });
    expect(presetRange('lastMonth', now)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    const sunday = Date.UTC(2026, 9, 11, 6);
    expect(presetRange('thisWeek', sunday)).toEqual({ from: '2026-10-05', to: '2026-10-11' });
    const january = Date.UTC(2027, 0, 15, 6);
    expect(presetRange('lastMonth', january)).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });
});

describe('CSV', () => {
  it('quotes text, doubles quotes and leaves numbers bare', () => {
    expect(csvCell('Paneer "special"')).toBe('"Paneer ""special"""');
    expect(csvCell(-12.5)).toBe('-12.5');
    expect(
      toCsv([
        ['Item', 'Amount'],
        ['Roti, butter', 32],
      ]),
    ).toBe('"Item","Amount"\r\n"Roti, butter",32');
  });

  it('keeps spreadsheet formulas from running', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(csvCell('+91 food')).toBe('"\'+91 food"');
    expect(csvCell('-cmd')).toBe('"\'-cmd"');
    expect(csvCell('@SUM(A1)')).toBe('"\'@SUM(A1)"');
  });

  it('writes paise as rupees', () => {
    expect(csvRupees(117050)).toBe(1170.5);
    expect(csvRupees(3200)).toBe(32);
  });
});
