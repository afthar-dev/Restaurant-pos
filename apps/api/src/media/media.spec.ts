import { detectImageType } from './media';

const bytes = (...b: number[]) => Buffer.from(b);

describe('detectImageType', () => {
  it('reads JPEG, PNG and WebP from their first bytes', () => {
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0))).toBe('image/jpeg');
    expect(detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe(
      'image/png',
    );
    expect(
      detectImageType(
        Buffer.concat([Buffer.from('RIFF'), bytes(1, 2, 3, 4), Buffer.from('WEBPVP8 ')]),
      ),
    ).toBe('image/webp');
  });

  it('refuses everything else', () => {
    expect(detectImageType(Buffer.from('hello, I am text'))).toBeNull();
    expect(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(detectImageType(Buffer.from('GIF89a'))).toBeNull();
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
    expect(detectImageType(Buffer.from('RIFF1234WAVE'))).toBeNull();
  });
});
