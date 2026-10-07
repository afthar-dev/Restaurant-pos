import type { KotStatus, KotType, OrderType } from '@rpos/shared';

export interface KdsTicket {
  id: string;
  orderId: string;
  kotNo: number;
  type: KotType;
  status: KotStatus;
  stationId: string;
  stationName: string;
  orderType: OrderType;
  tableName: string | null;
  tokenNo: number | null;
  guests: number | null;
  waiterName: string;
  createdAt: string;
  lines: {
    id: string;
    itemName: string;
    variantName: string;
    quantity: number;
    addons: string[];
    comboComponents: { itemName: string; variantName: string; quantity: number }[];
    note: string | null;
  }[];
}
