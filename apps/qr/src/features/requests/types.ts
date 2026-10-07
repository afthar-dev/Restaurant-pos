/** An order this phone sent, with the staff decision (mirrors myRequests in the API). */
export interface OrderRequest {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  message: string;
  lines: {
    itemName: string;
    variantName: string;
    addons: string[];
    quantity: number;
    note: string | null;
    amount: number;
  }[];
  note: string | null;
  total: number;
  createdAt: string;
}
