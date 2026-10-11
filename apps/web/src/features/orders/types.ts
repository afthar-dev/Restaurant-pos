import type {
  BillStatus,
  KotStatus,
  KotType,
  OrderItemStatus,
  OrderStatus,
  OrderType,
} from '@rpos/shared';

export interface FloorTableStatus {
  id: string;
  name: string;
  seats: number;
  order: {
    orderId: string;
    status: OrderStatus;
    guests: number | null;
    itemCount: number;
    subtotal: number;
    openedAt: string;
    /** Set when this table was merged into the order of another table (its name). */
    mergedInto?: string;
  } | null;
}

export interface FloorAreaStatus {
  id: string;
  name: string;
  sortOrder: number;
  tables: FloorTableStatus[];
}

export interface ActiveOrder {
  id: string;
  type: OrderType;
  status: OrderStatus;
  tableId: string | null;
  tableName: string | null;
  tokenNo: number | null;
  customerName: string | null;
  guests: number | null;
  itemCount: number;
  subtotal: number;
  createdAt: string;
  /** Kitchen tickets still open: waiting or cooking, and ready to serve. */
  kitchen: { cooking: number; ready: number };
}

export interface OrderLine {
  id: string;
  itemId: string;
  variantId: string;
  itemName: string;
  variantName: string;
  unitPrice: number;
  packagingCharge: number;
  quantity: number;
  addons: { id: string; name: string; price: number }[];
  comboComponents: { itemName: string; variantName: string; quantity: number }[];
  note: string | null;
  status: OrderItemStatus;
  kotId: string | null;
  cancelReason: string | null;
  stationId: string;
  createdAt: string;
  lineTotal: number;
  /** Quantity already on a non-void bill. */
  billedQuantity: number;
}

/** Whether the KOT reached paper: NONE when no printer covers its station. */
export type KotPrintState = 'NONE' | 'WAITING' | 'PRINTED' | 'FAILED';

export interface OrderKot {
  id: string;
  kotNo: number;
  type: KotType;
  status: KotStatus;
  stationId: string;
  stationName: string;
  createdAt: string;
  print: KotPrintState;
}

export interface OrderBillSummary {
  id: string;
  billNo: number;
  status: BillStatus;
  total: number;
  paid: number;
}

export interface Order {
  id: string;
  type: OrderType;
  source: 'POS' | 'CAPTAIN' | 'QR';
  status: OrderStatus;
  table: { id: string; name: string } | null;
  tokenNo: number | null;
  guests: number | null;
  customerName: string | null;
  waiter: { id: string; name: string } | null;
  version: number;
  cancelReason: string | null;
  createdAt: string;
  items: OrderLine[];
  kots: OrderKot[];
  bills: OrderBillSummary[];
  mergedTables: { id: string; name: string }[];
  /** Requests from the table QR waiting for staff. */
  qrPending: QrRequest[];
  subtotal: number;
}

/** "T4" or "Parcel #12". */
export function orderLabel(order: {
  table?: { name: string } | null;
  tableName?: string | null;
  tokenNo: number | null;
}) {
  const table = order.table?.name ?? order.tableName;
  return table ? table : `Parcel #${order.tokenNo ?? '?'}`;
}

/** A customer's request from the table QR, waiting for staff (mirrors pendingView() in the API). */
export interface QrRequest {
  id: string;
  orderId: string;
  tableName: string | null;
  createdAt: string;
  lines: {
    variantId: string;
    addonIds: string[];
    quantity: number;
    note: string | null;
    itemName: string;
    variantName: string;
    addons: string[];
    amount: number;
  }[];
  note: string | null;
  total: number;
  /** Why it cannot be approved: its order already has a printed bill. */
  blocked: 'BILL_PRINTED' | null;
}

/** A dish to add, as the picker and the QR approval send it. */
export interface NewLine {
  variantId: string;
  quantity: number;
  addonIds: string[];
  note?: string;
}

/** Approve as the customer sent it (`{}`) or with edited lines. */
export interface QrApproval {
  lines?: NewLine[];
}
