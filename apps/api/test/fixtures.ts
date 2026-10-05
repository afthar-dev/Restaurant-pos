import type { PrismaClient } from '@prisma/client';

/**
 * A small restaurant: two stations, GST 5%, one area with tables T1/T2, and items:
 * - Paneer Tikka (Starters → Kitchen): Half ₹180 / Full ₹320 (parcel ₹330, packaging ₹10),
 *   optional "Extras" (0–2): Cheese ₹30, Butter ₹20 (Butter out of stock)
 * - Tandoori Roti (Breads → Tandoor): Regular ₹30
 * - Masala Dosa: needs exactly one "Chutney" choice
 * - Veg Soup: out of stock
 * - Tikka Meal: combo of 1 × Paneer Tikka Half + 2 × Tandoori Roti
 */
export async function buildRestaurant(prisma: PrismaClient, outletId: string) {
  const kitchen = await prisma.station.create({ data: { outletId, name: 'Kitchen' } });
  const tandoor = await prisma.station.create({ data: { outletId, name: 'Tandoor' } });
  const gst5 = await prisma.taxRate.create({
    data: { outletId, name: 'GST 5%', cgstBp: 250, sgstBp: 250 },
  });
  const area = await prisma.area.create({ data: { outletId, name: 'AC Hall' } });
  const t1 = await prisma.diningTable.create({
    data: { outletId, areaId: area.id, name: 'T1', seats: 4, qrToken: `qr-${outletId}-1` },
  });
  const t2 = await prisma.diningTable.create({
    data: { outletId, areaId: area.id, name: 'T2', seats: 2, qrToken: `qr-${outletId}-2` },
  });

  const starters = await prisma.category.create({
    data: { outletId, name: 'Starters', stationId: kitchen.id },
  });
  const breads = await prisma.category.create({
    data: { outletId, name: 'Breads', stationId: tandoor.id },
  });

  const extras = await prisma.addonGroup.create({
    data: {
      outletId,
      name: 'Extras',
      minSelect: 0,
      maxSelect: 2,
      addons: {
        create: [
          { name: 'Cheese', price: 3000, sortOrder: 0 },
          { name: 'Butter', price: 2000, sortOrder: 1, isAvailable: false },
        ],
      },
    },
    include: { addons: { orderBy: { sortOrder: 'asc' } } },
  });
  const chutney = await prisma.addonGroup.create({
    data: {
      outletId,
      name: 'Chutney',
      minSelect: 1,
      maxSelect: 1,
      addons: {
        create: [
          { name: 'Coconut', price: 0, sortOrder: 0 },
          { name: 'Tomato', price: 0, sortOrder: 1 },
        ],
      },
    },
    include: { addons: { orderBy: { sortOrder: 'asc' } } },
  });

  const paneer = await prisma.item.create({
    data: {
      outletId,
      categoryId: starters.id,
      taxRateId: gst5.id,
      name: 'Paneer Tikka',
      foodType: 'VEG',
      variants: {
        create: [
          { name: 'Half', dineInPrice: 18000, parcelPrice: 18000, sortOrder: 0 },
          {
            name: 'Full',
            dineInPrice: 32000,
            parcelPrice: 33000,
            packagingCharge: 1000,
            sortOrder: 1,
          },
        ],
      },
      addonGroups: { create: [{ groupId: extras.id }] },
    },
    include: { variants: { orderBy: { sortOrder: 'asc' } } },
  });
  const roti = await prisma.item.create({
    data: {
      outletId,
      categoryId: breads.id,
      taxRateId: gst5.id,
      name: 'Tandoori Roti',
      foodType: 'VEG',
      variants: { create: [{ name: 'Regular', dineInPrice: 3000, parcelPrice: 3000 }] },
    },
    include: { variants: true },
  });
  const dosa = await prisma.item.create({
    data: {
      outletId,
      categoryId: starters.id,
      taxRateId: gst5.id,
      name: 'Masala Dosa',
      foodType: 'VEG',
      variants: { create: [{ name: 'Regular', dineInPrice: 12000, parcelPrice: 12000 }] },
      addonGroups: { create: [{ groupId: chutney.id }] },
    },
    include: { variants: true },
  });
  const soup = await prisma.item.create({
    data: {
      outletId,
      categoryId: starters.id,
      taxRateId: gst5.id,
      name: 'Veg Soup',
      foodType: 'VEG',
      isAvailable: false,
      variants: { create: [{ name: 'Regular', dineInPrice: 9000, parcelPrice: 9000 }] },
    },
    include: { variants: true },
  });
  const meal = await prisma.item.create({
    data: {
      outletId,
      categoryId: starters.id,
      taxRateId: gst5.id,
      name: 'Tikka Meal',
      foodType: 'VEG',
      isCombo: true,
      variants: { create: [{ name: 'Regular', dineInPrice: 25000, parcelPrice: 25000 }] },
      components: {
        create: [
          { variantId: paneer.variants[0]!.id, quantity: 1 },
          { variantId: roti.variants[0]!.id, quantity: 2 },
        ],
      },
    },
    include: { variants: true },
  });

  return {
    kitchen,
    tandoor,
    gst5,
    area,
    t1,
    t2,
    starters,
    breads,
    extras: { group: extras, cheese: extras.addons[0]!, butter: extras.addons[1]! },
    chutney: { group: chutney, coconut: chutney.addons[0]!, tomato: chutney.addons[1]! },
    paneer: { item: paneer, half: paneer.variants[0]!, full: paneer.variants[1]! },
    roti: { item: roti, regular: roti.variants[0]! },
    dosa: { item: dosa, regular: dosa.variants[0]! },
    soup: { item: soup, regular: soup.variants[0]! },
    meal: { item: meal, regular: meal.variants[0]! },
  };
}

export type Restaurant = Awaited<ReturnType<typeof buildRestaurant>>;
