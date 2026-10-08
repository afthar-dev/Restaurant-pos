# Testing guide

How to load demo data on your computer and try every part of the app with it.

> The demo data is for a **development database only**. Never load it on a real restaurant's
> database. The phones, PINs and passwords below are fake and only work on your computer.

## 1. Start everything

You need Docker Desktop running. Then, from the project folder:

```bash
docker compose up -d --wait postgres
```

Run each of these in its own terminal and leave them running:

```bash
pnpm --filter @rpos/api dev
pnpm --filter @rpos/web dev
pnpm --filter @rpos/qr dev
```

| App | Address |
| --- | --- |
| Staff app (POS, captain, kitchen, back office) | http://localhost:5173 |
| Customer QR menu | http://localhost:5174/qr/?t=… (see section 6) |
| API health check | http://localhost:3000/api/health |

## 2. Load the demo data

```bash
pnpm --filter @rpos/api db:demo
```

It adds, without deleting anything:

- **Restaurant details**: the outlet is renamed *Spice Garden*, with an address, phone, GSTIN and
  bill footer.
- **Menu**: 22 dishes in 6 categories (Starters, Main Course, Biryani, Breads, Drinks, Desserts).
  Some have Half/Full sizes, some have a packing charge for parcels, and the breads have an
  *Extras* add-on group (extra cheese, extra butter).
- **Tables**: Ground floor T1–T8 and Terrace R1–R4, each with its own QR sticker.
- **Staff**: a manager, a cashier and two waiters (below).
- **Stock**: 8 items. Onion and Paneer are below their reorder level.
- **Sales history**: about a week of closed days (skipping any day that already has a business
  day), with dine-in and parcel bills, UPI/cash/card payments, gas and other expenses, and one
  day where the cash count was ₹50 short.

It refuses to run a second time. To start over you would have to reset the database
(`pnpm --filter @rpos/api exec prisma migrate reset`), which **deletes everything** in it,
then seed and load the demo again.

## 3. Sign-in details

| Who | Role | Phone | Password | PIN |
| --- | --- | --- | --- | --- |
| You (owner) | Owner | `OWNER_PHONE` in `apps/api/.env` | `OWNER_PASSWORD` in `apps/api/.env` | `OWNER_PIN` in `apps/api/.env` |
| Meena | Manager | 9000000002 | `manager-demo-1` | 4321 |
| Arun | Cashier | 9000000003 | – | 2468 |
| Ravi | Waiter | 9000000004 | – | 1357 |
| Priya | Waiter | 9000000005 | – | 8642 |

- **Password sign-in** (owner, manager): http://localhost:5173/login.
- **PIN sign-in** (everyone) only works on a *registered device*. Sign in as the owner, open
  **Admin → Devices**, choose what the browser is used for (POS, captain or kitchen) and press
  **Register this device**. After that, signing out takes you to the PIN screen, where staff
  pick their name and enter their PIN.

Tip: to try two people at once (say a waiter and the cashier), use a normal window and a private
window. Register each one as a device.

## 4. Things to try

Most service screens need an **open business day**. If none is open, the POS asks you to open
one with the cash in the drawer.

### POS counter (owner, manager or Arun)

1. **POS** → pick a table (for example T3) → add dishes. Try a Half/Full dish and a naan with an
   extra.
2. **Send to kitchen** → the order appears on the kitchen screen.
3. **Settle** → print the bill → take payment by cash (enter what the customer handed over to
   see the change), UPI or card, or split it across two.
4. Start a **New parcel** order and see the packing charge added.

### Captain (Ravi or Priya, on a phone-sized window)

1. **Captain** → choose a table → add dishes → send.
2. Watch the order show up on the POS and the kitchen screen at the same time.

### Kitchen screen

1. Register a window as a **kitchen** device, or open **Kitchen** as the owner.
2. Mark tickets as preparing and ready; the captain and POS see the change straight away.

### Dish availability

**Availability** → mark a dish as out of stock. It disappears from the captain, POS and QR menus
until you turn it back on.

### Reports and charts

**Reports** → **Last 7 days**. You should see sales by day (the weekend is busiest), busiest
hours (lunch and dinner), how customers paid (mostly UPI), top dishes, expenses and the net.
**Days CSV** and **Dishes CSV** download the same figures.

### Day close

**Day close** → count the cash. The screen shows what the drawer should hold (opening cash + cash
sales − cash expenses) and the difference. Past closed days, including the ₹50 short one, are
listed there too.

### Stock and expenses

- **Stock** → Onion and Paneer are flagged as low. Record a purchase under **Stock → Purchases**
  and watch the level go up.
- **Expenses** → add a gas or vegetables expense paid in cash; it lowers the expected cash at
  day close.

### Menu editing (owner or manager)

**Admin → Menu**:

- Edit a dish, change a price, or add a size.
- **Reorder** categories and dishes by dragging, or with the Move up / Move down buttons.
- **Change prices**: raise a category by 5%, rounded to ₹5, and check the preview before
  saving.
- **Photos**: open a dish → add a photo. It is shrunk in the browser before upload. Without
  Cloudflare R2 settings, photos are stored in `apps/api/uploads/`.

### Setup guide

**Setup guide** lists what a new restaurant still has to do. With the demo loaded most steps are
already done; the remaining ones link straight to the right screen.

## 5. Staff, tables and settings

- **Admin → Staff**: add a person, reset a PIN, or deactivate someone (they are signed out).
- **Admin → Tables**: add a table, print QR stickers, or replace a sticker that was lost or
  copied (the old one stops working).
- **Admin → Settings**: restaurant name, address, GSTIN and bill footer, as printed on bills.
- **Admin → Audit**: who changed what, including the demo's own changes.

## 6. Customer QR ordering

Printed stickers point at the live address, so on your computer use this instead (the qr dev
server must be running):

```bash
pnpm --filter @rpos/api db:qr-links
```

It prints one link per table. Open one in a phone-sized window:

1. Browse the menu (dishes with photos show a thumbnail), add dishes and send the order.
2. The customer sees *Waiting for the staff to confirm*. On the POS, the table shows a
   **QR order waiting for approval**. Approve it and it goes to the kitchen like any other
   order; reject it and the customer's phone shows it was not accepted.

## 7. Automated tests

```bash
pnpm test
pnpm --filter @rpos/api test:e2e
```

The e2e suite uses its own test database, so it never touches your demo data. One of its tests
loads the demo data and checks that the report totals add up.
