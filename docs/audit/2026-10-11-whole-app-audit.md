# Whole-app audit, 11 Oct 2026: what to improve before selling to many restaurants

This report combines three audits, each run read-only, with evidence in each file:

- **Ease of use:** [`2026-10-11-ux-audit.md`](2026-10-11-ux-audit.md). 33 findings (8 High, 18 Medium, 7 Low).
- **Operations, revenue and cash flow:** [`2026-10-11-operations-money-audit.md`](2026-10-11-operations-money-audit.md).
  - 14 money-logic issues (3 High, 7 Medium, 4 Low).
  - An 81-row comparison with Indian restaurant POS products: 26 Have, 14 Partial, 40 Missing, 1 not needed.
- **Selling to many restaurants:** [`2026-10-11-productization-audit.md`](2026-10-11-productization-audit.md). 21 areas, 8 of them Red.

## Verdict

**The core is strong.**
- **Ordering and billing are fast:**
  - A dine-in order takes about 4 taps plus 1 per dish.
  - Settling takes 3 taps, with keyboard keys and live change.
- **Money handling is correct:**
  - Amounts are stored in paise.
  - Discounts are spread across lines exactly, and GST is charged after the discount.
  - Invoice numbers have no gaps within a financial year.
- **Risky actions are controlled:** voids, cancels after a KOT and large discounts all need a manager PIN, a reason and an audit entry.
- **Data is already kept per restaurant**, which is a good base for selling to many.

**Four things stop it being sellable today:**

1. **GST safety:**
   - A new restaurant defaults to "Regular GST" with no GSTIN, so an unregistered client could print tax invoices and collect GST illegally.
   - Composition-scheme bills lack the legally required wording.
2. **Cash-flow control:**
   - UPI and card are confirmed with one tap and no check.
   - Day close shows the expected cash before staff count it.
   - Cash expenses and reprints are not audited.
   - There is no credit for regulars, so staff will record fake payments.
3. **Running it as a vendor:**
   - No sign-up or provisioning for new clients.
   - No error alerts, release process or client billing.
   - No terms or privacy policy (India's DPDP Act).
4. **Staff day-to-day:**
   - The waiter phone screen hides "Send to kitchen".
   - There are no sounds anywhere.
   - English only.
   - Kitchen text is too small to read from 2 m.
   - Billing stops when the internet drops.

## Fix first: Phase 1, about 2 weeks ("safe to sell")

| # | Item | Why | Size |
| --- | --- | --- | --- |
| 1 | **GST scheme safety:** default to "Not registered", require a GSTIN for Regular and Composition, correct bill titles and the composition declaration | Clients' legal risk | S |
| 2 | **Bill print fixes:** quantity × rate per line, lines that add up to the subtotal, SAC 996331, optional customer GSTIN | Bills that look like overcharging; B2B guests | S |
| 3 | **Blind day close:** count by notes (₹500 × n …), expected cash shown only after counting, reason or manager PIN above a variance threshold | Cash theft control | S–M |
| 4 | **Reprint control:** "REPRINT #n" on copies, audit every reprint, reason required for a KOT reprint | A common fraud pattern | S |
| 5 | **Cash movements:** pay-in, pay-out and cash drop with manager PIN and audit, plus a petty-cash limit | Drawer accountability | M |
| 6 | **Payment-mode correction** (same day, audited), plus a **UPI QR with the amount filled in**, on screen and on the bill, and an optional transaction-reference capture | Wrong-mode payments and fake UPI | M |
| 7 | **GST report by invoice date** (B2C rate-wise, HSN summary, invoice series), plus a bill-wise register in Excel/CSV | GSTR-1 filing; fixes the month-boundary error | M |
| 8 | **Reason chips** for discount, void, cancel and complimentary, with reports by staff and reason | Faster for staff and visible to owners | S |

## Phase 2, about 2–4 weeks ("staff love it")

- **Captain bottom bar** on phones: "3 new · ₹540 · Send to kitchen".
- **Sounds and vibration** for a new kitchen ticket, a new QR order and "food ready", with a volume setting.
- **Kitchen screen:**
  - 24 px dishes and a "Large text" option.
  - 5-second **Undo** after Start or Ready.
  - Bigger Cancel and Reprint buttons.
  - A red banner when a print fails.
- **On the order screen:**
  - Long-press a dish to mark it **sold out** (greyed, not hidden).
  - Half/Full chosen right on the tile.
  - Short codes, and dish search that tolerates spelling mistakes.
- **Orders:**
  - Empty ₹0 orders close without a reason.
  - Guest count is optional.
- **Shared counters:** a "Switch staff" button and auto-lock.
- **Friendlier messages** where guests see "Some fields are not valid" or a Try again button that can't work.
- **Credit accounts for regulars**, settled monthly.

## Phase 3, about 4–6 weeks ("sell and run many clients")

**Decision:** one cloud system shared by all clients (multi-tenant), with each restaurant as a tenant, not one server per restaurant.

- **Why:**
  - The code already keeps each restaurant's data separate.
  - One server per restaurant costs about ₹1.5–2.5k a month per client, and a solo developer can't keep many of them running.
- **What to build:**
  - **Clients:** an `Organisation` model, a provisioning command (or a sign-up form), and stricter tenant isolation (database-level rules plus a test that checks every page and API call).
  - **Monitoring:** error reporting (Sentry or GlitchTip), uptime alerts, alerts when a backup fails, and a managed Postgres with point-in-time restore.
  - **Releases:** version tags, a changelog, migrations run as their own step after a backup, and one-command rollback.
  - **Client billing:** plans, a trial, a renewal date, and a gentle lock when unpaid (never in the middle of service).
- **Setting up a new restaurant:**
  - Menu import from Excel/CSV with a preview.
  - "Add tables T1–T20" in one go.
  - A setup wizard, aiming for **under an hour from sign-up to first bill**.
- **Legal pack:** terms, a DPDP privacy policy with a grievance contact, data-processing terms, and a refund policy.
- **Internet outages:**
  - Make a 4G backup router a condition of sale.
  - Write an "internet down" procedure.
  - Plan **offline billing** (needed for smaller towns).
- **Browser support:**
  - Test on old counter PCs: Chrome 109, the last version for Windows 7/8.1, breaks the styling.
  - Test on cheap Android phones.
  - Add the nginx security headers CSP and HSTS.

## Later (Phase 4+)

- **Hindi and regional languages:**
  - A language setting per device.
  - A "local name" for dishes.
  - A language switch on the QR menu.
- **Delivery apps:** Swiggy/Zomato integration and a delivery order type.
- **Food cost:** recipe-based stock deduction and food cost %, plus wastage.
- **People:** shifts and several cash drawers with handover, and staff attendance.
- **Owner updates:** a daily WhatsApp summary and alerts.
- **More outlets:** multi-outlet owners with combined reports.
- **Customers:** customer data, loyalty and feedback; reservations and a waitlist.
- **New staff:** a practice (training) mode with first-sign-in walkthroughs.

## Demo hygiene before showing clients

- Close the business day that has been open since 7 Oct. It makes the kitchen show "Late · 13 h".
- Remove "Paneer Tikka (copy)".
- Rename the two devices both called "Kitchen".
- Revoke the "Manual screenshots" device.
