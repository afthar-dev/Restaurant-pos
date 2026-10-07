import { useQuery } from '@tanstack/react-query';
import { POLL_MS } from '@/shared/api/queryClient';
import { claimPrintJobs } from './api';
import { printKeys } from './keys';

/**
 * Print jobs leased to this screen. Each poll claims new jobs on the server, so only one
 * tab or device ever gets a given job.
 */
export function useClaimedPrintJobs() {
  return useQuery({ queryKey: printKeys.jobs, queryFn: claimPrintJobs, refetchInterval: POLL_MS });
}
