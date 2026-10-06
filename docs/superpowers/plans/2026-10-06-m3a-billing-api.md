# M3a Billing and Day Close API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Server side of billing: GST bills from orders (full or split by items), discounts with the cashier cap, payments (cash/UPI/card, split equally), void, move/merge tables, bill print jobs, and the business-day close with cash tally, report and owner reopen.

**Architecture:** A new `billing` Nest module owns bills, bill items and payments. All totals come from one pure function (`bill-calc.ts`, unit-tested to every branch) fed by the order-item snapshots. Every bill operation runs inside `OrdersService.mutate` so the order row lock serialises bills, payments and order edits; bills also carry their own `version` for `If-Match`. The business day gets a share/update lock pair so close cannot race order or bill creation.

**Tech Stack:** NestJS 11, Prisma 6 (Postgres 16), Zod 4 (`@rpos/shared`), Jest + supertest e2e against `rpos_test`.

**Spec:** `docs/superpowers/specs/2026-10-03-restaurant-pos-prd-design.md` (§4.2–4.5, §5.1, §5.2, §5.4, §5.5, §5.6, §6.1, §6.3, §7)

## Global Constraints

- Money is integer paise; tax rates and percentage discounts are basis points (2.5% = 250, 10% = 1000).
- `total = taxable + cgst + sgst, rounded to nearest rupee; difference stored as round_off` (§4.5).
- `cgst, sgst = Σ line_taxable × line's rate_bp / 10000, rounded to paise per line (0 when outlet tax scheme is COMPOSITION or NONE)` (§4.5).
- Composition scheme: document titled "Bill of Supply", no tax lines (§4.5).
- Bill numbers are gap-free per financial year (April–March, Asia/Kolkata), from `counters` inside the creating transaction (§4.4 rule 4).
- Bills are never deleted, only voided; a void keeps the number (§4.1, §4.3).
- `Split equally` is one bill with N payments; `Split by items` is several bills from one order (§4.4 rule 3).
- Totals and taxes are computed only on the server; clients send ids and quantities (§6.4).
- Idempotency key on Add payment (§7). Optimistic locking on orders and bills; conflicts return `409 ORDER_CHANGED` / `409 BILL_CHANGED` (§7).
- Error shape `{ code, message, ...details }` via `ApiError`.
- Close day is blocked while any order is open or any bill is unpaid; expected cash = opening + cash payments − cash expenses (§5.5). Expenses arrive in M5, so cash expenses are 0 here.
- Audit (same transaction): bill void, discount, day close, day reopen (§6.3).
- Permissions (`packages/shared/src/auth.ts`, already defined): `bill.print`, `payment.take`, `discount.apply`, `discount.unlimited`, `bill.void`, `table.manage`, `day.openClose`, `day.reopen`, `reports.dayClose`.

## Review Focus

1. **Split equally with paise that do not divide** (₹100.00 in 3) — the three payments must add up to the total exactly and the last one marks the bill paid. → Task 1 (`splitEqually`) and Task 5 e2e.
2. **Two counters paying the same bill at once** — combined payments must never exceed the total; the second gets `409 OVERPAYMENT`, not a second "paid". → Task 5 e2e (parallel requests).
3. **Voiding a paid bill after a new party sat at that table** — refused with `409 TABLE_BUSY`; the old order is not reopened onto an occupied table. → Task 6 e2e.
4. **Closing the day while someone creates an order** — the order either exists before the close (and blocks it) or gets `DAY_NOT_OPEN`; no order or bill may land on a closed day. → Task 9 e2e (parallel close + create).
5. **Discounts larger than the bill** (flat ₹500 on a ₹200 bill, 150%) — clamped so no line or total goes negative; a cashier above the cap gets `403 DISCOUNT_OVER_LIMIT` and can retry with a manager override. → Task 2 unit tests and Task 4 e2e.

---

## File map

| File | Responsibility |
|---|---|
| `packages/shared/src/billing.ts` (+ `.test.ts`) | Billing enums, request schemas, `splitEqually` |
| `packages/shared/src/schemas.ts` | `billPackagingCharge` outlet setting |
| `apps/api/prisma/schema.prisma` + migration `20261006120000_billing` | Bill, BillItem, Payment, day-close columns, `orders.merged_into_id`, `outlets.bill_packaging_charge` |
| `apps/api/src/billing/bill-calc.ts` (+ `.spec.ts`) | Pure bill maths (§4.5) |
| `apps/api/src/billing/financial-year.ts` (+ `.spec.ts`) | `financialYear(date)` in IST |
| `apps/api/src/billing/bill.views.ts` | `BILL_INCLUDE`, `billView()` |
| `apps/api/src/billing/bills.service.ts` | create, get, list, discount, void, reprint |
| `apps/api/src/billing/payments.service.ts` | add payment, settle bill and order |
| `apps/api/src/billing/bills.controller.ts` | HTTP routes |
| `apps/api/src/billing/billing.module.ts` | Module wiring |
| `apps/api/src/auth/override.service.ts` | Manager override verification shared by guard and services |
| `apps/api/src/orders/table-moves.service.ts` | Move and merge |
| `apps/api/src/business-day/day-close.service.ts` | Close check, close, reopen, list, report |
| `apps/api/src/print/print.service.ts` | Bill print jobs |
| `apps/api/test/billing.e2e-spec.ts`, `payments.e2e-spec.ts`, `table-moves.e2e-spec.ts`, `day-close.e2e-spec.ts`, `test/billing-helpers.ts` | E2E |

---

### Task 1: Billing schema, shared contracts and the bill packaging setting

**Files:**
- Create: `packages/shared/src/billing.ts`, `packages/shared/src/billing.test.ts`, `apps/api/prisma/migrations/20261006120000_billing/migration.sql`
- Modify: `packages/shared/src/index.ts`, `packages/shared/src/schemas.ts`, `packages/shared/src/schemas.test.ts`, `apps/api/prisma/schema.prisma`, `apps/api/src/outlet/outlet.service.ts`, `apps/api/test/outlet.e2e-spec.ts`

**Interfaces:**
- Produces (shared): `PAYMENT_MODES`, `PaymentMode`, `BILL_STATUSES`, `BillStatus`, `DISCOUNT_KINDS`, `DiscountKind`, `discountSchema`/`Discount`, `createBillSchema`/`CreateBillRequest`, `billDiscountSchema`/`BillDiscountRequest`, `addPaymentSchema`/`AddPaymentRequest`, `voidBillSchema`/`VoidBillRequest`, `moveOrderSchema`/`MoveOrderRequest`, `mergeOrderSchema`/`MergeOrderRequest`, `closeDaySchema`/`CloseDayRequest`, `splitEqually(total: number, parts: number): number[]`.
- Produces (Prisma): models `Bill`, `BillItem`, `Payment`; enums `BillStatus`, `PaymentMode`, `DiscountKind`; `Order.mergedIntoId`; `BusinessDay.{expectedCash,countedCash,variance,closeNote,closedById(exists)}`; `Outlet.billPackagingCharge`.

- [ ] **Step 1: Write the failing shared tests** (`packages/shared/src/billing.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import {
  addPaymentSchema,
  billDiscountSchema,
  closeDaySchema,
  createBillSchema,
  discountSchema,
  splitEqually,
} from './billing';

const ID = '00000000-0000-4000-8000-000000000001';

describe('splitEqually', () => {
  it('gives the spare paise to the first parts so the parts add up', () => {
    expect(splitEqually(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(splitEqually(10001, 2)).toEqual([5001, 5000]);
    expect(splitEqually(900, 3)).toEqual([300, 300, 300]);
  });
  it('refuses nonsense splits', () => {
    expect(() => splitEqually(100, 0)).toThrow();
    expect(() => splitEqually(100, 21)).toThrow();
    expect(() => splitEqually(2, 3)).toThrow();
  });
});

describe('discountSchema', () => {
  it('takes a flat amount in paise or a percentage in basis points', () => {
    expect(discountSchema.parse({ kind: 'FLAT', value: 5000 })).toEqual({ kind: 'FLAT', value: 5000 });
    expect(discountSchema.parse({ kind: 'PERCENT', value: 1000 }).value).toBe(1000);
  });
  it('refuses more than 100%', () => {
    expect(discountSchema.safeParse({ kind: 'PERCENT', value: 10001 }).success).toBe(false);
  });
});

describe('request schemas', () => {
  it('bills everything when no lines are given, or chosen lines with quantities', () => {
    expect(createBillSchema.parse({})).toEqual({});
    expect(createBillSchema.parse({ lines: [{ orderItemId: ID, quantity: 2 }] }).lines).toHaveLength(1);
    expect(createBillSchema.safeParse({ lines: [] }).success).toBe(false);
  });
  it('needs a payment amount above zero and a known mode', () => {
    expect(addPaymentSchema.safeParse({ mode: 'CASH', amount: 0 }).success).toBe(false);
    expect(addPaymentSchema.safeParse({ mode: 'CHEQUE', amount: 100 }).success).toBe(false);
    expect(addPaymentSchema.parse({ mode: 'UPI', amount: 100, reference: ' 1234 ' }).reference).toBe('1234');
  });
  it('sets bill and item discounts together', () => {
    const parsed = billDiscountSchema.parse({ bill: { kind: 'PERCENT', value: 500 }, reason: 'Regular' });
    expect(parsed.items).toEqual([]);
  });
  it('needs counted cash to close the day', () => {
    expect(closeDaySchema.safeParse({}).success).toBe(false);
    expect(closeDaySchema.parse({ countedCash: 150000 })).toEqual({ countedCash: 150000 });
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter @rpos/shared test` → FAIL (`Cannot find module './billing'`).

- [ ] **Step 3: Implement `packages/shared/src/billing.ts`**

```ts
import { z } from 'zod';
import { priceSchema } from './menu';

export const PAYMENT_MODES = ['CASH', 'UPI', 'CARD'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const BILL_STATUSES = ['OPEN', 'PAID', 'VOID'] as const;
export type BillStatus = (typeof BILL_STATUSES)[number];

export const DISCOUNT_KINDS = ['FLAT', 'PERCENT'] as const;
export type DiscountKind = (typeof DISCOUNT_KINDS)[number];

/** FLAT: paise. PERCENT: basis points (1000 = 10%). */
export const discountSchema = z
  .strictObject({ kind: z.enum(DISCOUNT_KINDS), value: z.number().int().min(0).max(100_000_00) })
  .refine((d) => d.kind === 'FLAT' || d.value <= 10000, {
    message: 'A discount cannot be more than 100%',
    path: ['value'],
  });
export type Discount = z.infer<typeof discountSchema>;

const reasonSchema = z.string().trim().min(3, 'Give a short reason').max(140);

export const createBillSchema = z.strictObject({
  /** Omit to bill everything not yet billed. */
  lines: z
    .array(z.strictObject({ orderItemId: z.uuid(), quantity: z.number().int().min(1).max(99) }))
    .min(1, 'Choose at least one dish')
    .max(200)
    .optional(),
});
export type CreateBillRequest = z.infer<typeof createBillSchema>;

export const billDiscountSchema = z.strictObject({
  bill: discountSchema.nullable().optional(),
  items: z
    .array(z.strictObject({ billItemId: z.uuid(), discount: discountSchema.nullable() }))
    .max(200)
    .default([]),
  /** Required (server-checked) whenever any discount is above zero. */
  reason: z.string().trim().max(140).optional(),
});
export type BillDiscountRequest = z.infer<typeof billDiscountSchema>;

export const addPaymentSchema = z.strictObject({
  mode: z.enum(PAYMENT_MODES),
  amount: priceSchema.refine((v) => v > 0, 'Enter an amount'),
  /** Cash handed over; change = tendered − amount. Cash only. */
  tendered: priceSchema.optional(),
  /** UPI / card reference, optional. */
  reference: z.string().trim().max(60).optional(),
});
export type AddPaymentRequest = z.infer<typeof addPaymentSchema>;

export const voidBillSchema = z.strictObject({ reason: reasonSchema });
export type VoidBillRequest = z.infer<typeof voidBillSchema>;

export const moveOrderSchema = z.strictObject({ tableId: z.uuid() });
export type MoveOrderRequest = z.infer<typeof moveOrderSchema>;

export const mergeOrderSchema = z.strictObject({ fromOrderId: z.uuid() });
export type MergeOrderRequest = z.infer<typeof mergeOrderSchema>;

export const closeDaySchema = z.strictObject({
  countedCash: priceSchema,
  note: z.string().trim().max(200).optional(),
});
export type CloseDayRequest = z.infer<typeof closeDaySchema>;

/** Equal shares of `total` paise for N payers; the first parts carry the spare paise. */
export function splitEqually(total: number, parts: number): number[] {
  if (!Number.isInteger(parts) || parts < 2 || parts > 20) {
    throw new Error('Split between 2 and 20 people');
  }
  if (total < parts) throw new Error('The amount is too small to split');
  const base = Math.floor(total / parts);
  const spare = total - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < spare ? 1 : 0));
}
```

Note: `splitEqually(100, 0)` must throw; the `parts < 2` check covers it. Export from `index.ts`: `export * from './billing';`. Check `priceSchema` in `menu.ts` is an integer paise schema ≥ 0 (it is, line 38); if its max is lower than ₹1,00,000, keep it — bills above that are not expected.

- [ ] **Step 4: Bill packaging setting.** In `schemas.ts` `outletSettingsSchema` add `billPackagingCharge: priceSchema.optional(),` (import `priceSchema` from `./menu` if not already). Add a schema test: `outletSettingsSchema.parse({ billPackagingCharge: 1000 })` keeps the value; `-1` fails.

- [ ] **Step 5: Run** `pnpm --filter @rpos/shared test` → PASS.

- [ ] **Step 6: Prisma schema.** Add to `schema.prisma`:

```prisma
enum BillStatus {
  OPEN
  PAID
  VOID
}

enum PaymentMode {
  CASH
  UPI
  CARD
}

enum DiscountKind {
  FLAT
  PERCENT
}

/// One printed bill. Amounts are paise and are written only by bill-calc.ts.
model Bill {
  id                String        @id @default(uuid()) @db.Uuid
  outletId          String        @map("outlet_id") @db.Uuid
  businessDayId     String        @map("business_day_id") @db.Uuid
  orderId           String        @map("order_id") @db.Uuid
  billNo            Int           @map("bill_no")
  financialYear     String        @map("financial_year")
  status            BillStatus    @default(OPEN)
  taxScheme         TaxScheme     @map("tax_scheme")
  grossSubtotal     Int           @map("gross_subtotal")
  itemDiscount      Int           @map("item_discount")
  subtotal          Int
  discountKind      DiscountKind? @map("discount_kind")
  discountValue     Int?          @map("discount_value")
  billDiscount      Int           @default(0) @map("bill_discount")
  discountReason    String?       @map("discount_reason")
  discountById      String?       @map("discount_by_id") @db.Uuid
  /// Bill-level packaging (outlet setting, first parcel bill of an order).
  billPackaging     Int           @default(0) @map("bill_packaging")
  packaging         Int
  taxable           Int
  cgst              Int
  sgst              Int
  roundOff          Int           @map("round_off")
  total             Int
  paidAt            DateTime?     @map("paid_at") @db.Timestamptz(3)
  voidReason        String?       @map("void_reason")
  voidedById        String?       @map("voided_by_id") @db.Uuid
  voidedAt          DateTime?     @map("voided_at") @db.Timestamptz(3)
  createdById       String        @map("created_by_id") @db.Uuid
  version           Int           @default(0)
  createdAt         DateTime      @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt         DateTime      @updatedAt @map("updated_at") @db.Timestamptz(3)

  outlet      Outlet      @relation(fields: [outletId], references: [id])
  businessDay BusinessDay @relation(fields: [businessDayId], references: [id])
  order       Order       @relation(fields: [orderId], references: [id])
  createdBy   User        @relation("BillCreatedBy", fields: [createdById], references: [id])
  items       BillItem[]
  payments    Payment[]

  @@unique([outletId, financialYear, billNo])
  @@index([orderId])
  @@index([businessDayId, status])
  @@map("bills")
}

model BillItem {
  id                String        @id @default(uuid()) @db.Uuid
  billId            String        @map("bill_id") @db.Uuid
  orderItemId       String        @map("order_item_id") @db.Uuid
  itemName          String        @map("item_name")
  variantName       String        @map("variant_name")
  /// [{id, name, price}] copied from the order item.
  addons            Json          @default("[]")
  /// Per unit, add-ons included.
  unitPrice         Int           @map("unit_price")
  quantity          Int
  packagingPerUnit  Int           @map("packaging_per_unit")
  cgstBp            Int           @map("cgst_bp")
  sgstBp            Int           @map("sgst_bp")
  discountKind      DiscountKind? @map("discount_kind")
  discountValue     Int?          @map("discount_value")
  gross             Int
  itemDiscount      Int           @map("item_discount")
  lineTotal         Int           @map("line_total")
  billDiscountShare Int           @map("bill_discount_share")
  packaging         Int
  taxable           Int
  cgst              Int
  sgst              Int
  sortOrder         Int           @map("sort_order")
  createdAt         DateTime      @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt         DateTime      @updatedAt @map("updated_at") @db.Timestamptz(3)

  bill      Bill      @relation(fields: [billId], references: [id])
  orderItem OrderItem @relation(fields: [orderItemId], references: [id])

  @@index([billId])
  @@index([orderItemId])
  @@map("bill_items")
}

model Payment {
  id            String      @id @default(uuid()) @db.Uuid
  outletId      String      @map("outlet_id") @db.Uuid
  billId        String      @map("bill_id") @db.Uuid
  businessDayId String      @map("business_day_id") @db.Uuid
  mode          PaymentMode
  amount        Int
  tendered      Int?
  change        Int?
  reference     String?
  receivedById  String      @map("received_by_id") @db.Uuid
  createdAt     DateTime    @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt     DateTime    @updatedAt @map("updated_at") @db.Timestamptz(3)

  bill        Bill        @relation(fields: [billId], references: [id])
  businessDay BusinessDay @relation(fields: [businessDayId], references: [id])
  receivedBy  User        @relation("PaymentReceivedBy", fields: [receivedById], references: [id])

  @@index([billId])
  @@index([businessDayId, mode])
  @@map("payments")
}
```

Also: `Outlet` gets `billPackagingCharge Int @default(0) @map("bill_packaging_charge")` and relation `bills Bill[]`; `BusinessDay` gets `expectedCash Int? @map("expected_cash")`, `countedCash Int? @map("counted_cash")`, `variance Int?`, `closeNote String? @map("close_note")`, relations `bills Bill[]`, `payments Payment[]`, and `closedBy User? @relation("DayClosedBy", fields: [closedById], references: [id])`; `Order` gets `mergedIntoId String? @map("merged_into_id") @db.Uuid`, `mergedInto Order? @relation("OrderMerge", fields: [mergedIntoId], references: [id])`, `mergedFrom Order[] @relation("OrderMerge")`, `bills Bill[]`, `@@index([mergedIntoId])`; `OrderItem` gets `billItems BillItem[]`; `User` gets `billsCreated Bill[] @relation("BillCreatedBy")`, `paymentsReceived Payment[] @relation("PaymentReceivedBy")`, `daysClosed BusinessDay[] @relation("DayClosedBy")`.

- [ ] **Step 7: Migration.** Generate the SQL without touching the dev data, then save it:

```bash
cd apps/api
MSYS_NO_PATHCONV=1 docker exec rpos-dev-postgres-1 psql -U rpos -d postgres -c "CREATE DATABASE rpos_shadow_tmp"
pnpm exec prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url postgresql://rpos:rpos@localhost:5433/rpos_shadow_tmp --script \
  > prisma/migrations/20261006120000_billing/migration.sql
MSYS_NO_PATHCONV=1 docker exec rpos-dev-postgres-1 psql -U rpos -d postgres -c "DROP DATABASE rpos_shadow_tmp"
pnpm exec prisma migrate deploy && pnpm exec prisma generate
```

Read the generated SQL: it must only CREATE/ALTER ADD (no DROP). Re-run the diff afterwards; it must print `-- This is an empty migration.`

- [ ] **Step 8: Outlet setting in the API.** `outlet.service.ts` `toSettings` adds `billPackagingCharge: outlet.billPackagingCharge`. In `test/outlet.e2e-spec.ts` add: owner PUTs `{ billPackagingCharge: 1000 }` → 200 and GET returns `billPackagingCharge: 1000`.

- [ ] **Step 9: Run** `pnpm --filter @rpos/api typecheck && pnpm --filter @rpos/api test:e2e -- outlet` → PASS. `pnpm --filter @rpos/web typecheck` still passes.

- [ ] **Step 10: Commit** `feat(billing): add bill, payment and day-close schema with shared contracts`.

---

### Task 2: Bill calculation

**Files:**
- Create: `apps/api/src/billing/bill-calc.ts`, `apps/api/src/billing/bill-calc.spec.ts`, `apps/api/src/billing/financial-year.ts`, `apps/api/src/billing/financial-year.spec.ts`

**Interfaces:**
- Produces:
```ts
export type TaxScheme = 'REGULAR' | 'COMPOSITION' | 'NONE';
export interface CalcDiscount { kind: 'FLAT' | 'PERCENT'; value: number }
export interface CalcLine { unitPrice: number; quantity: number; packagingPerUnit: number; cgstBp: number; sgstBp: number; discount: CalcDiscount | null }
export interface CalcInput { lines: CalcLine[]; billDiscount: CalcDiscount | null; billPackaging: number; taxScheme: TaxScheme }
export interface CalcLineResult { gross: number; itemDiscount: number; lineTotal: number; billDiscountShare: number; packaging: number; taxable: number; cgst: number; sgst: number }
export interface TaxBreakupRow { cgstBp: number; sgstBp: number; taxable: number; cgst: number; sgst: number }
export interface CalcResult { lines: CalcLineResult[]; grossSubtotal: number; itemDiscount: number; subtotal: number; billDiscount: number; packaging: number; taxable: number; cgst: number; sgst: number; roundOff: number; total: number; taxBreakup: TaxBreakupRow[] }
export function discountOn(base: number, discount: CalcDiscount | null): number;
export function allocate(amount: number, weights: number[]): number[];
export function calculateBill(input: CalcInput): CalcResult;
export function financialYear(at: Date): string; // '2026-27'
```

- [ ] **Step 1: Write the failing tests** (`bill-calc.spec.ts`)

```ts
import { allocate, calculateBill, discountOn, type CalcLine } from './bill-calc';

const gst5 = { cgstBp: 250, sgstBp: 250 };
const line = (unitPrice: number, quantity = 1, extra: Partial<CalcLine> = {}): CalcLine => ({
  unitPrice,
  quantity,
  packagingPerUnit: 0,
  discount: null,
  ...gst5,
  ...extra,
});
const bill = (lines: CalcLine[], extra = {}) =>
  calculateBill({ lines, billDiscount: null, billPackaging: 0, taxScheme: 'REGULAR', ...extra });

describe('discountOn', () => {
  it('takes flat paise or basis points, never more than the base', () => {
    expect(discountOn(20000, null)).toBe(0);
    expect(discountOn(20000, { kind: 'FLAT', value: 5000 })).toBe(5000);
    expect(discountOn(20000, { kind: 'FLAT', value: 50000 })).toBe(20000);
    expect(discountOn(20000, { kind: 'PERCENT', value: 1000 })).toBe(2000);
    expect(discountOn(333, { kind: 'PERCENT', value: 5000 })).toBe(167); // 166.5 rounds half up
    expect(discountOn(20000, { kind: 'PERCENT', value: 15000 })).toBe(20000);
  });
});

describe('allocate', () => {
  it('splits by weight and always adds up exactly', () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(1000, [30000, 10000])).toEqual([750, 250]);
    expect(allocate(0, [5, 5])).toEqual([0, 0]);
    expect(allocate(10, [0, 0])).toEqual([5, 5]);
    const shares = allocate(9999, [12345, 6789, 1]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(9999);
  });
});

describe('calculateBill', () => {
  it('adds 2.5% CGST and SGST per line and rounds the total to the rupee', () => {
    // 2 × ₹180 + 1 × ₹30 = ₹390; tax 2.5% each = ₹9.75 + ₹9.75; ₹409.50 → ₹410, round off +₹0.50
    const r = bill([line(18000, 2), line(3000)]);
    expect(r.subtotal).toBe(39000);
    expect(r.cgst).toBe(975);
    expect(r.sgst).toBe(975);
    expect(r.taxable).toBe(39000);
    expect(r.total).toBe(41000);
    expect(r.roundOff).toBe(50);
  });

  it('rounds tax to paise per line, not on the bill total', () => {
    // each ₹10.10 line: 2.5% = 25.25 paise → 25 per line, not 75.75 → 76 for three
    const r = bill([line(1010), line(1010), line(1010)]);
    expect(r.cgst).toBe(75);
  });

  it('rounds the total down when the paise are under 50', () => {
    const r = bill([line(10010)]); // 100.10 + 2.50 + 2.50 = 105.10 → 105
    expect(r.total).toBe(10500);
    expect(r.roundOff).toBe(-10);
  });

  it('takes item discounts before the bill discount and spreads the bill discount by line', () => {
    const r = bill([line(30000, 1, { discount: { kind: 'FLAT', value: 10000 } }), line(10000)], {
      billDiscount: { kind: 'PERCENT', value: 1000 },
    });
    expect(r.grossSubtotal).toBe(40000);
    expect(r.itemDiscount).toBe(10000);
    expect(r.subtotal).toBe(30000);
    expect(r.billDiscount).toBe(3000);
    expect(r.lines.map((l) => l.billDiscountShare)).toEqual([2000, 1000]);
    expect(r.taxable).toBe(27000);
    expect(r.lines.map((l) => l.taxable)).toEqual([18000, 9000]);
  });

  it('clamps a discount bigger than the bill to zero, never negative', () => {
    const r = bill([line(20000)], { billDiscount: { kind: 'FLAT', value: 50000 } });
    expect(r.billDiscount).toBe(20000);
    expect(r.taxable).toBe(0);
    expect(r.total).toBe(0);
  });

  it('adds parcel packaging per unit plus bill packaging, and taxes it with the line', () => {
    const r = bill([line(33000, 2, { packagingPerUnit: 1000 }), line(3000)], { billPackaging: 1000 });
    expect(r.packaging).toBe(3000);
    expect(r.lines.map((l) => l.packaging)).toEqual([2000 + 957, 43]);
    expect(r.taxable).toBe(69000 + 3000);
  });

  it('charges no tax under the composition scheme or without GST', () => {
    for (const taxScheme of ['COMPOSITION', 'NONE'] as const) {
      const r = bill([line(18000, 2)], { taxScheme });
      expect(r.cgst + r.sgst).toBe(0);
      expect(r.total).toBe(36000);
      expect(r.taxBreakup).toEqual([]);
    }
  });

  it('groups tax by rate for the bill footer', () => {
    const r = bill([line(10000), line(10000, 1, { cgstBp: 900, sgstBp: 900 }), line(20000)]);
    expect(r.taxBreakup).toEqual([
      { cgstBp: 250, sgstBp: 250, taxable: 30000, cgst: 750, sgst: 750 },
      { cgstBp: 900, sgstBp: 900, taxable: 10000, cgst: 900, sgst: 900 },
    ]);
  });

  it('refuses an empty bill', () => {
    expect(() => bill([])).toThrow('A bill needs at least one line');
  });
});
```

Packaging check for the test above: `allocate(1000, [66000, 3000])` → exact 956.52 / 43.48 → floors 956/43, one spare paise to the larger remainder (0.52) → `[957, 43]`.

`financial-year.spec.ts`:

```ts
import { financialYear } from './financial-year';

describe('financialYear', () => {
  it('runs April to March in India time', () => {
    expect(financialYear(new Date('2026-04-01T00:00:00+05:30'))).toBe('2026-27');
    expect(financialYear(new Date('2026-03-31T23:59:59+05:30'))).toBe('2025-26');
    // 31 March 19:00 UTC is already 1 April in India
    expect(financialYear(new Date('2027-03-31T19:00:00Z'))).toBe('2027-28');
    expect(financialYear(new Date('2099-12-31T00:00:00+05:30'))).toBe('2099-00');
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter @rpos/api test -- bill-calc financial-year` → FAIL (modules missing).

- [ ] **Step 3: Implement `bill-calc.ts`**

```ts
/**
 * Bill maths from spec §4.5. Pure and integer-only (paise, basis points) so every total on a
 * printed bill can be recomputed exactly. Rounding is half-up; amounts here are never negative.
 */
export type TaxScheme = 'REGULAR' | 'COMPOSITION' | 'NONE';
export interface CalcDiscount { kind: 'FLAT' | 'PERCENT'; value: number }
// ...interfaces exactly as in Interfaces above...

const bpOf = (amount: number, bp: number) => Math.round((amount * bp) / 10000);

export function discountOn(base: number, discount: CalcDiscount | null): number {
  if (!discount) return 0;
  const raw = discount.kind === 'FLAT' ? discount.value : bpOf(base, discount.value);
  return Math.min(base, Math.max(0, raw));
}

/** Splits `amount` in proportion to `weights` (equally when all are 0); the parts add up exactly. */
export function allocate(amount: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const sum = weights.reduce((a, b) => a + b, 0);
  const basis = sum === 0 ? weights.map(() => 1) : weights;
  const total = sum === 0 ? weights.length : sum;
  const exact = basis.map((w) => (amount * w) / total);
  const parts = exact.map(Math.floor);
  let spare = amount - parts.reduce((a, b) => a + b, 0);
  const byRemainder = exact
    .map((e, i) => ({ i, rest: e - parts[i]! }))
    .sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (const { i } of byRemainder) {
    if (spare === 0) break;
    parts[i]! += 1;
    spare -= 1;
  }
  return parts;
}

export function calculateBill(input: CalcInput): CalcResult {
  if (input.lines.length === 0) throw new Error('A bill needs at least one line');
  const base = input.lines.map((l) => {
    const gross = l.unitPrice * l.quantity;
    const itemDiscount = discountOn(gross, l.discount);
    return { gross, itemDiscount, lineTotal: gross - itemDiscount, ownPackaging: l.packagingPerUnit * l.quantity };
  });
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
  const grossSubtotal = sum(base.map((b) => b.gross));
  const itemDiscount = sum(base.map((b) => b.itemDiscount));
  const subtotal = sum(base.map((b) => b.lineTotal));
  const billDiscount = discountOn(subtotal, input.billDiscount);
  const weights = base.map((b) => b.lineTotal);
  const discountShares = allocate(billDiscount, weights);
  const packagingShares = allocate(input.billPackaging, weights);
  const taxed = input.taxScheme === 'REGULAR';

  const lines: CalcLineResult[] = base.map((b, i) => {
    const source = input.lines[i]!;
    const packaging = b.ownPackaging + packagingShares[i]!;
    const taxable = b.lineTotal - discountShares[i]! + packaging;
    return {
      gross: b.gross,
      itemDiscount: b.itemDiscount,
      lineTotal: b.lineTotal,
      billDiscountShare: discountShares[i]!,
      packaging,
      taxable,
      cgst: taxed ? bpOf(taxable, source.cgstBp) : 0,
      sgst: taxed ? bpOf(taxable, source.sgstBp) : 0,
    };
  });

  const packaging = sum(lines.map((l) => l.packaging));
  const taxable = sum(lines.map((l) => l.taxable));
  const cgst = sum(lines.map((l) => l.cgst));
  const sgst = sum(lines.map((l) => l.sgst));
  const raw = taxable + cgst + sgst;
  const total = Math.round(raw / 100) * 100;

  const groups = new Map<string, TaxBreakupRow>();
  if (taxed) {
    lines.forEach((l, i) => {
      const { cgstBp, sgstBp } = input.lines[i]!;
      const key = `${cgstBp}/${sgstBp}`;
      const row = groups.get(key) ?? { cgstBp, sgstBp, taxable: 0, cgst: 0, sgst: 0 };
      row.taxable += l.taxable;
      row.cgst += l.cgst;
      row.sgst += l.sgst;
      groups.set(key, row);
    });
  }
  const taxBreakup = [...groups.values()].sort((a, b) => a.cgstBp + a.sgstBp - (b.cgstBp + b.sgstBp));

  return { lines, grossSubtotal, itemDiscount, subtotal, billDiscount, packaging, taxable, cgst, sgst, roundOff: total - raw, total, taxBreakup };
}
```

`financial-year.ts`:

```ts
const IST_OFFSET_MS = 330 * 60_000;

/** Indian financial year (April–March) for a moment, judged in India time: "2026-27". */
export function financialYear(at: Date): string {
  const ist = new Date(at.getTime() + IST_OFFSET_MS);
  const year = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}
```

- [ ] **Step 4: Run** the two spec files → PASS. Then `pnpm --filter @rpos/api exec jest --coverage --collectCoverageFrom=src/billing/bill-calc.ts src/billing` and confirm 100% branches for `bill-calc.ts` (spec §8). Add a test for any branch the report shows uncovered.

- [ ] **Step 5: Commit** `feat(billing): add GST bill calculation and financial year`.

---

### Task 3: Create and read bills (full or split by items)

**Files:**
- Create: `apps/api/src/billing/bill.views.ts`, `apps/api/src/billing/bills.service.ts`, `apps/api/src/billing/bills.controller.ts`, `apps/api/src/billing/billing.module.ts`, `apps/api/test/billing-helpers.ts`, `apps/api/test/billing.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/api/src/business-day/counters.service.ts` (doc only: `BILL` period is the FY string), `apps/api/src/orders/orders.views.ts`, `apps/api/src/orders/orders.service.ts` (export `orderChanged`, `orderNotOpen`), `apps/api/src/realtime/realtime.gateway.ts`

**Interfaces:**
- Consumes: `calculateBill`, `financialYear` (Task 2); `OrdersService.mutate(actor, orderId, ifMatch, fn)`; `CountersService.next(tx, outletId, 'BILL', fy)`; `BusinessDayService.requireOpen(tx, outletId)`.
- Produces:
  - `BillsService.create(actor: AuthUser, orderId: string, ifMatch: string | undefined, request: CreateBillRequest): Promise<BillView>`
  - `BillsService.get(outletId: string, billId: string): Promise<BillView>`
  - `BillsService.forOrder(outletId: string, orderId: string): Promise<BillView[]>`
  - `BillsService.recalculate(tx: Tx, billId: string): Promise<void>` — rewrites every amount on the bill and its items from stored inputs.
  - `BillsService.lockBill(tx, outletId, billId, ifMatch): Promise<Bill>` — bumps `bills.version` with `If-Match` → `409 BILL_CHANGED`.
  - `billView(bill)` returns:
    ```ts
    { id, billNo, financialYear, status, title: 'Tax Invoice' | 'Bill of Supply', orderId, orderType, tableName, tokenNo,
      lines: [{ id, orderItemId, itemName, variantName, addons: {name, price}[], unitPrice, quantity, gross, discount: {kind, value} | null, itemDiscount, lineTotal }],
      grossSubtotal, itemDiscount, subtotal, discount: {kind, value} | null, billDiscount, discountReason, packaging, taxable, cgst, sgst,
      taxBreakup: TaxBreakupRow[], roundOff, total, paid, due,
      payments: [{ id, mode, amount, tendered, change, reference, receivedBy: {id, name}, createdAt }],
      voidReason, version, createdAt, createdBy: {id, name} }
    ```
  - Order view gains `bills: { id, billNo, status, total, paid }[]` and each line gains `billedQuantity` (sum over non-void bills).
  - Realtime: event `bill.updated` `{ outletId, billId, orderId }` sent to the outlet room.
  - `test/billing-helpers.ts`: `servedOrder(ctx, r, staff, lines, table?)` creates an order, adds lines, sends the KOT and returns the order id; `parcelOrder(...)` the same for parcel.

Rules (encode exactly):
1. Route `POST /api/orders/:id/bills` needs `bill.print`; `GET /api/orders/:id/bills` and `GET /api/bills/:id` need `bill.print`.
2. Order must be `OPEN` or `BILLED` (`409 ORDER_NOT_OPEN` otherwise). Unsent (`NEW`) items block billing: `409 UNSENT_ITEMS` "Send the new dishes to the kitchen first." (POS sends then bills; this keeps pay-first parcels simple — ruling).
3. Billable quantity of an item = `quantity − Σ bill_items.quantity` over non-void bills, for `SENT` items only. Without `lines`, every item with billable quantity > 0 is billed in full; none left → `409 NOTHING_TO_BILL`. With `lines`: each `orderItemId` must belong to the order and be `SENT` (`400 INVALID_REFERENCE`, field `orderItemId`); quantity above billable → `409 ALREADY_BILLED`; duplicate ids → `400 VALIDATION`.
4. The bill belongs to the open business day (`requireOpen`) and gets `billNo = counters.next(tx, outletId, 'BILL', financialYear(now))`. `taxScheme` is copied from the outlet.
5. Bill packaging = outlet `billPackagingCharge` when the order is `PARCEL` and no other non-void bill on the order has `billPackaging > 0`; else 0.
6. Bill item: `unitPrice = orderItem.unitPrice + Σ addons.price`; `packagingPerUnit = orderItem.packagingCharge`; tax bp copied; `sortOrder` = position.
7. After creating, if no item has billable quantity left, order → `BILLED` (the table shows "bill printed").
8. Emits `bill.updated` and (via `mutate`) `order.updated`.

- [ ] **Step 1: Test helpers** (`test/billing-helpers.ts`)

```ts
import type { Restaurant } from './fixtures';
import type { SignedIn, TestContext } from './helpers';

export interface Line { variantId: string; quantity: number; addonIds?: string[] }

/** A dine-in order on `tableId` with `lines` sent to the kitchen. Returns the order id. */
export async function servedOrder(
  ctx: TestContext,
  r: Restaurant,
  staff: SignedIn,
  lines: Line[],
  tableId = r.t1.id,
): Promise<string> {
  const order = await ctx.http().post('/api/orders').set(staff.auth)
    .send({ type: 'DINE_IN', tableId, guests: 2 }).expect(201);
  await addAndSend(ctx, staff, order.body.id, lines);
  return order.body.id;
}

export async function parcelOrder(ctx: TestContext, staff: SignedIn, lines: Line[]): Promise<string> {
  const order = await ctx.http().post('/api/orders').set(staff.auth).send({ type: 'PARCEL' }).expect(201);
  await addAndSend(ctx, staff, order.body.id, lines);
  return order.body.id;
}

async function addAndSend(ctx: TestContext, staff: SignedIn, orderId: string, lines: Line[]) {
  await ctx.http().post(`/api/orders/${orderId}/items`).set(staff.auth)
    .send({ items: lines.map((l) => ({ addonIds: [], ...l })) }).expect(201);
  await ctx.http().post(`/api/orders/${orderId}/kot`).set(staff.auth).expect(201);
}
```

(Check the status codes against `orders.e2e-spec.ts`: adding items currently returns 201; use whatever the existing tests assert.)

- [ ] **Step 2: Write the failing e2e** (`test/billing.e2e-spec.ts`) — same `beforeAll/beforeEach` shape as `print.e2e-spec.ts` (reset DB, outlet, `buildRestaurant`, owner/cashier/waiter sign-ins, open day). Tests:

```ts
it('bills the whole order with 5% GST, numbers it and marks the order billed', async () => {
  const orderId = await servedOrder(ctx, r, waiter, [
    { variantId: r.paneer.half.id, quantity: 2, addonIds: [r.extras.cheese.id] },
    { variantId: r.roti.regular.id, quantity: 1 },
  ]);
  const res = await ctx.http().post(`/api/orders/${orderId}/bills`).set(cashier.auth).send({}).expect(201);
  // (180 + 30) × 2 + 30 = ₹450; tax ₹11.25 + ₹11.25 → ₹472.50 → ₹473
  expect(res.body).toMatchObject({
    billNo: 1, status: 'OPEN', title: 'Tax Invoice', subtotal: 45000,
    cgst: 1125, sgst: 1125, roundOff: 50, total: 47300, paid: 0, due: 47300,
  });
  expect(res.body.financialYear).toMatch(/^\d{4}-\d{2}$/);
  expect(res.body.lines[0]).toMatchObject({ itemName: 'Paneer Tikka', unitPrice: 21000, quantity: 2 });
  const order = await ctx.http().get(`/api/orders/${orderId}`).set(cashier.auth).expect(200);
  expect(order.body.status).toBe('BILLED');
  expect(order.body.bills).toEqual([{ id: res.body.id, billNo: 1, status: 'OPEN', total: 47300, paid: 0 }]);
});

it('numbers bills one after another across orders', async () => { /* two orders on T1 and T2 → billNo 1 and 2 */ });

it('splits by items into separate bills and only marks the order billed at the end', async () => {
  const orderId = await servedOrder(ctx, r, waiter, [
    { variantId: r.paneer.half.id, quantity: 2 },
    { variantId: r.roti.regular.id, quantity: 3 },
  ]);
  const order = (await ctx.http().get(`/api/orders/${orderId}`).set(cashier.auth)).body;
  const paneer = order.items.find((i: { itemName: string }) => i.itemName === 'Paneer Tikka');
  const first = await ctx.http().post(`/api/orders/${orderId}/bills`).set(cashier.auth)
    .send({ lines: [{ orderItemId: paneer.id, quantity: 1 }] }).expect(201);
  expect(first.body.subtotal).toBe(18000);
  let current = (await ctx.http().get(`/api/orders/${orderId}`).set(cashier.auth)).body;
  expect(current.status).toBe('OPEN');
  expect(current.items.find((i: { id: string }) => i.id === paneer.id).billedQuantity).toBe(1);
  await ctx.http().post(`/api/orders/${orderId}/bills`).set(cashier.auth)
    .send({ lines: [{ orderItemId: paneer.id, quantity: 2 }] }).expect(409); // only 1 left
  const rest = await ctx.http().post(`/api/orders/${orderId}/bills`).set(cashier.auth).send({}).expect(201);
  expect(rest.body.subtotal).toBe(18000 + 9000);
  current = (await ctx.http().get(`/api/orders/${orderId}`).set(cashier.auth)).body;
  expect(current.status).toBe('BILLED');
  await ctx.http().post(`/api/orders/${orderId}/bills`).set(cashier.auth).send({}).expect(409);
});

it('refuses to bill dishes that were not sent to the kitchen', async () => { /* add item, no KOT → 409 UNSENT_ITEMS */ });

it('adds parcel packaging and the bill packaging setting once per order', async () => {
  await ctx.prisma.outlet.update({ where: { id: outlet.id }, data: { billPackagingCharge: 1000 } });
  const orderId = await parcelOrder(ctx, cashier, [{ variantId: r.paneer.full.id, quantity: 2 }]);
  const res = await ctx.http().post(`/api/orders/${orderId}/bills`).set(cashier.auth).send({}).expect(201);
  // 2 × ₹330 + 2 × ₹10 + ₹10 = ₹690 taxable; 5% → ₹724.50 → ₹725
  expect(res.body).toMatchObject({ subtotal: 66000, packaging: 3000, taxable: 69000, total: 72500 });
});

it('prints a bill of supply without tax under the composition scheme', async () => {
  await ctx.prisma.outlet.update({ where: { id: outlet.id }, data: { taxScheme: 'COMPOSITION' } });
  const orderId = await servedOrder(ctx, r, waiter, [{ variantId: r.roti.regular.id, quantity: 1 }]);
  const res = await ctx.http().post(`/api/orders/${orderId}/bills`).set(cashier.auth).send({}).expect(201);
  expect(res.body).toMatchObject({ title: 'Bill of Supply', cgst: 0, sgst: 0, total: 3000, taxBreakup: [] });
});

it('does not let a waiter print a bill unless the outlet allows it', async () => {
  const orderId = await servedOrder(ctx, r, waiter, [{ variantId: r.roti.regular.id, quantity: 1 }]);
  await ctx.http().post(`/api/orders/${orderId}/bills`).set(waiter.auth).send({}).expect(403);
});

it('does not show another outlet its bills', async () => { /* bill in outlet A, owner of outlet B GET /api/bills/:id → 404 */ });
```

Fill in the three short tests with the same calls as above (they are one or two requests each).

- [ ] **Step 3: Run** `pnpm --filter @rpos/api test:e2e -- billing` → FAIL (404 on the routes).

- [ ] **Step 4: Implement.**

`bill.views.ts`:

```ts
import type { Prisma } from '@prisma/client';

export const BILL_INCLUDE = {
  items: { orderBy: { sortOrder: 'asc' } },
  payments: { orderBy: { createdAt: 'asc' }, include: { receivedBy: { select: { id: true, name: true } } } },
  order: { select: { type: true, tokenNo: true, table: { select: { name: true } } } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.BillInclude;

export type BillWithDetails = Prisma.BillGetPayload<{ include: typeof BILL_INCLUDE }>;

const discountOf = (kind: string | null, value: number | null) =>
  kind && value !== null ? { kind, value } : null;

/** Amount received on a bill (a void bill keeps its payments for the record but owes nothing). */
export const paidOn = (bill: { payments: { amount: number }[] }) =>
  bill.payments.reduce((sum, p) => sum + p.amount, 0);

export function billView(bill: BillWithDetails) {
  const paid = paidOn(bill);
  const taxBreakup = new Map<string, { cgstBp: number; sgstBp: number; taxable: number; cgst: number; sgst: number }>();
  if (bill.taxScheme === 'REGULAR') {
    for (const i of bill.items) {
      const key = `${i.cgstBp}/${i.sgstBp}`;
      const row = taxBreakup.get(key) ?? { cgstBp: i.cgstBp, sgstBp: i.sgstBp, taxable: 0, cgst: 0, sgst: 0 };
      row.taxable += i.taxable; row.cgst += i.cgst; row.sgst += i.sgst;
      taxBreakup.set(key, row);
    }
  }
  return {
    id: bill.id,
    billNo: bill.billNo,
    financialYear: bill.financialYear,
    status: bill.status,
    title: bill.taxScheme === 'REGULAR' ? 'Tax Invoice' : 'Bill of Supply',
    orderId: bill.orderId,
    orderType: bill.order.type,
    tableName: bill.order.table?.name ?? null,
    tokenNo: bill.order.tokenNo,
    lines: bill.items.map((i) => ({
      id: i.id, orderItemId: i.orderItemId, itemName: i.itemName, variantName: i.variantName,
      addons: (i.addons as { name: string; price: number }[]).map((a) => ({ name: a.name, price: a.price })),
      unitPrice: i.unitPrice, quantity: i.quantity, gross: i.gross,
      discount: discountOf(i.discountKind, i.discountValue), itemDiscount: i.itemDiscount, lineTotal: i.lineTotal,
    })),
    grossSubtotal: bill.grossSubtotal, itemDiscount: bill.itemDiscount, subtotal: bill.subtotal,
    discount: discountOf(bill.discountKind, bill.discountValue), billDiscount: bill.billDiscount,
    discountReason: bill.discountReason, packaging: bill.packaging, taxable: bill.taxable,
    cgst: bill.cgst, sgst: bill.sgst,
    taxBreakup: [...taxBreakup.values()].sort((a, b) => a.cgstBp + a.sgstBp - (b.cgstBp + b.sgstBp)),
    roundOff: bill.roundOff, total: bill.total, paid,
    due: bill.status === 'VOID' ? 0 : Math.max(0, bill.total - paid),
    payments: bill.payments.map((p) => ({
      id: p.id, mode: p.mode, amount: p.amount, tendered: p.tendered, change: p.change,
      reference: p.reference, receivedBy: p.receivedBy, createdAt: p.createdAt,
    })),
    voidReason: bill.voidReason, version: bill.version, createdAt: bill.createdAt, createdBy: bill.createdBy,
  };
}

export type BillView = ReturnType<typeof billView>;
```

`bills.service.ts` (core of `create` and `recalculate`; `lockBill` used by Tasks 4–6):

```ts
@Injectable()
export class BillsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly days: BusinessDayService,
    private readonly counters: CountersService,
    private readonly events: EventEmitter2,
  ) {}

  async create(actor: AuthUser, orderId: string, ifMatch: string | undefined, request: CreateBillRequest) {
    let billId = '';
    await this.orders.mutate(actor, orderId, ifMatch, async ({ tx, order }) => {
      if (order.status !== 'OPEN' && order.status !== 'BILLED') throw orderNotOpen();
      const items = await tx.orderItem.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } });
      if (items.some((i) => i.status === 'NEW')) {
        throw new ApiError(HttpStatus.CONFLICT, 'UNSENT_ITEMS', 'Send the new dishes to the kitchen first.');
      }
      const billed = await billedQuantities(tx, orderId);
      const left = (id: string) => (items.find((i) => i.id === id)?.quantity ?? 0) - (billed.get(id) ?? 0);
      const sent = items.filter((i) => i.status === 'SENT');
      const chosen = request.lines
        ? this.chosenLines(sent, request.lines, left)
        : sent.filter((i) => left(i.id) > 0).map((i) => ({ item: i, quantity: left(i.id) }));
      if (chosen.length === 0) {
        throw new ApiError(HttpStatus.CONFLICT, 'NOTHING_TO_BILL', 'Everything on this order is already billed.');
      }
      const day = await this.days.requireOpen(tx, actor.outletId);
      const outlet = await tx.outlet.findUniqueOrThrow({ where: { id: actor.outletId } });
      const fy = financialYear(new Date());
      const billNo = await this.counters.next(tx, actor.outletId, 'BILL', fy);
      const packagingUsed = await tx.bill.count({ where: { orderId, status: { not: 'VOID' }, billPackaging: { gt: 0 } } });
      const bill = await tx.bill.create({
        data: {
          outletId: actor.outletId, businessDayId: day.id, orderId, billNo, financialYear: fy,
          taxScheme: outlet.taxScheme,
          billPackaging: order.type === 'PARCEL' && packagingUsed === 0 ? outlet.billPackagingCharge : 0,
          createdById: actor.id,
          // amounts are filled by recalculate() below
          grossSubtotal: 0, itemDiscount: 0, subtotal: 0, packaging: 0, taxable: 0, cgst: 0, sgst: 0, roundOff: 0, total: 0,
          items: {
            create: chosen.map(({ item, quantity }, index) => {
              const addons = item.addons as { price: number }[];
              return {
                orderItemId: item.id, itemName: item.itemName, variantName: item.variantName,
                addons: item.addons as Prisma.InputJsonValue,
                unitPrice: item.unitPrice + addons.reduce((s, a) => s + a.price, 0),
                quantity, packagingPerUnit: item.packagingCharge, cgstBp: item.cgstBp, sgstBp: item.sgstBp,
                gross: 0, itemDiscount: 0, lineTotal: 0, billDiscountShare: 0, packaging: 0, taxable: 0, cgst: 0, sgst: 0,
                sortOrder: index,
              };
            }),
          },
        },
      });
      await this.recalculate(tx, bill.id);
      billId = bill.id;
      const fullyBilled = sent.every((i) => left(i.id) - (chosen.find((c) => c.item.id === i.id)?.quantity ?? 0) === 0);
      if (fullyBilled) await tx.order.update({ where: { id: orderId }, data: { status: 'BILLED' } });
    });
    this.changed(actor.outletId, billId, orderId);
    return this.get(actor.outletId, billId);
  }

  /** Rewrites the bill's amounts from its stored lines, discounts and packaging. */
  async recalculate(tx: Tx, billId: string): Promise<void> {
    const bill = await tx.bill.findUniqueOrThrow({ where: { id: billId }, include: { items: { orderBy: { sortOrder: 'asc' } } } });
    const discount = (kind: DiscountKind | null, value: number | null) => (kind && value !== null ? { kind, value } : null);
    const result = calculateBill({
      lines: bill.items.map((i) => ({
        unitPrice: i.unitPrice, quantity: i.quantity, packagingPerUnit: i.packagingPerUnit,
        cgstBp: i.cgstBp, sgstBp: i.sgstBp, discount: discount(i.discountKind, i.discountValue),
      })),
      billDiscount: discount(bill.discountKind, bill.discountValue),
      billPackaging: bill.billPackaging,
      taxScheme: bill.taxScheme,
    });
    await Promise.all(bill.items.map((item, index) => {
      const line = result.lines[index]!;
      return tx.billItem.update({ where: { id: item.id }, data: {
        gross: line.gross, itemDiscount: line.itemDiscount, lineTotal: line.lineTotal,
        billDiscountShare: line.billDiscountShare, packaging: line.packaging,
        taxable: line.taxable, cgst: line.cgst, sgst: line.sgst } });
    }));
    await tx.bill.update({ where: { id: billId }, data: {
      grossSubtotal: result.grossSubtotal, itemDiscount: result.itemDiscount, subtotal: result.subtotal,
      billDiscount: result.billDiscount, packaging: result.packaging, taxable: result.taxable,
      cgst: result.cgst, sgst: result.sgst, roundOff: result.roundOff, total: result.total } });
  }

  /** Locks the bill row for this transaction, bumping its version; `If-Match` → 409 BILL_CHANGED. */
  async lockBill(tx: Tx, outletId: string, billId: string, ifMatch: string | undefined): Promise<Bill> {
    const expected = parseVersion(ifMatch);
    const bumped = await tx.$queryRaw<{ id: string }[]>`
      UPDATE bills SET version = version + 1, updated_at = now()
       WHERE id = ${billId}::uuid AND outlet_id = ${outletId}::uuid
         AND (${expected}::int IS NULL OR version = ${expected}::int)
      RETURNING id`;
    if (bumped.length === 0) {
      const exists = await tx.bill.findFirst({ where: { id: billId, outletId } });
      if (!exists) throw notFound('Bill');
      throw new ApiError(HttpStatus.CONFLICT, 'BILL_CHANGED', 'Someone else changed this bill. It has been refreshed; check it and try again.');
    }
    return tx.bill.findUniqueOrThrow({ where: { id: billId } });
  }

  changed(outletId: string, billId: string, orderId: string) {
    this.events.emit('bill.updated', { outletId, billId, orderId });
  }
  // get(), forOrder(), chosenLines() — straightforward: findFirst/findMany with BILL_INCLUDE scoped by outletId → billView; chosenLines validates rule 3.
}

/** Quantity of each order item already on a non-void bill. */
export async function billedQuantities(tx: Tx, orderId: string): Promise<Map<string, number>> {
  const rows = await tx.billItem.groupBy({
    by: ['orderItemId'],
    where: { bill: { orderId, status: { not: 'VOID' } } },
    _sum: { quantity: true },
  });
  return new Map(rows.map((r) => [r.orderItemId, r._sum.quantity ?? 0]));
}
```

Move `parseIfMatch` out of `OrdersService` into `apps/api/src/common/if-match.ts` as `parseVersion(ifMatch: string | undefined): number | null` and use it in both places (the message becomes "If-Match must be a version number.").

A bill locks its order too: every bill operation (Tasks 4–6) first calls `orders.mutate(...)` on `bill.orderId`, then `lockBill` inside. One lock order everywhere (order → bill) avoids deadlocks.

`bills.controller.ts`:

```ts
@Controller()
export class BillsController {
  constructor(private readonly bills: BillsService) {}

  @Post('orders/:id/bills')
  @RequirePermissions('bill.print')
  create(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body(new ZodBody(createBillSchema)) body: CreateBillRequest) {
    return this.bills.create(user, id, ifMatch, body);
  }

  @Get('orders/:id/bills')
  @RequirePermissions('bill.print')
  forOrder(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bills.forOrder(user.outletId, id);
  }

  @Get('bills/:id')
  @RequirePermissions('bill.print')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bills.get(user.outletId, id);
  }
}
```

`billing.module.ts` imports `OrdersModule`, provides `BillsService` (and later `PaymentsService`), exports both; register in `AppModule`.

`orders.views.ts`: add to `ORDER_INCLUDE`:

```ts
bills: {
  orderBy: { createdAt: 'asc' },
  select: { id: true, billNo: true, status: true, total: true,
    payments: { select: { amount: true } },
    items: { select: { orderItemId: true, quantity: true } } },
},
```

and in `orderView` add `billedQuantity` per item (sum of `items.quantity` for that `orderItemId` over bills with `status !== 'VOID'`) and `bills: order.bills.map(b => ({ id, billNo, status, total, paid: Σ payments.amount }))`. Update `apps/web/src/service/types.ts` `OrderLine` (`billedQuantity: number`) and `Order` (`bills: OrderBillSummary[]`) and the web test fixture `order()` in `apps/web/src/test/fixtures.ts` (`bills: []`, `billedQuantity: 0`) so web typecheck stays green.

`realtime.gateway.ts`: `@OnEvent('bill.updated') billUpdated(event: OutletEvent) { this.toOutlet('bill.updated', event); }`.

- [ ] **Step 5: Run** `pnpm --filter @rpos/api test:e2e -- billing orders` → PASS; `pnpm typecheck` → PASS.

- [ ] **Step 6: Commit** `feat(billing): create bills from orders, whole or split by items`.

---

### Task 4: Discounts with the cashier cap and manager override

**Files:**
- Create: `apps/api/src/auth/override.service.ts`
- Modify: `apps/api/src/auth/permissions.guard.ts`, `apps/api/src/auth/auth.module.ts`, `apps/api/src/billing/bills.service.ts`, `apps/api/src/billing/bills.controller.ts`, `apps/api/test/billing.e2e-spec.ts`

**Interfaces:**
- Produces: `OverrideService.approve(token: string, permission: Permission, requester: AuthUser): Promise<AuthUser | null>` (verifies the override JWT, checks the approver still has the permission, consumes the jti). `PermissionsGuard` delegates to it (behaviour unchanged — existing security e2e must stay green).
- Produces: `BillsService.setDiscount(user: AuthUser, permissions: Permission[], billId: string, ifMatch: string | undefined, overrideToken: string | undefined, request: BillDiscountRequest): Promise<BillView>`; route `PUT /api/bills/:id/discount` (`discount.apply`).

Rules:
1. Bill must be `OPEN` with no payments (`409 BILL_HAS_PAYMENTS` "Remove the discount before taking payment." — wording: "Discounts can only change before any payment is taken.").
2. Item entries must be lines of this bill (`400 INVALID_REFERENCE`, field `billItemId`). `bill: undefined` leaves the bill discount unchanged, `null` clears it.
3. After recalculation, total discount = `itemDiscount + billDiscount`. If it is above 0, `reason` (≥ 3 chars) is required → `400 VALIDATION` "Give a reason for the discount".
4. Cap: allowed = `floor(grossSubtotal × cashierDiscountCapBp / 10000)`. If total discount > allowed and the user lacks `discount.unlimited`: with header `x-override-token` → `OverrideService.approve(token, 'discount.unlimited', user)`; null or no header → `403 DISCOUNT_OVER_LIMIT` with `{ capBp, allowed }` "This discount needs a manager." The approving manager becomes `discountById` and the audit actor.
5. Audit `bill.discount` (same transaction) with `before`/`after` `{ discount, itemDiscounts, total }`, `reason`, `after.requestedBy` = user id when overridden.

- [ ] **Step 1: Failing e2e** (append to `billing.e2e-spec.ts`):

```ts
describe('discounts', () => {
  /** 2 × Paneer Half (₹360) + 1 × Roti (₹30): subtotal ₹390, so the 10% cashier cap is ₹39. */
  async function bill390() {
    const orderId = await servedOrder(ctx, r, waiter, [{ variantId: r.paneer.half.id, quantity: 2 }, { variantId: r.roti.regular.id, quantity: 1 }]);
    return (await ctx.http().post(`/api/orders/${orderId}/bills`).set(cashier.auth).send({}).expect(201)).body;
  }

  it('lets a cashier give up to the cap with a reason, and audits it', async () => {
    const bill = await bill390();
    const res = await ctx.http().put(`/api/bills/${bill.id}/discount`).set(cashier.auth)
      .send({ bill: { kind: 'PERCENT', value: 1000 }, reason: 'Regular guest' }).expect(200);
    expect(res.body).toMatchObject({ billDiscount: 3900, discountReason: 'Regular guest', discount: { kind: 'PERCENT', value: 1000 } });
    const audit = await ctx.prisma.auditEntry.findFirstOrThrow({ where: { action: 'bill.discount' } });
    expect(audit).toMatchObject({ entityId: bill.id, reason: 'Regular guest', actorId: cashier.user.id });
  });

  it('asks a manager above the cashier cap', async () => {
    const bill = await bill390();
    const res = await ctx.http().put(`/api/bills/${bill.id}/discount`).set(cashier.auth)
      .send({ bill: { kind: 'PERCENT', value: 2000 }, reason: 'Complaint' }).expect(403);
    expect(res.body).toMatchObject({ code: 'DISCOUNT_OVER_LIMIT', capBp: 1000, allowed: 3900 });
    const token = await overrideToken(ctx, manager, cashier, 'discount.unlimited'); // helper: POST /api/auth/override as in kot.e2e-spec
    const ok = await ctx.http().put(`/api/bills/${bill.id}/discount`).set(cashier.auth).set('x-override-token', token)
      .send({ bill: { kind: 'PERCENT', value: 2000 }, reason: 'Complaint' }).expect(200);
    expect(ok.body.billDiscount).toBe(7800);
    const audit = await ctx.prisma.auditEntry.findFirstOrThrow({ where: { action: 'bill.discount' } });
    expect(audit.actorId).toBe(manager.user.id);
  });

  it('lets a manager give any discount, but never below zero', async () => {
    const bill = await bill390();
    const res = await ctx.http().put(`/api/bills/${bill.id}/discount`).set(manager.auth)
      .send({ bill: { kind: 'FLAT', value: 100000 }, reason: 'On the house' }).expect(200);
    expect(res.body).toMatchObject({ billDiscount: 39000, taxable: 0, total: 0 });
  });

  it('discounts a single dish', async () => {
    const bill = await bill390();
    const roti = bill.lines.find((l: { itemName: string }) => l.itemName === 'Tandoori Roti');
    const res = await ctx.http().put(`/api/bills/${bill.id}/discount`).set(cashier.auth)
      .send({ items: [{ billItemId: roti.id, discount: { kind: 'FLAT', value: 1000 } }], reason: 'Burnt' }).expect(200);
    expect(res.body).toMatchObject({ itemDiscount: 1000, subtotal: 38000 });
  });

  it('needs a reason, and refuses a stale version', async () => {
    const bill = await bill390();
    await ctx.http().put(`/api/bills/${bill.id}/discount`).set(cashier.auth)
      .send({ bill: { kind: 'FLAT', value: 1000 } }).expect(400);
    await ctx.http().put(`/api/bills/${bill.id}/discount`).set(cashier.auth).set('If-Match', String(bill.version + 5))
      .send({ bill: null }).expect(409);
  });

  it('does not let a waiter discount', async () => { /* waiter → 403 FORBIDDEN */ });
});
```

Add `manager = await signIn(ctx, outlet.id, 'MANAGER')` to `beforeEach`, and an `overrideToken(ctx, approver, requester, permission)` helper to `billing-helpers.ts` copying the request `kot.e2e-spec.ts` uses for `/api/auth/override` (approver PIN must be set — reuse how kot.e2e-spec creates the manager PIN).

- [ ] **Step 2: Run** → FAIL (route missing).
- [ ] **Step 3: Extract `OverrideService`** from `PermissionsGuard.approverFor` + `consume` (move both methods verbatim; the guard calls `this.overrides.approve(token, missing[0]!, req.user)`). Provide and export it from `AuthModule`. Run `pnpm --filter @rpos/api test:e2e -- security kot auth` → still PASS.
- [ ] **Step 4: Implement `setDiscount`** following the rules (inside `orders.mutate(user, bill.orderId, undefined, …)` then `lockBill(tx, outletId, billId, ifMatch)`; write discount fields on bill and items; `recalculate`; re-read; cap check; audit). Throwing after `recalculate` rolls the whole change back. The controller reads `@Req() req` for `req.permissions` and the `x-override-token` header, and returns 200 (`@HttpCode(200)` is default for PUT).
- [ ] **Step 5: Run** `pnpm --filter @rpos/api test:e2e -- billing security` → PASS.
- [ ] **Step 6: Commit** `feat(billing): apply bill and item discounts with the cashier cap`.

---

### Task 5: Payments, settling the bill and closing the order

**Files:**
- Create: `apps/api/src/billing/payments.service.ts`, `apps/api/test/payments.e2e-spec.ts`
- Modify: `apps/api/src/billing/bills.controller.ts`, `apps/api/src/billing/billing.module.ts`

**Interfaces:**
- Produces: `PaymentsService.add(actor: AuthUser, billId: string, idempotencyKey: string | undefined, request: AddPaymentRequest): Promise<BillView>`; route `POST /api/bills/:id/payments` (`payment.take`, header `Idempotency-Key`, returns 201 with the bill view).

Rules:
1. Replay first: a stored key for this bill returns the current bill view; a key stored for another bill → `409 IDEMPOTENCY_KEY_REUSED`. Store `{ billId, paymentId }` in `idempotency_keys` inside the same transaction; a concurrent duplicate hits the unique index (`P2002`) → replay.
2. Inside `orders.mutate(actor, bill.orderId, undefined, …)` then `lockBill(tx, …, undefined)`: bill must be `OPEN` (`409 BILL_NOT_OPEN`); `amount ≤ due` else `409 OVERPAYMENT` with `{ due }` "Only ₹X is due." (format with `formatPaise`).
3. `tendered` only for `CASH` (`400 VALIDATION` otherwise); must be ≥ amount; `change = tendered − amount`. `reference` ignored for cash.
4. `businessDayId` = the bill's day; the day must still be open (`requireOpen` — it is the same day while the bill is open, because close is blocked by open bills).
5. When `paid == total`: bill → `PAID`, `paidAt = now`. Then if the order is `BILLED` and every non-void bill of the order is `PAID`: order → `CLOSED`, `closedAt = now` (table frees; QR token rotation lands in M4).
6. A ₹0 bill (100% discount) is settled by `POST /api/bills/:id/settle`? No — keep one path: a bill whose `total` is 0 is marked `PAID` at creation/discount time. Implement in `BillsService` after `recalculate`: `if (total === 0 && status === 'OPEN') → PAID` and run the same order-close check (put the check in `PaymentsService.settleOrder(tx, orderId)` and call it from both).
7. Emits `bill.updated`; `order.updated` comes from `mutate`.

- [ ] **Step 1: Failing e2e** (`payments.e2e-spec.ts`, same setup as billing):

```ts
it('takes cash with change, closes the bill and frees the table', async () => {
  const bill = await billFor([{ variantId: r.roti.regular.id, quantity: 1 }]); // ₹31.50 → ₹32 (3200)
  const res = await pay(bill.id, { mode: 'CASH', amount: 3200, tendered: 5000 }).expect(201);
  expect(res.body).toMatchObject({ status: 'PAID', paid: 3200, due: 0 });
  expect(res.body.payments[0]).toMatchObject({ mode: 'CASH', amount: 3200, tendered: 5000, change: 1800 });
  const order = (await ctx.http().get(`/api/orders/${bill.orderId}`).set(cashier.auth)).body;
  expect(order.status).toBe('CLOSED');
  const floor = (await ctx.http().get('/api/floor/status').set(cashier.auth)).body;
  expect(floor[0].tables.find((t: { name: string }) => t.name === 'T1').order).toBeNull();
});

it('splits equally into three UPI payments that add up exactly', async () => {
  const bill = await billFor([{ variantId: r.paneer.half.id, quantity: 2 }]); // ₹378 → 37800
  const parts = splitEqually(bill.total, 3);
  for (const amount of parts.slice(0, 2)) {
    const res = await pay(bill.id, { mode: 'UPI', amount }).expect(201);
    expect(res.body.status).toBe('OPEN');
  }
  const last = await pay(bill.id, { mode: 'UPI', amount: parts[2]!, reference: 'UTR123' }).expect(201);
  expect(last.body).toMatchObject({ status: 'PAID', due: 0 });
});

it('refuses more than is due, even from two counters at once', async () => {
  const bill = await billFor([{ variantId: r.roti.regular.id, quantity: 1 }]);
  const [a, b] = await Promise.all([pay(bill.id, { mode: 'CASH', amount: 3200 }), pay(bill.id, { mode: 'UPI', amount: 3200 })]);
  expect([a.status, b.status].sort()).toEqual([201, 409]);
  const stored = await ctx.prisma.payment.findMany({ where: { billId: bill.id } });
  expect(stored).toHaveLength(1);
});

it('records a payment once when the same request is retried', async () => {
  const bill = await billFor([{ variantId: r.roti.regular.id, quantity: 1 }]);
  const send = () => pay(bill.id, { mode: 'CASH', amount: 1000 }).set('Idempotency-Key', 'pay-1');
  await send().expect(201);
  const again = await send().expect(201);
  expect(again.body.payments).toHaveLength(1);
  const other = await billFor([{ variantId: r.roti.regular.id, quantity: 1 }], r.t2.id);
  await pay(other.id, { mode: 'CASH', amount: 1000 }).set('Idempotency-Key', 'pay-1').expect(409);
});

it('closes a split order only when every bill is paid', async () => { /* two split bills; pay first → order BILLED; pay second → CLOSED */ });

it('settles a free bill straight away', async () => { /* manager 100% discount → status PAID, order CLOSED */ });

it('lets a waiter take payment only when the outlet allows it', async () => {
  const bill = await billFor([{ variantId: r.roti.regular.id, quantity: 1 }]);
  await pay(bill.id, { mode: 'CASH', amount: 3200 }, waiter).expect(403);
  // waiterCanCollectPayment is read at sign-in: update the outlet, then sign the waiter in again
});
```

Helpers in the spec: `billFor(lines, tableId?)` = `servedOrder` + `POST /orders/:id/bills`; `pay(billId, body, who = cashier)` = `ctx.http().post(`/api/bills/${billId}/payments`).set(who.auth).send(body)`. Roti ₹30 + 5% = ₹31.50 → ₹32; Paneer 2 × ₹180 = ₹360 + ₹18 = ₹378.

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `PaymentsService` per the rules (mirror the replay/P2002 structure of `KotsService.send`). Add `settleOrder(tx, orderId)` and call it from `BillsService` when a bill becomes free (rule 6) — `PaymentsService` must not depend on `BillsService` circularly: put `settleOrder` in `PaymentsService` and inject `PaymentsService` into `BillsService`.
- [ ] **Step 4: Run** `pnpm --filter @rpos/api test:e2e -- payments billing` → PASS.
- [ ] **Step 5: Commit** `feat(billing): record cash, UPI and card payments and close paid orders`.

---

### Task 6: Void a bill

**Files:**
- Modify: `apps/api/src/billing/bills.service.ts`, `apps/api/src/billing/bills.controller.ts`, `apps/api/src/kots/kots.service.ts`, `apps/api/src/orders/orders.service.ts`, `apps/api/test/billing.e2e-spec.ts`

**Interfaces:**
- Produces: `BillsService.void(actor: AuthUser, requester: AuthUser, billId: string, reason: string): Promise<BillView>`; route `POST /api/bills/:id/void` (`bill.void`; the guard's override makes a manager the actor — use `@CurrentActor()` and `@CurrentUser()` like `kots.controller` void).

Rules:
1. Bill `OPEN` or `PAID` (`409 BILL_ALREADY_VOID`). The bill's business day must be the open day (`409 DAY_CLOSED` "This bill belongs to a closed day.").
2. Bill → `VOID`, `voidReason`, `voidedById = actor.id`, `voidedAt`. Payments stay for the record; a void bill counts nothing in totals or cash (spec ruling: money is returned or collected again on the new bill).
3. Order goes back to `OPEN` with `closedAt = null` (its items become billable again). If the order was `CLOSED` and is dine-in, first check its table is not held by another active order (`409 TABLE_BUSY` "T1 already has a new order. Bill the dishes there instead."). Use the shared `tableHolder` check from Task 7 if it has landed; until then query `order.findFirst({ where: { tableId, status: { in: ACTIVE_STATUSES }, id: { not: orderId } } })`.
4. Audit `bill.void` (same transaction): `reason`, `before: { status, total, paid }`, `after: { requestedBy }`.
5. Orders with non-void bills cannot be cancelled or voided: `OrdersService.cancel` and `KotsService.voidOrder` throw `409 HAS_BILLS` "Void the bill first." (Order `BILLED` already blocks `cancel`; add the explicit check in `voidOrder`, which runs on `OPEN` orders that may have split bills.)

- [ ] **Step 1: Failing e2e:**

```ts
describe('void', () => {
  it('voids an unpaid bill with a manager, keeps its number and reopens the order', async () => {
    const bill = await billFor([{ variantId: r.roti.regular.id, quantity: 1 }]);
    await ctx.http().post(`/api/bills/${bill.id}/void`).set(cashier.auth).send({ reason: 'Wrong table' }).expect(403);
    const res = await ctx.http().post(`/api/bills/${bill.id}/void`).set(manager.auth).send({ reason: 'Wrong table' }).expect(201);
    expect(res.body).toMatchObject({ status: 'VOID', billNo: bill.billNo, voidReason: 'Wrong table', due: 0 });
    const order = (await ctx.http().get(`/api/orders/${bill.orderId}`).set(cashier.auth)).body;
    expect(order.status).toBe('OPEN');
    const again = await ctx.http().post(`/api/orders/${bill.orderId}/bills`).set(cashier.auth).send({}).expect(201);
    expect(again.body.billNo).toBe(bill.billNo + 1);
    expect(await ctx.prisma.auditEntry.count({ where: { action: 'bill.void', entityId: bill.id } })).toBe(1);
  });

  it('lets a cashier void with a manager PIN override', async () => { /* overrideToken(manager, cashier, 'bill.void') → 201, audit actor = manager */ });

  it('reopens a paid order but not onto a table that has new guests', async () => {
    const bill = await billFor([{ variantId: r.roti.regular.id, quantity: 1 }]);
    await pay(bill.id, { mode: 'CASH', amount: bill.total }).expect(201);
    await ctx.http().post('/api/orders').set(waiter.auth).send({ type: 'DINE_IN', tableId: r.t1.id, guests: 2 }).expect(201);
    const res = await ctx.http().post(`/api/bills/${bill.id}/void`).set(manager.auth).send({ reason: 'Refund' }).expect(409);
    expect(res.body.code).toBe('TABLE_BUSY');
  });

  it('refuses to void twice', async () => { /* second void → 409 BILL_ALREADY_VOID */ });

  it('blocks voiding the order while a bill is live', async () => {
    // split bill on an OPEN order → POST /orders/:id/void (manager) → 409 HAS_BILLS
  });
});
```

(`billFor`/`pay` helpers: move them into `test/billing-helpers.ts` in this task so both spec files share them.)

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm --filter @rpos/api test:e2e -- billing payments kot orders` → PASS.
- [ ] **Step 5: Commit** `feat(billing): void bills with a manager and reopen the order`.

---

### Task 7: Move and merge tables

**Files:**
- Create: `apps/api/src/orders/table-moves.service.ts`, `apps/api/test/table-moves.e2e-spec.ts`
- Modify: `apps/api/src/orders/orders.controller.ts`, `apps/api/src/orders/orders.module.ts`, `apps/api/src/orders/orders.service.ts`, `apps/api/src/orders/floor-status.controller.ts`, `apps/api/src/orders/orders.views.ts`, `apps/web/src/service/types.ts`

**Interfaces:**
- Produces:
  - `tableHolder(tx: Tx, tableId: string, exceptOrderId?: string): Promise<{ id: string } | null>` (exported from `orders.service.ts`): the active order on the table, or the active order that a merged order on this table was merged into.
  - `TableMovesService.move(actor: AuthUser, orderId: string, ifMatch: string | undefined, tableId: string): Promise<OrderView>` — route `POST /api/orders/:id/move` (`table.manage`).
  - `TableMovesService.merge(actor: AuthUser, intoOrderId: string, ifMatch: string | undefined, fromOrderId: string): Promise<OrderView>` — route `POST /api/orders/:id/merge` (`table.manage`).
  - Order view gains `mergedTables: { id: string; name: string }[]`; floor status shows a merged table as running with the target order (`order.mergedInto: '<target table name>'`).

Rules:
- `OrdersService.create` uses `tableHolder` for its busy check (replacing the inline query).
- Move: order dine-in, status `OPEN` or `BILLED`; target table exists in the outlet, not archived, row-locked (`SELECT … FOR UPDATE` as in `create`), and `tableHolder(target)` is null → else `409 TABLE_BUSY`. Same table → `400 VALIDATION`. `order.tableId = target`. KDS and KOT reprints read the order's table, so they follow automatically. Emit `order.updated` for the order (old table frees via the floor refresh).
- Merge (`:id` is the order that stays, A): both orders dine-in, both `OPEN`, same business day, different ids; B has no non-void bills (`409 HAS_BILLS`). Lock both orders in id order to avoid deadlocks: run inside `orders.mutate(actor, A)` and bump B's version with the same raw `UPDATE … RETURNING` (via a new `OrdersService.lockAnother(tx, outletId, orderId)` helper). Move B's items and KOTs to A (`orderItem.updateMany`, `kot.updateMany` with `orderId: A`), then B → `CANCELLED`, `cancelReason = "Merged into <A's table name>"`, `mergedIntoId = A`, `closedAt = now`. Guests add up (`A.guests + B.guests`). Emit `order.updated` for both.
- Audit is not required for move/merge (§6.3 list).

- [ ] **Step 1: Failing e2e** (`table-moves.e2e-spec.ts`):

```ts
it('moves a running order to a free table', async () => {
  const orderId = await servedOrder(ctx, r, waiter, [{ variantId: r.roti.regular.id, quantity: 1 }]);
  const res = await ctx.http().post(`/api/orders/${orderId}/move`).set(waiter.auth).send({ tableId: r.t2.id }).expect(201);
  expect(res.body.table).toEqual({ id: r.t2.id, name: 'T2' });
  const kds = await ctx.http().get('/api/kds/kots').set('Cookie', `rpos_dt=${kds.cookie}`).expect(200);
  expect(kds.body[0].tableName).toBe('T2');
  await ctx.http().post('/api/orders').set(waiter.auth).send({ type: 'DINE_IN', tableId: r.t1.id, guests: 2 }).expect(201);
});

it('will not move onto a busy table', async () => { /* order on T1 and T2 → move T1→T2 → 409 TABLE_BUSY */ });

it('merges one table into another and keeps both tables held until the bill is paid', async () => {
  const a = await servedOrder(ctx, r, waiter, [{ variantId: r.roti.regular.id, quantity: 1 }], r.t1.id);
  const b = await servedOrder(ctx, r, waiter, [{ variantId: r.paneer.half.id, quantity: 1 }], r.t2.id);
  const res = await ctx.http().post(`/api/orders/${a}/merge`).set(waiter.auth).send({ fromOrderId: b }).expect(201);
  expect(res.body.items).toHaveLength(2);
  expect(res.body.guests).toBe(4);
  expect(res.body.mergedTables).toEqual([{ id: r.t2.id, name: 'T2' }]);
  const old = (await ctx.http().get(`/api/orders/${b}`).set(waiter.auth)).body;
  expect(old).toMatchObject({ status: 'CANCELLED', cancelReason: 'Merged into T1' });
  // T2 is still taken
  await ctx.http().post('/api/orders').set(waiter.auth).send({ type: 'DINE_IN', tableId: r.t2.id, guests: 2 }).expect(409);
  const floor = (await ctx.http().get('/api/floor/status').set(waiter.auth)).body;
  const t2 = floor[0].tables.find((t: { name: string }) => t.name === 'T2');
  expect(t2.order).toMatchObject({ orderId: a, mergedInto: 'T1' });
  // pay the merged bill → both tables free
  const bill = (await ctx.http().post(`/api/orders/${a}/bills`).set(cashier.auth).send({}).expect(201)).body;
  await ctx.http().post(`/api/bills/${bill.id}/payments`).set(cashier.auth).send({ mode: 'CASH', amount: bill.total }).expect(201);
  await ctx.http().post('/api/orders').set(waiter.auth).send({ type: 'DINE_IN', tableId: r.t2.id, guests: 2 }).expect(201);
});

it('refuses to merge an order that already has a bill', async () => { /* bill B first → 409 HAS_BILLS */ });

it('does not let a parcel be moved onto a table', async () => { /* parcel order → move → 409 NOT_DINE_IN */ });
```

(KDS device: `createDevice(ctx.prisma, outlet.id, owner.user.id, 'KDS', 'Kitchen screen')` as in `kot.e2e-spec.ts`.)

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (floor status: for tables without an active order, look for `order.findFirst({ where: { tableId, mergedIntoId: { not: null }, mergedInto: { status: { in: ACTIVE } } } })` — do it in one query for all tables: `findMany({ where: { outletId, mergedIntoId: { not: null }, mergedInto: { status: { in: [...ACTIVE_STATUSES] } } }, include: { mergedInto: { include: { table: true, items: true } } } })`). **Step 4: Run** `pnpm --filter @rpos/api test:e2e -- table-moves orders floor kot` → PASS.
- [ ] **Step 5:** Update `apps/web/src/service/types.ts` (`Order.mergedTables`, `FloorTableStatus.order.mergedInto?: string`) and web fixtures; `pnpm --filter @rpos/web typecheck && pnpm --filter @rpos/web test` → PASS.
- [ ] **Step 6: Commit** `feat(orders): move a running order and merge tables`.

---

### Task 8: Bill printing

**Files:**
- Modify: `apps/api/src/print/print.service.ts`, `apps/api/src/billing/bills.service.ts`, `apps/api/src/billing/bills.controller.ts`, `apps/api/prisma/schema.prisma` (+ migration `20261006120100_print_job_bill`), `apps/api/test/print.e2e-spec.ts`

**Interfaces:**
- Produces: event `bill.print` `{ outletId, billId }` emitted after a bill is created and by `POST /api/bills/:id/print` (`bill.print`, returns `{ id, queued: true }`). `PrintJob.billId` (nullable FK). `BillPrintPayload`:
```ts
{ kind: 'BILL', title: 'Tax Invoice' | 'Bill of Supply',
  outlet: { name, address, phone, gstin, fssaiNumber, billHeader, billFooter },
  billNo, financialYear, status: 'OPEN' | 'PAID' | 'VOID', createdAt, cashierName,
  orderType, tableName, tokenNo, customerName, guests, paperWidthMm,
  lines: [{ itemName, variantName, addons: string[], quantity, unitPrice, amount /* lineTotal */ }],
  grossSubtotal, itemDiscount, billDiscount, discountReason, packaging, taxable, cgst, sgst,
  taxBreakup: [{ ratePercent: string /* "5%" */, taxable, cgst, sgst }], roundOff, total,
  payments: [{ mode, amount }], paid, due }
```
- Consumed later by the web bill template (M3b).

Rules: jobs go to every non-archived printer with `purpose: 'BILL'` in the outlet (stations do not apply). No bill printer → no job (the POS can still print from the screen in M3b). Emit `print.job` for printers with a device, exactly like KOT jobs. A void bill prints with status `VOID` (the template stamps it). Print failures never fail bill creation (`queueBill` catches and logs like `queueKot`).

- [ ] **Step 1: Failing e2e** (append to `print.e2e-spec.ts`): create a `BILL` printer on `counter` (`{ name: 'Bill printer', purpose: 'BILL', mode: 'BROWSER', paperWidthMm: 80, deviceId: counter.id }`), send a KOT and bill the order; claim for `counter` returns 2 jobs; the `BILL` job's payload matches `{ kind: 'BILL', title: 'Tax Invoice', billNo: 1, tableName: 'T1', total: <bill total>, outlet: { name: outlet.name } }`; `POST /api/bills/:id/print` queues one more bill job.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (`ratePercent`: `(cgstBp + sgstBp) / 100` formatted without trailing zeros, e.g. `"5%"`, `"18%"`, `"2.5%"`). **Step 4: Run** `pnpm --filter @rpos/api test:e2e -- print billing` → PASS.
- [ ] **Step 5: Commit** `feat(print): queue bill print jobs`.

---

### Task 9: Close the business day

**Files:**
- Create: `apps/api/src/business-day/day-close.service.ts`, `apps/api/test/day-close.e2e-spec.ts`
- Modify: `apps/api/src/business-day/business-day.service.ts`, `apps/api/src/business-day/business-day.controller.ts`, `apps/api/src/business-day/business-day.module.ts`

**Interfaces:**
- Produces:
  - `BusinessDayService.requireOpen(tx, outletId)` now takes a `FOR SHARE` lock on the open day row (`SELECT id FROM business_days WHERE outlet_id = … AND status = 'OPEN' FOR SHARE`, then `findUniqueOrThrow`).
  - `GET /api/business-day/close-check` (`day.openClose`) → `{ day: { id, openingCash }, blockers: { orders: { id, label, status }[], bills: { id, billNo, due }[] }, cash: { opening, cashSales, cashExpenses, expected } }` where `label` is the table name or `Parcel #token`.
  - `POST /api/business-day/close` (`day.openClose`, body `closeDaySchema`) → the day report (below). `409 DAY_HAS_OPEN_WORK` with the same `blockers` when any order is `PENDING_APPROVAL/OPEN/BILLED` or any bill is `OPEN`.
  - `POST /api/business-day/:id/reopen` (`day.reopen`, body `{ reason }` via `voidBillSchema`-shaped `reopenDaySchema` — add `reopenDaySchema = z.strictObject({ reason })` to shared billing.ts) → day view.
  - `GET /api/business-day?limit=30` (`reports.dayClose`) → recent days `{ id, status, openedAt, closedAt, openingCash, expectedCash, countedCash, variance, total }` newest first.
  - `GET /api/business-day/:id/report` (`reports.dayClose`) → `DayReport`:
```ts
{ day: { id, status, openedAt, closedAt, openedBy: {id,name}, closedBy: {id,name} | null, closeNote },
  sales: { bills: number, grossSubtotal, discounts, packaging, taxable, cgst, sgst, roundOff, total },
  payments: { CASH: number, UPI: number, CARD: number },
  byType: { DINE_IN: { orders: number, total: number }, PARCEL: { orders: number, total: number } },
  topItems: { itemName: string, variantName: string, quantity: number, amount: number }[],   // top 10 by quantity, from bill lines of non-void bills
  voids: { billNo: number, total: number, reason: string | null, by: string | null }[],
  cancels: { itemName: string, quantity: number, reason: string | null }[],                // order items CANCELLED after a KOT (kotId not null) + void orders
  discounts: { billNo: number, amount: number, reason: string | null }[],
  expenses: { total: 0, cash: 0 },                                                         // M5 fills this
  cash: { opening, cashSales, cashExpenses, expected, counted: number | null, variance: number | null } }
```

Rules:
1. Close: `SELECT id FROM business_days WHERE id = … AND status = 'OPEN' FOR UPDATE` first (waits for any transaction holding the share lock from `requireOpen`, so an order being created either commits before the check — and blocks the close — or retries after and gets `DAY_NOT_OPEN`). Then blockers, then compute cash (`cashSales` = Σ CASH payments on non-void bills of this day; `cashExpenses` = 0), store `expectedCash`, `countedCash`, `variance = counted − expected`, `closeNote`, `status CLOSED`, `closedAt`, `closedById`. Audit `day.close` with `after: { expected, counted, variance }`. Emit `day.updated`.
2. Reopen: owner only (permission); the day must be `CLOSED`, be the outlet's most recent day, and no other day may be open (`409 DAY_ALREADY_OPEN`). Clears `closedAt/closedById/expectedCash/countedCash/variance/closeNote`, sets `OPEN`. Audit `day.reopen` with `reason` and `before` = the stored cash figures. Emit `day.updated`.
3. Report for an open day computes `cash.expected` live and `counted/variance` null. Money sums count non-void bills only; a void bill appears only under `voids`.
4. All queries are scoped by `outletId`; a day from another outlet → 404.

- [ ] **Step 1: Failing e2e** (`day-close.e2e-spec.ts`):

```ts
it('lists what blocks the close', async () => {
  const open = await servedOrder(ctx, r, waiter, [{ variantId: r.roti.regular.id, quantity: 1 }]);
  const check = await ctx.http().get('/api/business-day/close-check').set(manager.auth).expect(200);
  expect(check.body.blockers.orders).toEqual([expect.objectContaining({ id: open, label: 'T1', status: 'OPEN' })]);
  const res = await ctx.http().post('/api/business-day/close').set(manager.auth).send({ countedCash: 0 }).expect(409);
  expect(res.body.code).toBe('DAY_HAS_OPEN_WORK');
});

it('closes with the cash tally and blocks new orders', async () => {
  // opening cash ₹1,000 (beforeEach opens with 100000), one cash bill ₹32, one UPI bill ₹378
  const cash = await billFor([{ variantId: r.roti.regular.id, quantity: 1 }], r.t1.id);
  await pay(cash.id, { mode: 'CASH', amount: cash.total }).expect(201);
  const upi = await billFor([{ variantId: r.paneer.half.id, quantity: 2 }], r.t2.id);
  await pay(upi.id, { mode: 'UPI', amount: upi.total }).expect(201);
  const res = await ctx.http().post('/api/business-day/close').set(manager.auth).send({ countedCash: 103000, note: 'Short ₹2' }).expect(201);
  expect(res.body.cash).toEqual({ opening: 100000, cashSales: 3200, cashExpenses: 0, expected: 103200, counted: 103000, variance: -200 });
  expect(res.body.payments).toEqual({ CASH: 3200, UPI: 37800, CARD: 0 });
  expect(res.body.sales).toMatchObject({ bills: 2, total: 41000 });
  expect(res.body.byType.DINE_IN).toEqual({ orders: 2, total: 41000 });
  expect(res.body.topItems[0]).toMatchObject({ itemName: 'Paneer Tikka', quantity: 2 });
  await ctx.http().post('/api/orders').set(waiter.auth).send({ type: 'PARCEL' }).expect(409);
  expect(await ctx.prisma.auditEntry.count({ where: { action: 'day.close' } })).toBe(1);
});

it('counts void bills only as voids', async () => { /* bill, void (manager), rebill + pay → report.voids has 1, sales.bills 1 */ });

it('never leaves an order on a closed day when close and a new order race', async () => {
  const results = await Promise.all([
    ctx.http().post('/api/orders').set(waiter.auth).send({ type: 'PARCEL' }),
    ctx.http().post('/api/business-day/close').set(manager.auth).send({ countedCash: 100000 }),
  ]);
  const [order, close] = results;
  if (close.status === 201) {
    expect(order.status).toBe(409); // DAY_NOT_OPEN
  } else {
    expect(order.status).toBe(201);
    expect(close.body.code).toBe('DAY_HAS_OPEN_WORK');
  }
  const closedDayOrders = await ctx.prisma.order.count({ where: { businessDay: { status: 'CLOSED' } } });
  expect(closedDayOrders).toBe(0);
});

it('lets only the owner reopen the last day, with a reason', async () => {
  await ctx.http().post('/api/business-day/close').set(manager.auth).send({ countedCash: 100000 }).expect(201);
  const day = (await ctx.http().get('/api/business-day?limit=1').set(manager.auth).expect(200)).body[0];
  await ctx.http().post(`/api/business-day/${day.id}/reopen`).set(manager.auth).send({ reason: 'Missed a bill' }).expect(403);
  const res = await ctx.http().post(`/api/business-day/${day.id}/reopen`).set(owner.auth).send({ reason: 'Missed a bill' }).expect(201);
  expect(res.body.status).toBe('OPEN');
  expect(await ctx.prisma.auditEntry.count({ where: { action: 'day.reopen', reason: 'Missed a bill' } })).toBe(1);
});

it('does not let a cashier close the day or read reports', async () => { /* cashier → 403 on close-check, close, report */ });
```

The race test must not be flaky: whichever wins, the invariant holds. Run it 5 times locally (`for i in 1 2 3 4 5; do pnpm --filter @rpos/api test:e2e -- day-close -t race; done`).

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `DayCloseService` + `requireOpen` lock + routes (put `close-check` and the list route before `:id` routes in the controller). **Step 4: Run** `pnpm --filter @rpos/api test:e2e` (full) → PASS.
- [ ] **Step 5: Commit** `feat(day): close the business day with a cash tally, report and owner reopen`.

---

## After the last task

- Full suite: `pnpm typecheck && pnpm test && pnpm --filter @rpos/api test:e2e && pnpm format:check`.
- Final whole-branch review (fresh reviewer), fix pass, ledger, overnight notes, merge `feat/m3a-billing-api` to main.
- M3b (separate plan): POS bill panel and print template, discount dialog with override, payment pad with split, void, move/merge UI, day-close screen with report print, bill packaging setting field, realtime `bill.updated` invalidation, restore drill verification (spec §6.4 "restore tested at M3").
