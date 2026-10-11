import type { ParcelPaymentTiming, TaxScheme } from '@rpos/shared';

export interface OutletSettings {
  id: string;
  name: string;
  gstin: string | null;
  taxScheme: TaxScheme;
  address: string | null;
  phone: string | null;
  fssaiNumber: string | null;
  billHeader: string | null;
  billFooter: string | null;
  cashierDiscountCapBp: number;
  waiterCanCollectPayment: boolean;
  parcelPaymentTiming: ParcelPaymentTiming;
  billPackagingCharge: number;
  /** Cash variance (paise) above which closing the day needs a reason. */
  varianceAlertPaise: number;
  /** A cash expense above this (paise) needs a manager when a non-manager records it. */
  pettyCashLimitPaise: number;
  /** The UPI ID and payee name behind the payment QR; null until set. */
  upiVpa: string | null;
  upiPayee: string | null;
  /** Print the UPI QR under the total of an unpaid bill. */
  printUpiQr: boolean;
  /** Shown in the staff header, on printed bills and on the QR menu. */
  logoUrl: string | null;
}
