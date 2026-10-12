-- Nullable: days closed before the note count have none.
ALTER TABLE "business_days" ADD COLUMN "close_count" JSONB;
ALTER TABLE "business_days" ADD COLUMN "close_reason_code" TEXT;
-- Paise of cash variance above which closing needs a reason; existing outlets get ₹100.
ALTER TABLE "outlets" ADD COLUMN "variance_alert_paise" INTEGER NOT NULL DEFAULT 10000;
