-- CreateEnum
CREATE TYPE "BillStatus" AS ENUM ('OPEN', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('CASH', 'UPI', 'CARD');

-- CreateEnum
CREATE TYPE "DiscountKind" AS ENUM ('FLAT', 'PERCENT');

-- AlterTable
ALTER TABLE "business_days" ADD COLUMN     "close_note" TEXT,
ADD COLUMN     "counted_cash" INTEGER,
ADD COLUMN     "expected_cash" INTEGER,
ADD COLUMN     "variance" INTEGER;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "merged_into_id" UUID;

-- AlterTable
ALTER TABLE "outlets" ADD COLUMN     "bill_packaging_charge" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "bills" (
    "id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "business_day_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "bill_no" INTEGER NOT NULL,
    "financial_year" TEXT NOT NULL,
    "status" "BillStatus" NOT NULL DEFAULT 'OPEN',
    "tax_scheme" "TaxScheme" NOT NULL,
    "gross_subtotal" INTEGER NOT NULL,
    "item_discount" INTEGER NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "discount_kind" "DiscountKind",
    "discount_value" INTEGER,
    "bill_discount" INTEGER NOT NULL DEFAULT 0,
    "discount_reason" TEXT,
    "discount_by_id" UUID,
    "bill_packaging" INTEGER NOT NULL DEFAULT 0,
    "packaging" INTEGER NOT NULL,
    "taxable" INTEGER NOT NULL,
    "cgst" INTEGER NOT NULL,
    "sgst" INTEGER NOT NULL,
    "round_off" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "paid_at" TIMESTAMPTZ(3),
    "void_reason" TEXT,
    "voided_by_id" UUID,
    "voided_at" TIMESTAMPTZ(3),
    "created_by_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_items" (
    "id" UUID NOT NULL,
    "bill_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "item_name" TEXT NOT NULL,
    "variant_name" TEXT NOT NULL,
    "addons" JSONB NOT NULL DEFAULT '[]',
    "unit_price" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "packaging_per_unit" INTEGER NOT NULL,
    "cgst_bp" INTEGER NOT NULL,
    "sgst_bp" INTEGER NOT NULL,
    "discount_kind" "DiscountKind",
    "discount_value" INTEGER,
    "gross" INTEGER NOT NULL,
    "item_discount" INTEGER NOT NULL,
    "line_total" INTEGER NOT NULL,
    "bill_discount_share" INTEGER NOT NULL,
    "packaging" INTEGER NOT NULL,
    "taxable" INTEGER NOT NULL,
    "cgst" INTEGER NOT NULL,
    "sgst" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bill_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "bill_id" UUID NOT NULL,
    "business_day_id" UUID NOT NULL,
    "mode" "PaymentMode" NOT NULL,
    "amount" INTEGER NOT NULL,
    "tendered" INTEGER,
    "change" INTEGER,
    "reference" TEXT,
    "received_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bills_order_id_idx" ON "bills"("order_id");

-- CreateIndex
CREATE INDEX "bills_business_day_id_status_idx" ON "bills"("business_day_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "bills_outlet_id_financial_year_bill_no_key" ON "bills"("outlet_id", "financial_year", "bill_no");

-- CreateIndex
CREATE INDEX "bill_items_bill_id_idx" ON "bill_items"("bill_id");

-- CreateIndex
CREATE INDEX "bill_items_order_item_id_idx" ON "bill_items"("order_item_id");

-- CreateIndex
CREATE INDEX "payments_bill_id_idx" ON "payments"("bill_id");

-- CreateIndex
CREATE INDEX "payments_business_day_id_mode_idx" ON "payments"("business_day_id", "mode");

-- CreateIndex
CREATE INDEX "orders_merged_into_id_idx" ON "orders"("merged_into_id");

-- AddForeignKey
ALTER TABLE "business_days" ADD CONSTRAINT "business_days_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_merged_into_id_fkey" FOREIGN KEY ("merged_into_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_business_day_id_fkey" FOREIGN KEY ("business_day_id") REFERENCES "business_days"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_items" ADD CONSTRAINT "bill_items_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_items" ADD CONSTRAINT "bill_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_business_day_id_fkey" FOREIGN KEY ("business_day_id") REFERENCES "business_days"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_received_by_id_fkey" FOREIGN KEY ("received_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

