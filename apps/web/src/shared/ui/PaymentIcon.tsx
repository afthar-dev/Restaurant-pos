import type { PaymentMode } from '@rpos/shared';
import { Banknote, CreditCard, QrCode, type LucideIcon } from 'lucide-react';
import { Icon, type IconSize } from './Icon';

export const PAYMENT_ICON: Record<PaymentMode, LucideIcon> = {
  CASH: Banknote,
  UPI: QrCode,
  CARD: CreditCard,
};

/** The icon for a payment mode; always shown next to the mode's name, so it is decorative. */
export function PaymentIcon({
  mode,
  size = 'sm',
  className,
}: {
  mode: PaymentMode;
  size?: IconSize;
  className?: string;
}) {
  return <Icon as={PAYMENT_ICON[mode]} size={size} className={className} />;
}
