-- Nullable: rows written before reason codes have none and are reported as "Other".
ALTER TABLE "bills" ADD COLUMN "discount_reason_code" TEXT;
ALTER TABLE "bills" ADD COLUMN "void_reason_code" TEXT;
ALTER TABLE "order_items" ADD COLUMN "cancel_reason_code" TEXT;
ALTER TABLE "orders" ADD COLUMN "cancel_reason_code" TEXT;
