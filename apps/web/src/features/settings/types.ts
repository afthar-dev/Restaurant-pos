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
  /** Shown in the staff header, on printed bills and on the QR menu. */
  logoUrl: string | null;
}
