-- UPI details for the payment QR. payments.reference already exists (billing migration), so only
-- the previous mode of a corrected payment is new there.
ALTER TABLE "outlets" ADD COLUMN "upi_vpa" TEXT;
ALTER TABLE "outlets" ADD COLUMN "upi_payee" TEXT;
ALTER TABLE "outlets" ADD COLUMN "print_upi_qr" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "payments" ADD COLUMN "mode_changed_from" TEXT;
