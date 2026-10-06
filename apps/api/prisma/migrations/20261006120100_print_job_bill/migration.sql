-- AlterTable
ALTER TABLE "print_jobs" ADD COLUMN     "bill_id" UUID;

-- CreateIndex
CREATE INDEX "print_jobs_bill_id_idx" ON "print_jobs"("bill_id");

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

