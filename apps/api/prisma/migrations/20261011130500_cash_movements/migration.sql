-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('PAY_IN', 'PAY_OUT', 'DROP');

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "business_day_id" UUID NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason_code" TEXT NOT NULL,
    "note" TEXT,
    "created_by_id" UUID NOT NULL,
    "approved_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cash_movements_amount_positive" CHECK ("amount" > 0)
);

-- CreateIndex
CREATE INDEX "cash_movements_business_day_id_idx" ON "cash_movements"("business_day_id");

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_business_day_id_fkey" FOREIGN KEY ("business_day_id") REFERENCES "business_days"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing outlets get the default limit of Rs 2,000 without rewriting anything else.
ALTER TABLE "outlets" ADD COLUMN "petty_cash_limit_paise" INTEGER NOT NULL DEFAULT 200000;
