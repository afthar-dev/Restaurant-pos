/** The menu's shape while it loads: search, filters and a few dish rows. */
export function MenuSkeleton() {
  const bar = 'animate-pulse rounded-md bg-border';
  return (
    <div role="status" aria-label="Loading the menu" className="flex flex-col gap-4">
      <div className={`${bar} h-12 rounded-xl`} />
      <div className="flex justify-between">
        <div className={`${bar} h-10 w-28 rounded-full`} />
        <div className={`${bar} h-10 w-24 rounded-full`} />
      </div>
      <div className={`${bar} h-6 w-32`} />
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} data-skeleton="dish" className="flex gap-4 py-2">
          <div className="flex flex-1 flex-col gap-2">
            <div className={`${bar} h-4 w-4`} />
            <div className={`${bar} h-5 w-3/4`} />
            <div className={`${bar} h-4 w-16`} />
            <div className={`${bar} h-4 w-full`} />
          </div>
          <div className={`${bar} size-28 rounded-xl`} />
        </div>
      ))}
    </div>
  );
}
