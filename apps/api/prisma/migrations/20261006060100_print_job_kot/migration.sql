-- Link KOT print jobs to their KOT so the order screen can show whether each ticket printed.
ALTER TABLE "print_jobs" ADD COLUMN "kot_id" UUID;
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_kot_id_fkey" FOREIGN KEY ("kot_id") REFERENCES "kots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "print_jobs_kot_id_idx" ON "print_jobs"("kot_id");
