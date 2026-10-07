import type { ReactNode } from 'react';

/**
 * The top of every screen: what it is, one line on what it is for, and its main actions.
 * The title is the page's h1 (h2 for sections inside a page that already has one, like Admin).
 */
export function PageHeader({
  title,
  description,
  actions,
  as: Heading = 'h1',
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  as?: 'h1' | 'h2';
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <Heading
          className={
            Heading === 'h1'
              ? 'text-2xl font-semibold tracking-tight text-text'
              : 'text-xl font-semibold tracking-tight text-text'
          }
        >
          {title}
        </Heading>
        {description && <p className="max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
