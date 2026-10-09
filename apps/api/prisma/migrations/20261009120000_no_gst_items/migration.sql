-- A dish can have no GST: its tax rate is optional, and order lines keep that (rates are 0).
ALTER TABLE "items" ALTER COLUMN "tax_rate_id" DROP NOT NULL;
ALTER TABLE "order_items" ALTER COLUMN "tax_rate_id" DROP NOT NULL;
