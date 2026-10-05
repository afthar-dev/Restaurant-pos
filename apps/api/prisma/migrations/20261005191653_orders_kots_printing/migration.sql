-- CreateEnum
CREATE TYPE "BusinessDayStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('DINE_IN', 'PARCEL');

-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('POS', 'CAPTAIN', 'QR');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_APPROVAL', 'OPEN', 'BILLED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderItemStatus" AS ENUM ('NEW', 'SENT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "KotType" AS ENUM ('NEW', 'CANCEL');

-- CreateEnum
CREATE TYPE "KotStatus" AS ENUM ('NEW', 'PREPARING', 'READY', 'SERVED');

-- CreateEnum
CREATE TYPE "PrintJobKind" AS ENUM ('KOT', 'BILL');

-- CreateEnum
CREATE TYPE "PrintJobStatus" AS ENUM ('PENDING', 'PRINTED', 'FAILED');

-- AlterTable
ALTER TABLE "printers" ADD COLUMN     "device_id" UUID;

-- CreateTable
CREATE TABLE "business_days" (
    "id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "status" "BusinessDayStatus" NOT NULL DEFAULT 'OPEN',
    "opening_cash" INTEGER NOT NULL,
    "opened_by_id" UUID NOT NULL,
    "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_by_id" UUID,
    "closed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "business_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counters" (
    "id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "business_day_id" UUID NOT NULL,
    "type" "OrderType" NOT NULL,
    "source" "OrderSource" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'OPEN',
    "table_id" UUID,
    "token_no" INTEGER,
    "guests" INTEGER,
    "customer_name" TEXT,
    "waiter_id" UUID,
    "created_by_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "cancel_reason" TEXT,
    "cancelled_by_id" UUID,
    "closed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "item_name" TEXT NOT NULL,
    "variant_name" TEXT NOT NULL,
    "unit_price" INTEGER NOT NULL,
    "packaging_charge" INTEGER NOT NULL DEFAULT 0,
    "tax_rate_id" UUID NOT NULL,
    "cgst_bp" INTEGER NOT NULL,
    "sgst_bp" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "addons" JSONB NOT NULL DEFAULT '[]',
    "combo_components" JSONB NOT NULL DEFAULT '[]',
    "note" TEXT,
    "station_id" UUID NOT NULL,
    "status" "OrderItemStatus" NOT NULL DEFAULT 'NEW',
    "kot_id" UUID,
    "cancel_reason" TEXT,
    "cancelled_by_id" UUID,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kots" (
    "id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "business_day_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "kot_no" INTEGER NOT NULL,
    "type" "KotType" NOT NULL DEFAULT 'NEW',
    "station_id" UUID NOT NULL,
    "station_name" TEXT NOT NULL,
    "status" "KotStatus" NOT NULL DEFAULT 'NEW',
    "created_by_id" UUID NOT NULL,
    "ready_at" TIMESTAMPTZ(3),
    "served_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "kots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kot_lines" (
    "id" UUID NOT NULL,
    "kot_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "item_name" TEXT NOT NULL,
    "variant_name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "addons" JSONB NOT NULL DEFAULT '[]',
    "combo_components" JSONB NOT NULL DEFAULT '[]',
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "kot_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "print_jobs" (
    "id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "printer_id" UUID NOT NULL,
    "device_id" UUID,
    "kind" "PrintJobKind" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "PrintJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "printed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "print_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "business_days_outlet_id_status_idx" ON "business_days"("outlet_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "counters_outlet_id_key_period_key" ON "counters"("outlet_id", "key", "period");

-- CreateIndex
CREATE INDEX "orders_outlet_id_status_idx" ON "orders"("outlet_id", "status");

-- CreateIndex
CREATE INDEX "orders_table_id_status_idx" ON "orders"("table_id", "status");

-- CreateIndex
CREATE INDEX "orders_business_day_id_idx" ON "orders"("business_day_id");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "kots_outlet_id_business_day_id_status_idx" ON "kots"("outlet_id", "business_day_id", "status");

-- CreateIndex
CREATE INDEX "kots_order_id_idx" ON "kots"("order_id");

-- CreateIndex
CREATE INDEX "kot_lines_kot_id_idx" ON "kot_lines"("kot_id");

-- CreateIndex
CREATE INDEX "print_jobs_device_id_status_idx" ON "print_jobs"("device_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_outlet_id_key_key" ON "idempotency_keys"("outlet_id", "key");

-- AddForeignKey
ALTER TABLE "printers" ADD CONSTRAINT "printers_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_days" ADD CONSTRAINT "business_days_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_days" ADD CONSTRAINT "business_days_opened_by_id_fkey" FOREIGN KEY ("opened_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_business_day_id_fkey" FOREIGN KEY ("business_day_id") REFERENCES "business_days"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_waiter_id_fkey" FOREIGN KEY ("waiter_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "item_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_kot_id_fkey" FOREIGN KEY ("kot_id") REFERENCES "kots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kots" ADD CONSTRAINT "kots_business_day_id_fkey" FOREIGN KEY ("business_day_id") REFERENCES "business_days"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kots" ADD CONSTRAINT "kots_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kots" ADD CONSTRAINT "kots_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kot_lines" ADD CONSTRAINT "kot_lines_kot_id_fkey" FOREIGN KEY ("kot_id") REFERENCES "kots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_printer_id_fkey" FOREIGN KEY ("printer_id") REFERENCES "printers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
