-- CreateEnum
CREATE TYPE "StockTxnType" AS ENUM ('PURCHASE', 'PURCHASE_VOID', 'ADJUST', 'COUNT');

-- CreateTable
CREATE TABLE "stock_items" (
    "id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "min_level_milli" INTEGER NOT NULL DEFAULT 0,
    "current_milli" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stock_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_txns" (
    "id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "stock_item_id" UUID NOT NULL,
    "type" "StockTxnType" NOT NULL,
    "qty_milli" INTEGER NOT NULL,
    "amount" INTEGER,
    "purchase_id" UUID,
    "note" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_txns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "business_day_id" UUID NOT NULL,
    "vendor_name" TEXT NOT NULL,
    "bill_ref" TEXT,
    "paid_mode" "PaymentMode" NOT NULL,
    "total" INTEGER NOT NULL,
    "note" TEXT,
    "created_by_id" UUID NOT NULL,
    "voided_at" TIMESTAMPTZ(3),
    "voided_by_id" UUID,
    "void_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_lines" (
    "id" UUID NOT NULL,
    "purchase_id" UUID NOT NULL,
    "stock_item_id" UUID NOT NULL,
    "qty_milli" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "purchase_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_items_outlet_id_idx" ON "stock_items"("outlet_id");

-- CreateIndex
CREATE INDEX "stock_txns_stock_item_id_created_at_idx" ON "stock_txns"("stock_item_id", "created_at");

-- CreateIndex
CREATE INDEX "purchases_business_day_id_idx" ON "purchases"("business_day_id");

-- CreateIndex
CREATE INDEX "purchases_outlet_id_created_at_idx" ON "purchases"("outlet_id", "created_at");

-- CreateIndex
CREATE INDEX "purchase_lines_purchase_id_idx" ON "purchase_lines"("purchase_id");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_txns" ADD CONSTRAINT "stock_txns_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_txns" ADD CONSTRAINT "stock_txns_stock_item_id_fkey" FOREIGN KEY ("stock_item_id") REFERENCES "stock_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_txns" ADD CONSTRAINT "stock_txns_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_txns" ADD CONSTRAINT "stock_txns_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_business_day_id_fkey" FOREIGN KEY ("business_day_id") REFERENCES "business_days"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_voided_by_id_fkey" FOREIGN KEY ("voided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_stock_item_id_fkey" FOREIGN KEY ("stock_item_id") REFERENCES "stock_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- One active stock item per name (case-insensitive).
CREATE UNIQUE INDEX "stock_items_active_name" ON "stock_items" ("outlet_id", lower("name")) WHERE "archived_at" IS NULL;
