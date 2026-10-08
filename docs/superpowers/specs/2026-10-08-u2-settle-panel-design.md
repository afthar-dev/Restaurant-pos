# U2 — Settle panel (faster payment)

Part of the UI/UX programme: U1 design system (done), **U2 service speed**, U3 back office and
onboarding, U4 QR app. The user chose to spend U2 on **taking payment**, in both flows the
restaurant uses: dine-in bills go to the table and are paid later at the counter; parcels and
walk-ins are billed and paid at once.

## 1. Purpose

Today an open bill shows **Take payment**, which opens a dialog with mode, amount, split, cash
received and reference fields. The common case (whole bill, one mode) still means opening and
closing a dialog, and the change for cash is easy to miss.

**Success looks like:**
- Whole-bill UPI or card: 2 taps from the bill (mode, confirm). Exact cash: 2 taps. Cash with
  change: 3 taps, with the change shown large before confirming.
- No dialog for the common case. Splits, part payments and references stay available.
- A mis-tapped mode never records a payment: every payment needs a second, explicit confirm
  that names the amount and mode.
- Parcel: from **Send & bill** to paid without leaving the screen.
- No API change. No double recording on retries or double taps.

**Out of scope:** correcting a recorded payment, receipts after payment, a payments queue
screen, partial-payment UI changes (the existing sheet handles them).

## 2. Decisions

| Question | Choice |
|---|---|
| Focus | Taking payment (user). |
| Flows | Both pay-later (dine-in) and pay-now (parcel, walk-in) (user). |
| Mis-tap safety | Confirm with a second tap (user). No undo timer, no API change. |
| Placement | Inline panel on the open bill, replacing the Take payment button (approach A). |
| Advanced cases | "Split or part payment" link opens the existing `PaymentSheet` unchanged. |
| Keyboard | C / U / K pick a mode, Enter confirms, Esc goes back; only when focus is not in a text field. |

## 3. Behaviour

### 3.1 Panel states

`SettlePanel` renders for a bill with `status === 'OPEN'` when the user has `payment.take`.

- **Choose:** heading "Bill {n} · {due} due". Three buttons, at least 56 px tall: **Cash**,
  **UPI**, **Card**, each with a small key hint (C, U, K). Below: link button **Split or part
  payment**.
- **Confirm (UPI / Card):** one primary button "Confirm {due} by UPI" (or Card), and
  **Back**. No reference field (the sheet has it).
- **Confirm (Cash):** primary button "Confirm {due} cash" and **Back**. Above it, a "Cash
  received" group: **Exact** (selected by default), up to three suggested notes, and an
  **Other** money input.
  - With a tendered amount ≥ due the confirm reads "Confirm {due} cash · change {change}" and
    the change is shown in large type.
  - With a typed amount below due, the confirm is disabled and the panel says
    "{short} more needed".
  - Exact sends no `tendered`; a note or typed amount sends `tendered`.

### 3.2 Suggested notes

`suggestNotes(due)` returns up to three amounts strictly greater than `due`, ascending,
de-duplicated, from: the next multiple of ₹50, the next multiple of ₹100, the next multiple of
₹500, ₹500, ₹2,000. Example: due ₹1,170 → ₹1,200, ₹1,500, ₹2,000. Due ₹40 → ₹50, ₹100, ₹500.

### 3.3 Recording

- Confirm calls the existing `useAddPayment(bill).pay({ mode, amount: bill.due, tendered? })`.
  The hook keeps one idempotency key until success, so a retry after an error cannot record
  twice; it also ignores a second call while one is in flight.
- While sending: confirm shows a spinner and is disabled; Back is disabled.
- Error: inline `ErrorNote` under the confirm; tapping Confirm again retries.
- Success: `onPaid(updated)` as today (the workspace shows "Bill n paid. T4 is free." and returns
  to the floor). If the bill is still open (it never is for a whole-bill payment, but a
  concurrent payment could change that) the panel returns to **Choose**.

### 3.4 Staying correct with other devices

- When `bill.due` changes (another device took a part payment), the panel returns to
  **Choose**, so nobody confirms a stale amount.
- When the bill is no longer open, the panel is not rendered.

### 3.5 Focus and scrolling

- When a bill is created on this screen (Bill or Send & bill), its Settle panel scrolls into view
  and focus moves to **Cash**.
- Entering Confirm moves focus to the confirm button; Back returns focus to the mode button
  that was chosen.

### 3.6 Keyboard

A `keydown` listener on `document`, active while a panel is mounted, ignored when the event
target is an input, textarea, select or contenteditable, or a modifier key is held, or a dialog
is open (`[role=dialog]` in the document):
- `c`, `u`, `k` → choose Cash / UPI / Card (in Choose state).
- `Enter` → confirm (in a Confirm state, only if the confirm button is enabled). Focused
  buttons keep their native Enter behaviour.
- `Escape` → Back (in a Confirm state).
Only one panel is open at a time in practice (one open bill per order); if several mount, the
most recently mounted one owns the keys.

### 3.7 Who sees it

Same gate as the old button: `payment.take`. Cashiers on the POS; waiters on the captain app
when the outlet lets waiters collect payment. Void stays next to it unchanged.

## 4. Code

- `features/billing/settle.ts` — `suggestNotes(due)` and `cashOutcome(due, tendered)`
  (`{ change } | { short }`), pure and unit tested.
- `features/billing/components/SettlePanel.tsx` — the panel.
- `features/billing/components/BillActions.tsx` — render `SettlePanel` instead of the Take
  payment button; the sheet opens from the panel's link.
- `features/billing/components/BillArea.tsx` — after creating a bill, mark it "just created" so
  the panel scrolls into view and focuses Cash.
- `PaymentSheet` unchanged.

## 5. Tests

- `settle.test.ts`: note suggestions (examples above, ₹0 edge, exact multiples), change and
  short.
- `SettlePanel.test.tsx`:
  - UPI → Confirm posts `{ mode: 'UPI', amount: due }`.
  - Back after choosing records nothing.
  - Cash Exact posts no `tendered`; a ₹2,000 note posts `tendered` and shows the change.
  - Typed cash below due disables Confirm and shows the shortfall.
  - Error then retry reuses the same `Idempotency-Key`.
  - Due changing resets to Choose.
  - Keys C / U / K, Enter, Escape; keys ignored while typing in a field.
  - Split or part payment opens the existing sheet.
  - No axe violations.
- Workspace flow (existing payment tests updated): parcel → Send & bill → UPI → Confirm → paid
  note → back to floor.
- Existing `payment.test.tsx` cases that drive the sheet open it through the new link.
