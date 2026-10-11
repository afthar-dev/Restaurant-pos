import { CalendarX } from 'lucide-react';
import { Link } from 'react-router';
import { useCan } from '@/shared/session/store';
import { Button, Card, CardBody } from '@/shared/ui';

export function DayNotOpen() {
  const canOpen = useCan('day.openClose');
  return (
    <Card className="border-amber-300 bg-amber-50">
      <CardBody className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-amber-950">
          <CalendarX aria-hidden="true" className="size-5 shrink-0" />
          {canOpen
            ? 'The business day is not open. Open it on the POS to start taking orders.'
            : 'The business day is not open yet. Ask a manager to open it.'}
        </span>
        {canOpen && (
          <Button asChild size="sm">
            <Link to="/pos">Open the day</Link>
          </Button>
        )}
      </CardBody>
    </Card>
  );
}
