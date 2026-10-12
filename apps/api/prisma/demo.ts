/**
 * Demo data for trying the app on a development database: a full menu, tables with QR stickers,
 * staff with PINs, stock, and six days of closed sales history (orders, bills, payments,
 * expenses) so the reports, charts and day close have something to show.
 *
 * Run: pnpm --filter @rpos/api db:demo
 *
 * It only adds data and refuses to run twice. Never run it on a real restaurant's database.
 * The sign-in details it creates are listed in docs/testing-guide.md.
 */
import { hash } from '@node-rs/argon2';
import { PrismaClient, type PaymentMode } from '@prisma/client';
import { ensureDefaultCategories } from '../src/expenses/expense-categories.service';
import { financialYear } from '../src/billing/financial-year';
import { randomToken } from '../src/common/crypto';

const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
const HISTORY_DAYS = 6;

/** Demo staff. Phones are fake; PINs and the manager password are for local testing only. */
export const DEMO_STAFF = [
  { name: 'Meena', phone: '9000000002', role: 'MANAGER', password: 'manager-demo-1', pin: '4321' },
  { name: 'Arun', phone: '9000000003', role: 'CASHIER', pin: '2468' },
  { name: 'Ravi', phone: '9000000004', role: 'WAITER', pin: '1357' },
  { name: 'Priya', phone: '9000000005', role: 'WAITER', pin: '8642' },
] as const;

type Dish = {
  name: string;
  type?: 'VEG' | 'NON_VEG' | 'EGG';
  description?: string;
  sizes: [string, number, number?][]; // name, dine-in ₹, parcel ₹ (defaults to dine-in)
  pack?: number; // packaging ₹ per parcel unit
  extras?: boolean;
};

const MENU: { name: string; station: string; dishes: Dish[] }[] = [
  {
    name: 'Starters',
    station: 'Kitchen',
    dishes: [
      {
        name: 'Paneer Tikka',
        description: 'Cottage cheese marinated in spiced yoghurt, char-grilled.',
        sizes: [
          ['Half', 180],
          ['Full', 320],
        ],
        extras: true,
      },
      {
        name: 'Chicken 65',
        type: 'NON_VEG',
        description: 'Crisp, fiery fried chicken with curry leaves.',
        sizes: [
          ['Half', 200],
          ['Full', 360],
        ],
      },
      {
        name: 'Gobi Manchurian',
        description: 'Cauliflower tossed in a tangy Indo-Chinese sauce.',
        sizes: [['Regular', 170]],
      },
      {
        name: 'Veg Spring Roll',
        description: 'Crisp rolls stuffed with vegetables.',
        sizes: [['Regular', 150]],
      },
      { name: 'Egg Bhurji', type: 'EGG', sizes: [['Regular', 120]] },
    ],
  },
  {
    name: 'Main Course',
    station: 'Kitchen',
    dishes: [
      {
        name: 'Butter Chicken',
        type: 'NON_VEG',
        description: 'Tandoori chicken in a rich tomato-butter gravy.',
        sizes: [
          ['Half', 260],
          ['Full', 440],
        ],
        pack: 10,
      },
      {
        name: 'Paneer Butter Masala',
        description: 'Paneer in a creamy tomato gravy.',
        sizes: [['Regular', 240]],
        pack: 10,
        extras: true,
      },
      {
        name: 'Dal Tadka',
        description: 'Yellow lentils tempered with garlic and cumin.',
        sizes: [['Regular', 160]],
        pack: 10,
      },
      { name: 'Kadai Veg', sizes: [['Regular', 200]], pack: 10 },
      { name: 'Mutton Rogan Josh', type: 'NON_VEG', sizes: [['Regular', 380]], pack: 10 },
    ],
  },
  {
    name: 'Biryani',
    station: 'Kitchen',
    dishes: [
      {
        name: 'Chicken Biryani',
        type: 'NON_VEG',
        description: 'Dum-cooked basmati with chicken, raita on the side.',
        sizes: [
          ['Half', 220],
          ['Full', 340],
        ],
        pack: 15,
      },
      {
        name: 'Veg Biryani',
        sizes: [
          ['Half', 180],
          ['Full', 280],
        ],
        pack: 15,
      },
      { name: 'Egg Biryani', type: 'EGG', sizes: [['Regular', 230]], pack: 15 },
    ],
  },
  {
    name: 'Breads',
    station: 'Tandoor',
    dishes: [
      { name: 'Tandoori Roti', sizes: [['Regular', 30]] },
      { name: 'Butter Naan', sizes: [['Regular', 50]], extras: true },
      { name: 'Garlic Naan', sizes: [['Regular', 70]], extras: true },
      { name: 'Laccha Paratha', sizes: [['Regular', 60]] },
    ],
  },
  {
    name: 'Drinks',
    station: 'Bar',
    dishes: [
      { name: 'Masala Chai', sizes: [['Regular', 30]] },
      { name: 'Sweet Lassi', sizes: [['Regular', 80]] },
      { name: 'Fresh Lime Soda', sizes: [['Regular', 70]] },
      { name: 'Mineral Water', sizes: [['1 litre', 30]] },
    ],
  },
  {
    name: 'Desserts',
    station: 'Kitchen',
    dishes: [
      { name: 'Gulab Jamun', sizes: [['2 pieces', 70]] },
      { name: 'Kulfi', sizes: [['Regular', 90]] },
    ],
  },
];

const AREAS: { name: string; tables: [string, number][] }[] = [
  {
    name: 'Ground floor',
    tables: [
      ['T1', 4],
      ['T2', 4],
      ['T3', 2],
      ['T4', 2],
      ['T5', 6],
      ['T6', 4],
      ['T7', 4],
      ['T8', 8],
    ],
  },
  {
    name: 'Terrace',
    tables: [
      ['R1', 4],
      ['R2', 4],
      ['R3', 2],
      ['R4', 6],
    ],
  },
];

const STOCK: [string, string, number, number][] = [
  // name, unit, on hand, alert at (in whole units)
  ['Onion', 'kg', 3, 5],
  ['Tomato', 'kg', 8, 4],
  ['Paneer', 'kg', 1.5, 2],
  ['Chicken', 'kg', 9, 4],
  ['Basmati rice', 'kg', 24, 10],
  ['Milk', 'L', 6, 5],
  ['Cooking oil', 'L', 12, 5],
  ['Butter', 'kg', 2, 1],
];

/** Same numbers on every run, so the guide can describe what you will see. */
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1_103_515_245 + 12_345) % 2_147_483_648;
    return s / 2_147_483_648;
  };
}

const rupees = (r: number) => Math.round(r * 100);

/** Midnight UTC of the India date `daysAgo` days before today. */
function istDate(daysAgo: number): Date {
  const ist = new Date(Date.now() + IST_OFFSET_MS - daysAgo * DAY_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}

/** A moment on an India date at the given India time. */
const at = (date: Date, hour: number, minute: number) =>
  new Date(date.getTime() + (hour * 60 + minute) * 60_000 - IST_OFFSET_MS);

export async function loadDemo(prisma: PrismaClient): Promise<string[]> {
  const notes: string[] = [];
  const outlet = await prisma.outlet.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });
  const owner = await prisma.user.findFirst({
    where: { outletId: outlet.id, role: 'OWNER', archivedAt: null },
  });
  if (!owner) throw new Error('Create the owner first: pnpm --filter @rpos/api db:seed');
  if (await prisma.category.findFirst({ where: { outletId: outlet.id, name: 'Main Course' } })) {
    throw new Error('Demo data is already loaded (there is a "Main Course" category).');
  }

  // --- Restaurant details ---
  if (outlet.name.trim().toLowerCase() === 'main outlet') {
    await prisma.outlet.update({
      where: { id: outlet.id },
      data: {
        name: 'Spice Garden',
        address: '12, MG Road, Bengaluru 560001',
        phone: '08041234567',
        gstin: '29ABCDE1234F1Z5',
        taxScheme: 'REGULAR',
        billFooter: 'Thank you! Visit again.',
      },
    });
    notes.push('Restaurant details filled in (Spice Garden).');
  }

  // --- Kitchen stations ---
  const stations = new Map<string, string>();
  for (const name of new Set(MENU.map((c) => c.station))) {
    const station =
      (await prisma.station.findFirst({
        where: { outletId: outlet.id, name, archivedAt: null },
      })) ?? (await prisma.station.create({ data: { outletId: outlet.id, name } }));
    stations.set(name, station.id);
  }

  const tax = await prisma.taxRate.findFirstOrThrow({
    where: { outletId: outlet.id, archivedAt: null },
    orderBy: { createdAt: 'asc' },
  });

  // --- Add-ons ---
  const extras = await prisma.addonGroup.create({
    data: {
      outletId: outlet.id,
      name: 'Extras',
      minSelect: 0,
      maxSelect: 2,
      addons: {
        create: [
          { name: 'Extra cheese', price: rupees(30), sortOrder: 0 },
          { name: 'Extra butter', price: rupees(20), sortOrder: 1 },
        ],
      },
    },
  });

  // --- Menu ---
  type Sellable = {
    itemId: string;
    variantId: string;
    itemName: string;
    variantName: string;
    dineIn: number;
    parcel: number;
    pack: number;
    stationId: string;
    category: string;
  };
  const sellable: Sellable[] = [];
  let dishes = 0;
  for (const [categoryIndex, c] of MENU.entries()) {
    const stationId = stations.get(c.station)!;
    const category =
      (await prisma.category.findFirst({
        where: { outletId: outlet.id, name: c.name, archivedAt: null },
      })) ??
      (await prisma.category.create({
        data: { outletId: outlet.id, name: c.name, stationId, sortOrder: categoryIndex },
      }));
    for (const [dishIndex, d] of c.dishes.entries()) {
      const existing = await prisma.item.findFirst({
        where: { categoryId: category.id, name: d.name, archivedAt: null },
        include: { variants: { where: { archivedAt: null } } },
      });
      const item =
        existing ??
        (await prisma.item.create({
          data: {
            outletId: outlet.id,
            categoryId: category.id,
            taxRateId: tax.id,
            name: d.name,
            description: d.description ?? null,
            foodType: d.type ?? 'VEG',
            sortOrder: 100 + dishIndex,
            variants: {
              create: d.sizes.map(([name, dineIn, parcel], index) => ({
                name,
                dineInPrice: rupees(dineIn),
                parcelPrice: rupees(parcel ?? dineIn),
                packagingCharge: rupees(d.pack ?? 0),
                sortOrder: index,
              })),
            },
            ...(d.extras
              ? { addonGroups: { create: [{ groupId: extras.id, sortOrder: 0 }] } }
              : {}),
          },
          include: { variants: true },
        }));
      if (!existing) dishes += 1;
      for (const v of item.variants) {
        sellable.push({
          itemId: item.id,
          variantId: v.id,
          itemName: item.name,
          variantName: v.name,
          dineIn: v.dineInPrice,
          parcel: v.parcelPrice,
          pack: v.packagingCharge,
          stationId,
          category: c.name,
        });
      }
    }
  }
  notes.push(`${dishes} dishes in ${MENU.length} categories, with an "Extras" add-on group.`);

  // --- Tables ---
  const tables: string[] = [];
  if ((await prisma.diningTable.count({ where: { outletId: outlet.id } })) === 0) {
    for (const [areaIndex, a] of AREAS.entries()) {
      const area = await prisma.area.create({
        data: { outletId: outlet.id, name: a.name, sortOrder: areaIndex },
      });
      for (const [name, seats] of a.tables) {
        const table = await prisma.diningTable.create({
          data: { outletId: outlet.id, areaId: area.id, name, seats, qrToken: randomToken() },
        });
        tables.push(table.id);
      }
    }
    notes.push('12 tables in two areas, each with its own QR sticker.');
  } else {
    tables.push(
      ...(
        await prisma.diningTable.findMany({ where: { outletId: outlet.id, archivedAt: null } })
      ).map((t) => t.id),
    );
  }

  // --- Staff ---
  const staffIds: Record<string, string> = {};
  for (const s of DEMO_STAFF) {
    const existing = await prisma.user.findUnique({ where: { phone: s.phone } });
    const user =
      existing ??
      (await prisma.user.create({
        data: {
          outletId: outlet.id,
          name: s.name,
          phone: s.phone,
          role: s.role,
          pinHash: await hash(s.pin),
          ...('password' in s ? { passwordHash: await hash(s.password) } : {}),
        },
      }));
    staffIds[s.name] = user.id;
  }
  notes.push('Staff: a manager, a cashier and two waiters (PINs in the guide).');

  // --- Stock ---
  for (const [name, unit, onHand, alertAt] of STOCK) {
    if (await prisma.stockItem.findFirst({ where: { outletId: outlet.id, name } })) continue;
    await prisma.stockItem.create({
      data: {
        outletId: outlet.id,
        name,
        unit,
        currentMilli: Math.round(onHand * 1000),
        minLevelMilli: Math.round(alertAt * 1000),
      },
    });
  }
  notes.push(`${STOCK.length} stock items (Onion and Paneer are low).`);

  // --- Sales history ---
  await ensureDefaultCategories(prisma, outlet.id);
  const expenseCategory = async (name: string) =>
    (await prisma.expenseCategory.findFirst({ where: { outletId: outlet.id, name } }))?.id ??
    (await prisma.expenseCategory.findFirstOrThrow({ where: { outletId: outlet.id } })).id;
  const gas = await expenseCategory('Gas');
  const other = await expenseCategory('Other');

  const random = seededRandom(20261008);
  const pick = <T>(list: T[]) => list[Math.floor(random() * list.length)]!;
  const cashierId = staffIds.Arun!;
  const waiters = [staffIds.Ravi!, staffIds.Priya!];
  // Bill numbers continue from the app's BILL counter, and the counter is moved past them at
  // the end, so bills made in the app afterwards do not reuse a demo bill's number.
  const fyNext = new Map<string, number>();
  const nextBillNo = async (fy: string) => {
    if (!fyNext.has(fy)) {
      const last = await prisma.bill.aggregate({
        where: { outletId: outlet.id, financialYear: fy },
        _max: { billNo: true },
      });
      const counter = await prisma.counter.findUnique({
        where: { outletId_key_period: { outletId: outlet.id, key: 'BILL', period: fy } },
      });
      fyNext.set(fy, Math.max(last._max.billNo ?? 0, counter?.value ?? 0) + 1);
    }
    const n = fyNext.get(fy)!;
    fyNext.set(fy, n + 1);
    return n;
  };
  // Lunch and dinner rushes, a quiet afternoon.
  const HOURS = [12, 12, 13, 13, 13, 14, 14, 15, 16, 17, 19, 19, 20, 20, 20, 21, 21, 21, 22, 22];

  let daysAdded = 0;
  let billsAdded = 0;
  for (let daysAgo = HISTORY_DAYS; daysAgo >= 1; daysAgo -= 1) {
    const date = istDate(daysAgo);
    const sameDate = await prisma.businessDay.findFirst({
      where: { outletId: outlet.id, openedAt: { gte: at(date, 0, 0), lt: at(date, 24, 0) } },
    });
    if (sameDate) continue;

    const weekend = [0, 6].includes(date.getUTCDay());
    const openingCash = rupees(2000);
    const day = await prisma.businessDay.create({
      data: {
        outletId: outlet.id,
        status: 'CLOSED',
        openingCash,
        openedById: owner.id,
        openedAt: at(date, 10, 30),
        closedById: owner.id,
        closedAt: at(date, 23, 20),
      },
    });

    let cashSales = 0;
    const orders = (weekend ? 30 : 20) + Math.floor(random() * 8);
    for (let o = 0; o < orders; o += 1) {
      const hour = pick(HOURS);
      const created = at(date, hour, Math.floor(random() * 50));
      const parcel = random() < 0.3;
      const lines = Array.from({ length: 2 + Math.floor(random() * 3) }, () => ({
        dish: pick(sellable),
        quantity: random() < 0.75 ? 1 : 2,
      }));
      const order = await prisma.order.create({
        data: {
          outletId: outlet.id,
          businessDayId: day.id,
          type: parcel ? 'PARCEL' : 'DINE_IN',
          source: parcel ? 'POS' : pick(['POS', 'CAPTAIN', 'CAPTAIN'] as const),
          status: 'CLOSED',
          tableId: parcel ? null : pick(tables),
          tokenNo: parcel ? o + 1 : null,
          guests: parcel ? null : 2 + Math.floor(random() * 3),
          waiterId: parcel ? null : pick(waiters),
          createdById: cashierId,
          createdAt: created,
          closedAt: new Date(created.getTime() + 45 * 60_000),
        },
      });

      const billLines: {
        orderItemId: string;
        line: (typeof lines)[number];
        unitPrice: number;
        packaging: number;
        taxable: number;
        cgst: number;
        sgst: number;
      }[] = [];
      for (const line of lines) {
        const unitPrice = parcel ? line.dish.parcel : line.dish.dineIn;
        const orderItem = await prisma.orderItem.create({
          data: {
            orderId: order.id,
            itemId: line.dish.itemId,
            variantId: line.dish.variantId,
            itemName: line.dish.itemName,
            variantName: line.dish.variantName,
            unitPrice,
            packagingCharge: parcel ? line.dish.pack : 0,
            taxRateId: tax.id,
            cgstBp: tax.cgstBp,
            sgstBp: tax.sgstBp,
            quantity: line.quantity,
            stationId: line.dish.stationId,
            status: 'SENT',
            createdById: cashierId,
            createdAt: created,
          },
        });
        const packaging = parcel ? line.dish.pack * line.quantity : 0;
        const taxable = unitPrice * line.quantity + packaging;
        billLines.push({
          orderItemId: orderItem.id,
          line,
          unitPrice,
          packaging,
          taxable,
          cgst: Math.round((taxable * tax.cgstBp) / 10_000),
          sgst: Math.round((taxable * tax.sgstBp) / 10_000),
        });
      }

      const sum = (f: (l: (typeof billLines)[number]) => number) =>
        billLines.reduce((n, l) => n + f(l), 0);
      const gross = sum((l) => l.unitPrice * l.line.quantity);
      const packaging = sum((l) => l.packaging);
      const taxable = sum((l) => l.taxable);
      const cgst = sum((l) => l.cgst);
      const sgst = sum((l) => l.sgst);
      const exact = taxable + cgst + sgst;
      const total = Math.round(exact / 100) * 100;
      const billedAt = new Date(created.getTime() + 35 * 60_000);
      const fy = financialYear(billedAt);
      const bill = await prisma.bill.create({
        data: {
          outletId: outlet.id,
          businessDayId: day.id,
          orderId: order.id,
          billNo: await nextBillNo(fy),
          financialYear: fy,
          status: 'PAID',
          taxScheme: outlet.taxScheme,
          grossSubtotal: gross,
          itemDiscount: 0,
          subtotal: gross,
          packaging,
          taxable,
          cgst,
          sgst,
          roundOff: total - exact,
          total,
          paidAt: new Date(billedAt.getTime() + 5 * 60_000),
          createdById: cashierId,
          createdAt: billedAt,
          items: {
            create: billLines.map((l, index) => ({
              orderItemId: l.orderItemId,
              itemName: l.line.dish.itemName,
              variantName: l.line.dish.variantName,
              unitPrice: l.unitPrice,
              quantity: l.line.quantity,
              packagingPerUnit: l.packaging / l.line.quantity,
              cgstBp: tax.cgstBp,
              sgstBp: tax.sgstBp,
              gross: l.unitPrice * l.line.quantity,
              itemDiscount: 0,
              lineTotal: l.unitPrice * l.line.quantity,
              billDiscountShare: 0,
              packaging: l.packaging,
              taxable: l.taxable,
              cgst: l.cgst,
              sgst: l.sgst,
              sortOrder: index,
            })),
          },
        },
      });
      const roll = random();
      const mode: PaymentMode = roll < 0.55 ? 'UPI' : roll < 0.9 ? 'CASH' : 'CARD';
      const tendered = mode === 'CASH' ? Math.ceil(total / 50_000) * 50_000 : null;
      await prisma.payment.create({
        data: {
          outletId: outlet.id,
          billId: bill.id,
          businessDayId: day.id,
          mode,
          amount: total,
          tendered,
          change: tendered === null ? null : tendered - total,
          receivedById: cashierId,
          createdAt: new Date(billedAt.getTime() + 5 * 60_000),
        },
      });
      if (mode === 'CASH') cashSales += total;
      billsAdded += 1;
    }

    const expenses: [string, number, string][] = [
      [gas, rupees(900 + Math.floor(random() * 4) * 50), 'Cylinder refill'],
      [other, rupees(180), 'Staff tea and snacks'],
    ];
    for (const [categoryId, amount, note] of expenses) {
      await prisma.expense.create({
        data: {
          outletId: outlet.id,
          businessDayId: day.id,
          categoryId,
          amount,
          mode: 'CASH',
          note,
          createdById: owner.id,
          createdAt: at(date, 16, 0),
        },
      });
    }
    const cashExpenses = expenses.reduce((n, [, amount]) => n + amount, 0);
    const expectedCash = openingCash + cashSales - cashExpenses;
    const variance = daysAgo === 3 ? -rupees(50) : 0;
    await prisma.businessDay.update({
      where: { id: day.id },
      data: {
        expectedCash,
        countedCash: expectedCash + variance,
        variance,
        closeNote: variance ? 'Short by ₹50, change given twice' : null,
      },
    });
    daysAdded += 1;
  }
  for (const [fy, next] of fyNext) {
    await prisma.counter.upsert({
      where: { outletId_key_period: { outletId: outlet.id, key: 'BILL', period: fy } },
      create: { outletId: outlet.id, key: 'BILL', period: fy, value: next - 1 },
      update: { value: next - 1 },
    });
  }
  notes.push(`${daysAdded} closed days of sales history with ${billsAdded} paid bills.`);
  return notes;
}

if (require.main === module) {
  const prisma = new PrismaClient();
  loadDemo(prisma)
    .then((notes) => {
      console.log('Demo data loaded:');
      for (const note of notes) console.log(`  - ${note}`);
      console.log('Sign-in details: docs/testing-guide.md');
      return prisma.$disconnect();
    })
    .catch(async (error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
