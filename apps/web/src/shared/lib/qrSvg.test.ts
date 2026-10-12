import { describe, expect, it } from 'vitest';
import { qrSvg } from './qrSvg';

describe('qrSvg', () => {
  it('draws any text as SVG markup', async () => {
    const svg = await qrSvg('upi://pay?pa=a@upi&pn=Cafe&am=10.00&cu=INR');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('<path');
  });
});
