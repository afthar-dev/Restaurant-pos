/** "n of m done" with a bar; announced as a progress bar. */
export function SetupProgressBar({ done, total }: { done: number; total: number }) {
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-medium text-text tabular-nums">{`${done} of ${total} done`}</p>
      <div
        role="progressbar"
        aria-label="Setup progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        className="h-2 overflow-hidden rounded-full bg-surface-2"
      >
        <div
          className="h-full rounded-full bg-primary-700 transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
