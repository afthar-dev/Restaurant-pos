import { describe, expect, it } from 'vitest';
import { qrApproveSchema, qrRejectSchema, qrStartSchema, qrSubmitSchema } from './qr';

const line = {
  variantId: '00000000-0000-4000-8000-000000000001',
  quantity: 1,
  addonIds: [],
};

describe('QR schemas', () => {
  it('needs the code from the table sticker', () => {
    expect(qrStartSchema.safeParse({ code: 'short' }).success).toBe(false);
    expect(qrStartSchema.parse({ code: `  ${'a'.repeat(43)}  ` }).code).toHaveLength(43);
  });

  it('takes between 1 and 30 dishes with an optional note', () => {
    expect(qrSubmitSchema.safeParse({ lines: [] }).success).toBe(false);
    expect(qrSubmitSchema.safeParse({ lines: Array(31).fill(line) }).success).toBe(false);
    expect(qrSubmitSchema.parse({ lines: [line], note: ' less spicy ' }).note).toBe('less spicy');
  });

  it('approves as submitted or with edited dishes, and rejects with an optional reason', () => {
    expect(qrApproveSchema.parse({})).toEqual({});
    expect(qrApproveSchema.safeParse({ lines: [] }).success).toBe(false);
    expect(qrRejectSchema.parse({ reason: ' Kitchen closed ' })).toEqual({
      reason: 'Kitchen closed',
    });
  });
});
