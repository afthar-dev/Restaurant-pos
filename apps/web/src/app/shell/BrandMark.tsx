import { UtensilsCrossed } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/shared/lib/cn';

/** The restaurant's logo when it has one, otherwise the saffron icon square. */
export function BrandMark({ logoUrl, className }: { logoUrl?: string | null; className?: string }) {
  // A logo that was replaced or removed elsewhere 404s until the app refetches: show the icon.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (logoUrl && logoUrl !== failedUrl) {
    return (
      <span
        className={cn(
          'flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white',
          className,
        )}
      >
        {/* The restaurant name sits next to it, so the image is decorative. */}
        <img
          src={logoUrl}
          alt=""
          className="max-h-full max-w-full object-contain"
          onError={() => setFailedUrl(logoUrl)}
        />
      </span>
    );
  }
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-lg bg-primary-700 text-white',
        className,
      )}
    >
      <UtensilsCrossed aria-hidden="true" className="size-1/2" />
    </span>
  );
}
