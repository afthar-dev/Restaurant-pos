import { TriangleAlert } from 'lucide-react';
import { Link } from 'react-router';
import { useOutlet } from '@/features/settings';
import { Button, Card, CardBody } from '@/shared/ui';

/** Red callout while the outlet charges GST (Regular or Composition) but has no GSTIN saved. */
export function GstinWarning() {
  const outlet = useOutlet();
  const settings = outlet.data;
  if (!settings || settings.taxScheme === 'NONE' || settings.gstin) return null;
  return (
    <Card role="alert" className="border-red-300 bg-red-50">
      <CardBody className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2 font-semibold text-red-900">
          <TriangleAlert aria-hidden="true" className="size-5 shrink-0" />
          Add your GSTIN — you are charging GST without one
        </span>
        <Button asChild size="sm">
          <Link to="/admin/settings">Open settings</Link>
        </Button>
      </CardBody>
    </Card>
  );
}
