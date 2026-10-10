import { ImagePlus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNotify } from '@/features/notifications';
import { shrinkPhoto } from '@/shared/lib/photo';
import { Button, Card, CardBody, describeError, ErrorNote, Spinner } from '@/shared/ui';
import { useLogo } from '../mutations';
import type { OutletSettings } from '../types';

/** The restaurant logo: shown in the staff header, on printed bills and on the QR menu. */
export function LogoSection({ outlet }: { outlet: OutletSettings }) {
  const notify = useNotify();
  const [problem, setProblem] = useState<string | null>(null);
  const logo = useLogo((updated) =>
    notify({ text: updated.logoUrl ? 'Logo saved' : 'Logo removed', tone: 'success' }),
  );
  const busy = logo.isPending;

  async function pick(file: File | undefined) {
    if (!file) return;
    setProblem(null);
    try {
      // Logos are small: 512 px keeps them sharp on a bill and quick on a phone.
      logo.mutate(await shrinkPhoto(file, 512, { transparent: true }));
    } catch (error) {
      setProblem(describeError(error));
    }
  }

  const label = outlet.logoUrl ? 'Change logo' : 'Add logo';
  return (
    <Card>
      <CardBody className="flex flex-wrap items-center gap-4">
        <div className="flex size-20 shrink-0 items-center justify-center rounded-lg border border-border bg-white p-1">
          {busy ? (
            <Spinner />
          ) : outlet.logoUrl ? (
            <img
              src={outlet.logoUrl}
              alt="Restaurant logo"
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <ImagePlus aria-hidden="true" className="size-6 text-subtle" />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div>
            <h3 className="font-semibold">Logo</h3>
            <p className="text-sm text-muted">
              Shown in the app header, on printed bills and on the customer QR menu. A square logo
              or a PNG with a transparent background works best.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="relative inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-border-strong bg-surface px-4 text-sm font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary-600">
              <ImagePlus aria-hidden="true" className="size-4" />
              {label}
              <input
                type="file"
                accept="image/*"
                aria-label={label}
                className="absolute inset-0 cursor-pointer opacity-0"
                disabled={busy}
                onChange={(e) => {
                  void pick(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
            {outlet.logoUrl && (
              <Button
                variant="secondary"
                icon={<Trash2 aria-hidden="true" />}
                disabled={busy}
                onClick={() => logo.mutate(null)}
              >
                Remove logo
              </Button>
            )}
          </div>
          <ErrorNote message={problem ?? (logo.isError ? describeError(logo.error) : null)} />
        </div>
      </CardBody>
    </Card>
  );
}
