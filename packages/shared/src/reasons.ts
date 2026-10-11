import { z } from 'zod';

/** Why a kitchen ticket is printed again. */
export const KOT_REPRINT_REASONS = ['PRINTER_JAM', 'KITCHEN_LOST', 'OTHER'] as const;
export type KotReprintReason = (typeof KOT_REPRINT_REASONS)[number];

/** Each kind of reason list, keyed by name; later tasks add their lists here. */
export const REASON_LABELS = {
  kotReprint: {
    PRINTER_JAM: 'Printer jam',
    KITCHEN_LOST: 'Kitchen lost it',
    OTHER: 'Other',
  },
} as const satisfies Record<string, Record<string, string>>;

export type ReasonKind = keyof typeof REASON_LABELS;
export type ReasonCode<K extends ReasonKind> = keyof (typeof REASON_LABELS)[K] & string;

/** The label staff see for a reason code; an unknown code (an older entry) is shown as is. */
export function reasonLabel<K extends ReasonKind>(kind: K, code: ReasonCode<K>): string;
export function reasonLabel(kind: ReasonKind, code: string): string;
export function reasonLabel(kind: ReasonKind, code: string): string {
  const labels: Record<string, string> = REASON_LABELS[kind];
  return labels[code] ?? code;
}

export const kotReprintSchema = z
  .strictObject({
    reasonCode: z.enum(KOT_REPRINT_REASONS),
    note: z.string().trim().max(200).optional(),
  })
  .refine((v) => v.reasonCode !== 'OTHER' || (v.note?.length ?? 0) >= 3, {
    path: ['note'],
    message: 'Say what happened.',
  });
export type KotReprintRequest = z.infer<typeof kotReprintSchema>;
