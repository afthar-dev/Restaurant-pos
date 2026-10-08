import type { ReactNode } from 'react';

/** Title and one-line takeaway above a chart. */
export function ChartFrame({
  title,
  takeaway,
  as: Heading = 'h3',
  children,
}: {
  title: string;
  takeaway: string;
  as?: 'h2' | 'h3';
  children: ReactNode;
}) {
  return (
    <figure className="flex min-w-0 flex-col gap-3">
      <figcaption className="flex flex-col gap-0.5">
        <Heading className="font-semibold text-text">{title}</Heading>
        <p className="text-sm text-muted">{takeaway}</p>
      </figcaption>
      {children}
    </figure>
  );
}
