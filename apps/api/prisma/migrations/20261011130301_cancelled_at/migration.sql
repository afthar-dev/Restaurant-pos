-- When a dish was cancelled; null on rows from before this column (reports fall back to updated_at).
ALTER TABLE "order_items" ADD COLUMN "cancelled_at" TIMESTAMPTZ(3);
