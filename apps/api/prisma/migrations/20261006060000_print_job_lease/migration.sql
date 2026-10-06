-- A device claims a print job for a short lease so two tabs (or a retry after a lost
-- acknowledgement) do not print the same ticket twice. Failed prints wait out the lease
-- before the next attempt.
ALTER TABLE "print_jobs" ADD COLUMN "lease_until" TIMESTAMPTZ(3);
