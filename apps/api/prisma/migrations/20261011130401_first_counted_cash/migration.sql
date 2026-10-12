-- The first count a manager checked on the day, kept so a re-count that matches expected is visible.
ALTER TABLE "business_days" ADD COLUMN "first_counted_cash" INTEGER;
