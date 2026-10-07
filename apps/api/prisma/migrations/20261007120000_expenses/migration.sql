-- CreateEnum
CREATE TYPE "ExpenseSource" AS ENUM ('MANUAL', 'PURCHASE');

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "business_day_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "mode" "PaymentMode" NOT NULL,
    "note" TEXT,
    "source" "ExpenseSource" NOT NULL DEFAULT 'MANUAL',
    "purchase_id" UUID,
    "created_by_id" UUID NOT NULL,
    "voided_at" TIMESTAMPTZ(3),
    "voided_by_id" UUID,
    "void_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expense_categories_outlet_id_idx" ON "expense_categories"("outlet_id");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_purchase_id_key" ON "expenses"("purchase_id");

-- CreateIndex
CREATE INDEX "expenses_business_day_id_idx" ON "expenses"("business_day_id");

-- CreateIndex
CREATE INDEX "expenses_outlet_id_created_at_idx" ON "expenses"("outlet_id", "created_at");

-- AddForeignKey
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_business_day_id_fkey" FOREIGN KEY ("business_day_id") REFERENCES "business_days"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_voided_by_id_fkey" FOREIGN KEY ("voided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- One active category per name (case-insensitive); also makes creating the defaults race-safe.
CREATE UNIQUE INDEX "expense_categories_active_name" ON "expense_categories" ("outlet_id", lower("name")) WHERE "archived_at" IS NULL;
