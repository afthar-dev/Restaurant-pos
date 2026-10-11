# Operations and money audit: readiness to sell to Indian restaurants

Date: 11 Oct 2026. Scope: restaurant operations, revenue and billing logic, cash flow, reports and
controls, judged against how small and medium Indian restaurants run and against Petpooja, Posist,
DotPe, UrbanPiper and Square for Restaurants. The audit was read-only. Every claim below was checked
in code (file:line) or in a screenshot in `docs/user-manual/images/`. Items fixed after the
10 Oct audit (`2026-10-10-audit-report.md`, `code-audit-2026-10-10.md`) are not repeated here.

---

## 1. Executive summary

**The core is sound.** The order → KOT → bill → payment → day-close spine is careful work:

- Money is held in integer paise and every bill amount comes from one pure calculator
  (`apps/api/src/billing/bill-calc.ts`).
- Item and bill discounts are allocated exactly, and GST is charged after the discount.
- Round-off goes to the nearest rupee and is stored.
- Invoice numbers are gap-free per financial year (`bills.service.ts:88-89`,
  `schema.prisma:780`), and a voided bill keeps its number.
- Cancelling a dish after its KOT, and voiding a bill, each need a manager (directly or by PIN
  override), a reason and an audit entry. A cashier discount above the cap needs a manager too.
- Day close blocks open work, works out the expected drawer cash and records the variance.

For the original single-restaurant brief (spec §1.2), that is a good v1.

**As a product sold to many restaurants, it is not ready yet.** The gaps fall into three groups:

1. **GST compliance traps that will hurt real customers.**
   - A new outlet defaults to *Regular* GST with no GSTIN, so an unregistered restaurant prints
     "Tax Invoice" and collects GST it may not collect.
   - The composition-scheme bill misses the wording the law requires on it.
   - GST figures follow the business day's opening date, not the invoice date.
   - There is no HSN/SAC summary or invoice-series summary for GSTR-1.
2. **Cash-flow realities that are not modelled:**
   - credit / house accounts (*udhaar*), which day close actively prevents (every bill must be
     paid);
   - cash drops, pay-ins and pay-outs other than expenses;
   - shifts and cashier handover, and per-cashier accountability;
   - UPI verification (a dynamic QR, or at least "pending");
   - correcting a payment's mode, and partial refunds.
3. **Fraud controls with soft spots:**
   - Bills and KOTs can be reprinted without limit, without a log and without a
     DUPLICATE/REPRINT mark.
   - The cashier sees the expected cash before counting the drawer (no blind count), and a
     variance needs no explanation.
   - Cashiers can post unlimited cash "expenses" with no approval or audit entry.
   - There are no preset reason codes, so void, discount and NC reports cannot be analysed.

Missing modules that buyers in India treat as standard, and ask about in the first demo:

- Swiggy/Zomato orders (UrbanPiper-style) and channel-wise pricing.
- A delivery order type.
- Customer phone capture, CRM and loyalty.
- Recipe-based stock consumption and food cost %.
- A WhatsApp daily summary to the owner.
- Staff/waiter-wise sales.
- A bill-wise sales register and GST export.
- Offline billing.
- Reservations or a waitlist.

**Counts:**

- 14 money-logic issues: 0 Critical, 3 High, 7 Medium, 4 Low.
- 81 gap rows: Have 26, Partial 14, Missing 40, plus 1 "not needed" (e-invoice / e-way bill).

**Recommendation.** Spend the next two weeks on the compliance and control fixes in §4 Tier 1.
They are small, and each one removes a reason a CA or a restaurant owner would reject the product.
Then build credit accounts, shifts/cash movements, aggregator orders and recipe costing. Those
four are what make a buyer switch from Petpooja.

---

## 2. Money-logic issues (bugs or wrong rules)

Severity reflects harm when the product runs at many restaurants, not the single demo outlet.

### H-1. A new outlet charges GST by default, even with no GSTIN (High)

**Evidence:**

- `schema.prisma:54-55`: `gstin String?`, `taxScheme @default(REGULAR)`.
- `outlet.service.ts:99-101` writes settings with no cross-check.
- `bill-calc.ts:115` taxes every line whenever the scheme is `REGULAR`.
- `print.service.ts:182` titles the bill "Tax Invoice".
- The Settings hint says "Leave empty if not registered" (`SettingsPage.tsx:153`), but leaves the
  scheme on Regular.

**Impact:**

- An unregistered dhaba or café that follows that hint collects 5% "GST" on every bill.
- Section 32 of the CGST Act forbids an unregistered person to collect tax. The restaurant is
  liable to pay over the amount collected and to a penalty.
- Customers also complain, as consumer forums see often.

**Fix:**

- Default `taxScheme` to `NONE` until a GSTIN is entered.
- Refuse `REGULAR` or `COMPOSITION` without a valid GSTIN (API and UI).
- On first setup, ask "Are you GST registered? Regular / Composition / Not registered".
- Show a red banner when the scheme and GSTIN disagree.

### H-2. The composition-scheme bill lacks the mandatory declaration (High)

**Evidence:**

- `print.service.ts:182` sets the title "Bill of Supply".
- `billTicket.ts:136-155` prints no composition wording.

**Impact:**

- CGST Rule 5(1)(g) requires the words **"composition taxable person, not eligible to collect tax
  on supplies"** at the top of every bill of supply. Many small restaurants (turnover under
  ₹1.5 crore) are on composition.
- Every bill printed is non-compliant, and an inspection notices this first.
- The `NONE` scheme also prints "Bill of Supply", a GST document title, for a business outside
  GST.

**Fix:**

- COMPOSITION: print "Bill of Supply" plus the declaration line under it.
- NONE: print "Bill" or "Cash Memo", with no GST wording.
- Add a test for each scheme.

### H-3. A UPI or card payment is recorded on one tap, with no check that the money arrived (High)

**Evidence:**

- `payments.service.ts:79-92` stores the payment, and `reference` is optional.
- The screen is a single "Confirm ₹32 by UPI" button (screenshot `22-pay-upi.png`).
- There is no UPI QR on the bill and no PENDING state.

**Impact:**

- Fake or edited UPI payment screenshots and "payment pending" scams are a top loss source for
  Indian counters.
- A cashier can also mark a cash sale as UPI and keep the cash. The drawer still balances, so the
  loss only appears at bank reconciliation, which small owners rarely do.
- UPI settlement and card settlement cannot be reconciled per day: there is no reference, no
  terminal and no settlement batch.

**Fix:**

- Short term:
  - Print a static UPI QR (outlet VPA + amount as a `upi://pay` link) on the bill and on the
    customer-facing screen.
  - Require the last 4–6 digits of the UTR (optional per outlet).
  - Add a daily "UPI by reference" list for matching against the bank or PSP statement.
- Medium term: a dynamic QR with webhook confirmation (Razorpay, PhonePe or Paytm for Business),
  marking the payment `PENDING → CONFIRMED`.

### M-1. Monthly GST totals follow the business day's opening date, not the invoice date (Medium)

**Evidence:**

- `sales-report.service.ts:65-70` selects business days by `opened_at` date and sums every bill
  in them.
- Bills carry their own `createdAt`, which is the invoice date printed on them (`billTicket.ts:77`).

**Impact:**

- A day opened on 31 Oct that runs to 1:30 am puts 1 Nov invoices into October's "This month" and
  "Last month" figures.
- GSTR-1 and GSTR-3B are filed by invoice date, so the accountant's totals will not match the
  printed invoices.
- On 31 March the FY counter resets mid-day, so the year boundary splits across two reports.

**Fix:** keep the business-day views for operations, but add a **GST / tax report** grouped by
`bills.created_at AT TIME ZONE 'Asia/Kolkata'` (invoice date), filtered by calendar month.

### M-2. The printed bill's line amounts do not add up to its Subtotal when a dish is discounted (Medium)

**Evidence:**

- `print.service.ts:211` prints each line's `amount` as `lineTotal` (after the item discount).
- `billTicket.ts:104` prints "Subtotal" as `grossSubtotal` (before the item discount).
- `billTicket.ts:102-109` then subtracts item + bill discount again.
- The on-screen bill marks the line "₹x off" (`BillView.tsx:96-103`); the paper does not.

**Impact:**

- The total is right, but the customer's own sum of the lines is lower than the printed Subtotal.
  That looks like double charging.
- This causes table disputes, and it is the kind of thing that ends up in a consumer-forum
  complaint.

**Fix:** print `gross` per line (qty × rate) and keep one Discount row. Alternatively, print the
line's discount under it. Also print the rate (unit price) column, which Indian bills normally
show.

### M-3. Day close shows the expected cash before the count, and a variance needs no explanation (Medium)

**Evidence:**

- `closeCheck` returns `expected` (`day-close.service.ts:33-51`), and the Day close screen shows
  "Expected in drawer" above the "Counted cash" box (`30-day-close.png`).
- `closeDaySchema.note` is optional (`packages/shared/src/billing.ts:68-71`).
- The screenshot shows a day closed with **+₹10,000 variance** and no note.

**Impact:**

- A cashier who can see the expected figure types it in, and shortages disappear.
- The industry practice is a blind count with denominations, then the system reveals the variance.

**Fix:**

- Blind close for cashiers: enter denominations (₹500 / 200 / 100 / 50 / 20 / 10 / coins), then
  show the variance.
- Require a reason when |variance| > ₹X (an outlet setting), and a manager PIN when it is above a
  higher threshold.
- Add a variance-by-person report.

### M-4. Cashiers can post unlimited cash expenses with no approval or audit entry (Medium)

**Evidence:**

- `auth.ts:39` gives CASHIER `expense.manage`.
- `expenses.service.ts:38-85` creates the expense with no cap, no approval and no `audit.record`.
  Only voids are audited (`:148-158`).
- Cash expenses reduce the expected drawer cash (`expense-totals.ts:36-42`).

**Impact:**

- "Petty cash" is the classic leak: ₹200 "vegetables" or "auto fare" a few times a day closes the
  drawer exactly while cash goes missing.
- Purchases also allow cash payouts to any free-text vendor.

**Fix:**

- Add a per-outlet petty-cash limit per entry and per day for cashiers. Above it, a manager PIN
  override (the existing `OverrideService`).
- Audit every creation.
- Optionally require a bill photo (the media module exists).

### M-5. Bill and KOT reprints are unlimited, unlogged and unmarked (Medium)

**Evidence:**

- `bills.service.ts:469-472` reprints under `bill.print` with no audit.
- The payload has no copy or reprint flag (`print.service.ts:180-235`).
- KOT reprint is open to any `order.take` user (`kots.controller.ts:79-80`), with no audit, and
  the ticket is identical to the original (`kots.service.ts:466-471`, `print.service.ts:76-97`).

**Impact:**

- **KOT reprint** is the known kitchen fraud: a reprinted KOT makes the dish again for "staff" or
  for an unbilled guest.
- **Bill reprint** before payment allows the pattern "show the customer a printed bill, collect,
  then void or reprint".

**Fix:**

- Print "REPRINT #n" or "DUPLICATE" with time and user.
- Store a reprint count per bill and per KOT, and audit each reprint.
- Restrict KOT reprint to captain-plus-manager, or require a reason.
- Add a reprint report.

### M-6. A wrong payment mode can only be fixed by voiding the bill (Medium)

**Evidence:**

- There is no endpoint to change or delete a payment.
- `payments.service.ts` only adds payments. `bills.service.ts:258-338` (void) is the only way back.

**Impact:**

- A cashier who taps Cash instead of UPI must void a paid bill: manager, new invoice number,
  voided invoice on the GST record.
- So staff either accept a wrong cash/UPI split, which causes variances and failed bank
  reconciliation, or create voids that pollute the void report and the invoice series.

**Fix:** add "Change payment mode" on a paid bill, the same business day only, with a manager PIN
or cashier-within-N-minutes rule. Audit before and after. The bill number does not change.

### M-7. Voiding a paid bill marks every payment refunded at once; there are no partial refunds (Medium)

**Evidence:**

- `bills.service.ts:306-309` sets `refundedAt` on all payments of the bill in the same transaction.

**Impact:**

- A UPI or card refund is not instant in reality: it goes through the PSP or terminal.
- A ₹50 partial refund (cold dish, missing item after payment) is impossible. Staff must void the
  whole bill and re-bill.
- There is no credit-note concept. Under GST, an adjustment to a paid tax invoice is a credit note
  (Section 34).

**Fix:**

- Add a refund entity with mode, amount, reference and status, plus partial refunds.
- For a REGULAR outlet, issue a credit-note number series (`CN/2026-27/n`) and show it in the GST
  report.

### M-8. The composition outlet's reports call its turnover "No GST / exempt sales" (Medium)

**Evidence:** `gst-summary.ts:55-58` turns every line of a non-REGULAR bill into an exempt line.
The Reports and Day screens then label it "No GST sales".

**Impact:**

- A composition restaurant pays 5% (2.5 + 2.5) of its turnover from its own pocket, quarterly in
  CMP-08.
- The report shows that turnover as exempt and gives no tax payable. The owner under-provisions,
  and the accountant re-computes by hand.

**Fix:** for a COMPOSITION outlet, show "Composition turnover" and "Composition tax payable (5%)"
per quarter. Keep "exempt" for genuinely nil-rated lines and for the NONE scheme.

### M-9. Day close cannot complete with an unpaid bill, which forces fake payments (Medium)

**Evidence:** the `blockers` check in `day-close.service.ts:64-71` throws `DAY_HAS_OPEN_WORK`
while any bill is unpaid. There is no "credit" payment mode (`schema.prisma:726-730`).

**Impact:**

- Credit is routine in India: regulars and nearby offices on monthly *khata*, a party paying
  tomorrow, a hotel guest posting to the room.
- With no credit mode, staff record a fake "Cash" or "UPI" payment so they can close. The drawer
  then shows a shortage and the receivable is not tracked anywhere.

**Fix:** add `CREDIT` (on account) as a settlement mode linked to a customer account. Credit sales
count in sales but not in collected, and an accounts-receivable ledger takes later receipts. Those
receipts are drawer cash on the day they are received. See the gap table.

### L-1. "Split equally" can produce shares with paise, which cannot be paid in cash (Low)

**Evidence:** `billing.ts:78-86` returns paise-level shares, for example ₹100 / 3 =
₹33.34 + ₹33.33 + ₹33.33.

**Impact:** a cashier cannot take ₹33.33 in cash.

**Fix:** split in whole rupees and put the remainder on the first share.

### L-2. The bill omits the SAC code and B2B fields (Low)

**Evidence:** `billTicket.ts:136-155` prints no SAC 996331 (restaurant service) and has no field
for the customer's name, GSTIN or address.

**Impact:**

- For B2C restaurant bills this is mostly fine.
- Corporate diners ask for a GST bill in the company's name. Today the cashier cannot produce one,
  so the business goes to a POS that can.
- The SAC is needed for the HSN summary in GSTR-1.

**Fix:** an optional "Bill to (name, GSTIN, address)" on the bill, and SAC printed in the footer.

### L-3. The reports show no complimentary, staff-meal or NC figures, because they are discounts with free text (Low)

**Evidence:**

- A 100% discount settles the bill (`bills.service.ts:458-459`).
- `discountReason` is free text (`DiscountSheet.tsx:169`).

**Impact:**

- The owner cannot see "NC ₹4,200 this month, mostly by manager X".
- Free-text reasons ("ok", "regular", "sir") cannot be grouped.

**Fix:**

- Add preset reason codes per outlet (Complimentary, Staff meal, Owner guest, Food complaint,
  Loyalty, Coupon, Other + text).
- Add a dedicated NC / staff-meal order type with an approver. Its GST treatment is configurable:
  NC billed at ₹0, or cost recorded.

### L-4. Discount caps are only per bill (Low)

**Evidence:** `bills.service.ts:412-414` checks the cap per bill against `grossSubtotal`.

**Impact:**

- There is no daily total cap per cashier and no item-level exclusion (for example, no discount on
  alcohol or on MRP items).
- Coupons and happy hours do not exist.

**Fix:** add a daily discount budget per role. Add MRP / no-discount flags on items (packaged
water and cold drinks are sold at MRP and must not exceed it).

---

## 3. Gap analysis vs a typical Indian restaurant POS

Status: **Have** / **Partial** / **Missing**. Importance for a small or medium restaurant:
**Must** / **Should** / **Nice**. Effort: **S** up to 3 days, **M** 1–3 weeks, **L** more than
3 weeks.

### 3.1 Revenue and billing

| Feature | Status | Imp. | Effort | Evidence / recommendation |
|---|---|---|---|---|
| CGST/SGST split, rate-wise breakup on the bill | Have | Must | — | `bill-calc.ts:141-157`, `billTicket.ts:112-115`. IGST is not needed for dine-in or takeaway (intra-state). |
| Composition / unregistered schemes | Partial | Must | S | No tax is charged (`bill-calc.ts:115`). Fix H-1, H-2, M-8. |
| GSTIN and FSSAI on the bill | Have | Must | — | `billTicket.ts:89-90`. Validate GSTIN when the scheme needs it (H-1). |
| Invoice number per FY, gap-free, ≤16 characters | Have | Must | — | `2026-27/123`, `financial-year.ts`, unique index `schema.prisma:780`. Add an optional outlet prefix for multi-outlet chains under one GSTIN. |
| Duplicate / reprint marking | Missing | Must | S | M-5. |
| E-invoice (IRN) / e-way bill | Not needed | — | — | E-invoicing covers B2B for turnover over ₹5 crore and B2C invoices are outside it. E-way bills are for goods movement. Say so in sales material. Revisit IRN only for large chains doing B2B catering. |
| HSN/SAC on bill and in summary | Missing | Should | S | L-2. SAC 996331, needed for GSTR-1 Table 12. |
| B2B bill (customer name, GSTIN) | Missing | Should | S | L-2. |
| Service charge (optional, removable, off by default) | Missing | Should | S | The CCPA guidelines (4 Jul 2022), upheld by the Delhi HC in 2025, bar automatic or mandatory service charge. Build it as an opt-in % that the cashier can remove, printed as "Service charge (optional)", with GST applied on it. Never default it on. |
| Round-off to the rupee | Have | Must | — | `bill-calc.ts:139`, stored and printed. |
| Item and bill discounts, cap, manager override, reason | Have | Must | — | `bills.service.ts:354-463`, audited. |
| Discount reason codes, coupons, daily caps | Missing | Should | S–M | L-3, L-4. |
| Complimentary / NC / staff meal | Partial | Should | S | A 100% discount works but cannot be reported (L-3). |
| Tips | Missing | Nice | S | A tip line on card/UPI, kept outside sales and GST, with a payout report per staff member. |
| Packaging charge (per item and per parcel) | Have | Must | — | `schema.prisma:66,377`, taxed with the dish. Packaging for goods sold at MRP must not exceed the MRP. |
| Delivery charge | Missing | Should | S | Comes with the delivery order type. |
| Price per channel (dine-in / parcel / Swiggy / Zomato / delivery) | Partial | Must | M | Dine-in and parcel prices only (`schema.prisma:375-376`). Generalise to a price book per channel. Aggregator menus are usually 10–20% higher. |
| Happy hours / time-based pricing / combos | Partial | Nice | M | Combos exist (`ComboComponent`). Add time-window price rules. |
| Split bill (by item and equally) | Have | Must | — | `createBillSchema.lines`, `splitEqually`. Equal shares need L-1. |
| MRP items (water, soft drinks) | Missing | Should | S | No discount, no packaging, and no price above MRP (Legal Metrology). |

### 3.2 Cash flow

| Feature | Status | Imp. | Effort | Evidence / recommendation |
|---|---|---|---|---|
| Opening cash, expected vs counted, variance | Have | Must | — | `day-close.service.ts`. Make it blind with denominations (M-3). |
| Cash drops / pay-in / pay-out (non-expense) | Missing | Must | S | Cash removed to the safe mid-day, owner top-up, change float. Add `CashMovement {IN, OUT, DROP}` with a reason and a manager PIN, included in expected cash. |
| Petty cash with limits | Partial | Must | S | Expenses exist but are uncapped and unaudited (M-4). |
| Shifts and cashier handover | Missing | Must | M | One drawer per outlet per day. Add a shift (open float, X-report, blind count, handover) per counter/drawer. `Payment.receivedById` already exists, so a "collected by" report is a quick win. |
| Multiple counters / drawers | Missing | Should | M | Comes with shifts (drawer = device + shift). |
| Waiter cash collection accountability | Partial | Should | S | Waiters can collect (`auth.ts:63`), but no report lists the cash each person holds. |
| UPI QR on bill / dynamic QR / pending state | Missing | Must | S → M | H-3. |
| Card settlement reconciliation | Missing | Should | M | Record the terminal/TID and batch. Add a daily card total vs settlement report. |
| Credit / house accounts (*khata*) | Missing | Must | M | M-9. Customer account, credit limit, monthly statement over WhatsApp, receipts against it. |
| Advance / deposit for parties and bookings | Missing | Should | M | A receipt against a booking that is adjusted on the final bill. Count it as cash in on its own day. |
| Refunds (partial, by mode) and credit notes | Partial | Should | M | Only full refunds, by void (M-7). |
| Change payment mode | Missing | Must | S | M-6. |
| Expenses vs purchases | Have | Must | — | Purchases create a "Raw material" expense (`schema.prisma:913,943`). |
| Vendor master, credit purchases, payables | Missing | Should | M | Purchases are "paid at once" (`schema.prisma:1015`). Most restaurants buy on 7–30-day credit from vegetable, meat and dairy vendors. Add vendors, unpaid purchases and payment entries. |
| Bank deposit entry | Missing | Nice | S | Part of cash movements. |

### 3.3 Operations

| Feature | Status | Imp. | Effort | Evidence / recommendation |
|---|---|---|---|---|
| Table lifecycle, move, merge, running status | Have | Must | — | `table-moves.service.ts`, `10-pos-floor.png`, `14/15-*.png`. |
| Reservations / waitlist | Missing | Nice | M | Weekend waitlist with an SMS/WhatsApp "table ready" message. |
| KOT routing per station, print + KDS | Have | Must | — | `kots.service.ts:99-110`, `print.service.ts:72-74`. |
| Cancel KOT with manager, reason, cancel ticket | Have | Must | — | `kots.service.ts:175-269`. Add reason codes and a wastage flag (food already made). |
| Course firing / hold-and-fire | Missing | Nice | M | Starters now, mains on "fire". |
| Kitchen timing / SLA | Partial | Should | S | Late after 20 min (`age.ts:16`), `readyAt`/`servedAt` stored, but no prep-time report per station or dish. |
| Item availability (86) | Have | Must | — | `isAvailable`, `41-availability.png`. |
| Recipes and auto stock deduction | Missing | Must | L | Spec chose "no recipe deduction" (`schema.prisma:970`). Theoretical vs actual consumption is Petpooja's top inventory feature, and needed for food cost %. |
| Wastage entry | Missing | Should | S | `StockTxnType` has only PURCHASE/ADJUST/COUNT (`schema.prisma:963-968`). Add WASTAGE with a reason. |
| Purchase orders to vendors | Missing | Nice | M | After the vendor master. |
| Low-stock alerts | Have | Should | — | `minLevelMilli` (`schema.prisma:977`). |
| Staff roles and permissions | Have | Must | — | `auth.ts`. A fixed role matrix; per-outlet custom roles are Nice. |
| Attendance / shifts / commissions | Missing | Nice | M | PIN clock-in on the POS is cheap. Waiter incentive per item is common in bars. |
| Customer data / CRM | Missing | Must | M | No phone capture (spec v2). Phone on parcel, delivery and bill gives repeat-visit data and the WhatsApp e-bill (paperless, popular in metros). |
| Loyalty / feedback | Missing | Should | M | Points or cashback; a QR feedback link on the bill. |
| Swiggy / Zomato integration | Missing | Must | L | Not in spec. Integrate through an aggregator middleware (UrbanPiper, or the Petpooja/Posist-style direct APIs where the brand qualifies): order inject → KOT, accept/ready, menu and stock sync, commission and TDS/TCS in reports. Aggregators pay GST on these orders (Section 9(5)), so the POS must record them as "GST paid by e-commerce operator" and not charge GST again. |
| Own delivery management | Missing | Should | M | DELIVERY order type, address, rider assignment, cash-on-delivery settlement per rider. |
| Multi-terminal real-time | Have | Must | — | Realtime events; captain, POS and KDS. |
| Offline billing | Missing | Must | L | Spec §7.2 relies on a 4G backup. Internet drops are common in tier-2/3 cities, and an outage at dinner rush loses a customer for good. At least a local-server mode or offline queue for billing is needed. |
| Printer per station, bill printer | Have | Must | — | `Printer.stationId/purpose`. |
| Cash drawer kick, ESC/POS, silent printing | Missing | Should | M | Browser printing only (spec §1.2 #14). The print agent (v2) should send ESC/POS, kick the drawer (`ESC p`) on cash payment, and log drawer opens with no sale. |
| QR table ordering with approval | Have | Should | — | `apps/qr`, `90-93-*.png`. Ahead of many competitors. |

### 3.4 Reports

| Feature | Status | Imp. | Effort | Evidence / recommendation |
|---|---|---|---|---|
| Daily summary / Z-report | Have | Must | — | Day report (`day-close.service.ts:report`), `31-past-day-report.png`. Add a printable 80 mm Z-report and a mid-shift X-report. |
| Item-wise, category-wise, hour-wise | Have | Must | — | `sales-report.service.ts:245-294`. |
| Staff / waiter / cashier-wise sales | Missing | Should | S | `Order.waiterId`, `Bill.createdById` and `Payment.receivedById` exist. Only a query and a table are needed. |
| Discount / void / cancel / NC report over a range | Partial | Must | S | Lists exist per day only (`day-close.service.ts:454-471`). Add a range report grouped by person and reason code. |
| GST report (GSTR-1 ready) | Partial | Must | S | Rate-wise B2CS exists. Add invoice-date periods (M-1), an HSN/SAC summary (Table 12), a document summary (Table 13: series, from–to, count, cancelled) and B2B rows. |
| Bill-wise sales register export | Missing | Must | S | Accountants and Tally need bill no, date, taxable, CGST, SGST, total and mode. Only Days and Dishes CSV exist (`ReportsPage.tsx:24-42`). |
| Payment reconciliation (UPI/card by reference) | Missing | Should | S | H-3. |
| P&L, food cost %, gross margin | Missing | Should | M | "After expenses" (`sales-report.service.ts:203`) is cash-basis only. Food cost % needs recipes or at least purchases vs sales by category. |
| Month view / comparison | Partial | Should | S | Range presets exist (`60-reports.png`). Add month-vs-last-month and same-day-last-week. |
| Excel / PDF exports | Partial | Should | S | CSV only. Add XLSX and PDF of the day report. |
| WhatsApp / email daily summary to owner | Missing | Must | S–M | Owners in India expect the night-close WhatsApp. Send it on `day.close` through the WhatsApp Business API (Gupshup, Interakt, AiSensy) or email first. |
| Cash variance history by person | Missing | Should | S | Variances exist per day only. |

### 3.5 Controls and fraud prevention

| Feature | Status | Imp. | Effort | Evidence / recommendation |
|---|---|---|---|---|
| Cancel / void after KOT needs a manager, with reason and audit | Have | Must | — | `kots.service.ts:246-262,312-323`. |
| Bill void needs a manager, with reason and audit; number kept | Have | Must | — | `bills.service.ts:258-338`. |
| Reprint control | Missing | Must | S | M-5. |
| Discount abuse controls | Partial | Must | S | Per-bill cap only (L-3, L-4). |
| Blind cash count and variance accountability | Missing | Must | S | M-3. |
| Petty-cash approval | Missing | Must | S | M-4. |
| Audit log coverage | Partial | Should | S | Bills, voids, cancels, discounts, day, menu, tax, users, outlet and devices are covered. Expense creation, reprints, payment edits, stock adjustments and price overrides are not. |
| Manager approval by PIN override | Have | Must | — | `OverrideService`, single-use tokens (`schema.prisma:217`). |
| Per-role permissions | Have | Must | — | `auth.ts:36-65`. Make the matrix configurable per outlet. Some owners let managers see reports; the cap per role is a setting. |
| Owner alerts (void, large discount, variance) | Missing | Should | S | A push or WhatsApp to the owner when a void goes over ₹X or the variance over ₹Y. |
| Bill must exist before payment; no unsent dishes billed | Have | Must | — | `bills.service.ts:65-71`. |
| Report access owner-only | Have | Must | — | `reports.controller.ts:9`. |

---

## 4. Recommended roadmap

Prioritised by client benefit: legal risk first, then daily cash leaks, then reasons a buyer
chooses another POS.

### Tier 1: next 2 weeks (compliance and controls, all S)

1. **GST scheme safety (H-1, H-2):**
   - Default to NONE.
   - Require a GSTIN for Regular and Composition.
   - Print the composition declaration and the correct bill titles.
2. **Bill print fixes (M-2, L-2):**
   - Lines at qty × rate, plus a rate column.
   - SAC 996331 on the bill.
   - Optional B2B "Bill to" with the customer's GSTIN.
3. **Reprint control (M-5):**
   - "DUPLICATE / REPRINT #n" on bills and KOTs.
   - Every reprint audited.
   - KOT reprint needs a reason; the report shows reprints.
4. **Blind day close with denominations (M-3):** the variance needs a reason above a threshold.
5. **Petty-cash limits, plus cash drops / pay-ins / pay-outs (M-4):** with PIN override and audit.
6. **Change payment mode on a paid bill (M-6):** same day, audited.
7. **UPI QR on the printed bill:** UTR capture as an option, and a UPI/card reference list for
   reconciliation (H-3, short term).
8. **GST report by invoice date (M-1, M-8):**
   - B2CS by rate, HSN summary, document summary.
   - Composition turnover and tax payable.
   - A bill-wise sales register CSV/XLSX.
9. **Reason codes for discount, void, cancel and NC, with a range report by person and reason
   (L-3).**
10. **Staff-wise sales and "cash collected by" report:** the data already exists.

### Tier 2: next 2 months (cash flow and the modules buyers ask for)

1. **Credit / house accounts (M-9):** customer accounts, credit limit, receipts, statement.
   Day close then allows bills settled "on account".
2. **Shifts and multiple drawers:** open float, X-report, handover with blind count, variance by
   cashier.
3. **Customer phone capture and CRM basics:** visit history, WhatsApp e-bill, birthday list.
   Then simple loyalty (points or cashback) and a feedback link.
4. **WhatsApp or email daily summary** on day close, plus owner alerts for big voids, discounts
   and variances.
5. **Swiggy / Zomato orders through an integration partner:**
   - aggregator order type and price book;
   - commission and Section 9(5) GST treatment in reports;
   - auto-accept to KOT.
6. **Delivery order type:** address, delivery charge, rider, cash-on-delivery settlement.
7. **Refund entity and credit notes (M-7):** partial refunds and the credit-note series in the GST
   report.
8. **Vendor master and credit purchases (payables),** plus a WASTAGE stock transaction.
9. **Print agent with ESC/POS:** silent printing, cash drawer kick, logging of drawer opens with
   no sale.
10. **Split-equally in whole rupees, MRP items, daily discount budgets (L-1, L-4).**

### Tier 3: later (scale and differentiation)

1. **Recipes and auto stock deduction:** theoretical vs actual consumption, food cost %, P&L by
   category.
2. **Offline billing:** a local server or an offline-capable POS with sync. This is essential
   before selling in tier-2/3 cities.
3. **Dynamic UPI QR / payment gateway** with webhook confirmation; card terminal integration (Pine
   Labs, Paytm EDC).
4. **Multi-outlet SaaS:** tenant isolation (`User.phone` is globally unique,
   `schema.prisma:103`), central menu, outlet comparison and invoice prefix per outlet.
5. **Reservations and waitlist; course firing; KDS prep-time analytics.**
6. **Attendance and waiter commissions; configurable role matrix.**
7. **Happy hours and time-based pricing; coupons.**
8. **Tally / Zoho Books export; GSTR-1 JSON.**
9. **Regional language UI** (Hindi, Tamil, Telugu, and others) for staff screens.

---

## Appendix: verified correct (no action)

- Bill maths, discount and packaging allocation, round-off, No-GST lines: `bill-calc.ts`.
- Overpayment refused; change excluded from cash sales; idempotent payments:
  `payments.service.ts:69-103`.
- Voided bills keep their number and leave the sales, cash and GST figures; refunds count on the
  void day: `bills.service.ts:298-309`, `day-close.service.ts:325-355`.
- Expected cash = opening + cash sales − cash refunds − cash expenses, identical on the close
  check, the close and the report: `day-close.service.ts:33-51,163-167,421`.
- Day reopen is owner-only, the latest day only, audited with the replaced figures:
  `day-close.service.ts:110-176`.
- Order items snapshot price and tax rate when ordered, so later menu or tax edits never change
  open orders: `orders.service.ts:444`, `schema.prisma:602-608`.
