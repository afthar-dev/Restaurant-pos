import { Skeleton } from '@/shared/ui';

/** Shaped like the dashboard while its code or the business day is loading. */
export function OwnerHomeSkeleton() {
  return (
    <>
      <Skeleton className="h-28" />
      <Skeleton className="h-44" />
      <Skeleton className="h-52" />
    </>
  );
}
