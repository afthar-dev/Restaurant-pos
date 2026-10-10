import { afterEach, describe, expect, it, vi } from 'vitest';
import { fitWithin, shrinkPhoto } from './photo';

describe('fitWithin', () => {
  it('scales the longest side down to the limit, keeping the shape', () => {
    expect(fitWithin(4000, 3000, 1024)).toEqual({ width: 1024, height: 768 });
    expect(fitWithin(3000, 4000, 1024)).toEqual({ width: 768, height: 1024 });
  });
  it('leaves small photos alone', () => {
    expect(fitWithin(800, 600, 1024)).toEqual({ width: 800, height: 600 });
  });
});

describe('shrinkPhoto', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks the browser to turn phone photos the right way up, and says when it cannot read one', async () => {
    const decode = vi.fn().mockRejectedValue(new Error('not an image'));
    vi.stubGlobal('createImageBitmap', decode);
    const file = new File(['heic'], 'photo.heic', { type: 'image/heic' });
    await expect(shrinkPhoto(file)).rejects.toThrow('Could not read this photo.');
    expect(decode).toHaveBeenCalledWith(file, { imageOrientation: 'from-image' });
  });

  describe('when the browser cannot write WebP (Safari, iPad)', () => {
    function fakeCanvas() {
      const fills: string[] = [];
      const context = {
        fillStyle: '',
        fillRect: vi.fn(function (this: { fillStyle: string }) {
          fills.push(this.fillStyle);
        }),
        drawImage: vi.fn(),
      };
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
      vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (cb, type) {
        // No WebP encoder: the browser hands back PNG for an unknown type, as Safari does.
        cb(
          type === 'image/webp'
            ? new Blob(['x'], { type: 'image/png' })
            : new Blob(['x'], { type }),
        );
      });
      vi.stubGlobal(
        'createImageBitmap',
        vi.fn().mockResolvedValue({ width: 800, height: 400, close: vi.fn() }),
      );
      return { fills };
    }
    afterEach(() => vi.restoreAllMocks());

    it('keeps a logo transparent as PNG', async () => {
      const { fills } = fakeCanvas();
      const blob = await shrinkPhoto(new File(['x'], 'logo.png'), 512, { transparent: true });
      expect(blob.type).toBe('image/png');
      expect(fills).toEqual([]);
    });

    it('puts a photo on white before making a JPEG, so clear areas are not black', async () => {
      const { fills } = fakeCanvas();
      const blob = await shrinkPhoto(new File(['x'], 'dish.png'));
      expect(blob.type).toBe('image/jpeg');
      expect(fills).toEqual(['#ffffff']);
    });
  });
});
