-- Voiding a paid bill refunds its payments, on the business day the void happened.
ALTER TABLE "payments" ADD COLUMN "refunded_at" TIMESTAMPTZ(3);
ALTER TABLE "payments" ADD COLUMN "refunded_by_id" UUID;
ALTER TABLE "payments" ADD COLUMN "refund_business_day_id" UUID;
CREATE INDEX "payments_refund_business_day_id_idx" ON "payments"("refund_business_day_id");
ALTER TABLE "payments" ADD CONSTRAINT "payments_refunded_by_id_fkey" FOREIGN KEY ("refunded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_refund_business_day_id_fkey" FOREIGN KEY ("refund_business_day_id") REFERENCES "business_days"("id") ON DELETE SET NULL ON UPDATE CASCADE;
