import type { ReactNode } from 'react';

/** The centred card that every sign-in screen sits in: an icon, a title, one line of help. */
export function AuthCard({
  icon,
  title,
  description,
  children,
  footer,
}: {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="mx-auto flex w-full max-w-sm flex-col gap-5 pt-4 sm:pt-10">
      <div className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-6 shadow-card">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary-50 text-primary-700 [&>svg]:size-6">
            {icon}
          </span>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {description && <p className="text-sm text-muted">{description}</p>}
          </div>
        </div>
        {children}
      </div>
      {footer && <div className="text-center text-sm">{footer}</div>}
    </section>
  );
}

/** The error line under a sign-in form. */
export function AuthError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
      {children}
    </p>
  );
}
