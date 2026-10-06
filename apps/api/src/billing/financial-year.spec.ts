import { financialYear } from './financial-year';

describe('financialYear', () => {
  it('runs April to March in India time', () => {
    expect(financialYear(new Date('2026-04-01T00:00:00+05:30'))).toBe('2026-27');
    expect(financialYear(new Date('2026-03-31T23:59:59+05:30'))).toBe('2025-26');
    // 31 March 19:00 UTC is already 1 April in India
    expect(financialYear(new Date('2027-03-31T19:00:00Z'))).toBe('2027-28');
    expect(financialYear(new Date('2099-12-31T00:00:00+05:30'))).toBe('2099-00');
  });
});
