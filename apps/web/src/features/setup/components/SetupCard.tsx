import { Rocket } from 'lucide-react';
import { Link } from 'react-router';
import { Button, Card, CardBody } from '@/shared/ui';
import { useSetupProgress } from '../useSetupProgress';
import { SetupProgressBar } from './SetupProgressBar';

/** Home card for owners and managers until the setup guide is complete. */
export function SetupCard() {
  const setup = useSetupProgress();
  if (setup.total === 0 || setup.loading || setup.failed || setup.complete) return null;
  return (
    <Card className="border-primary-200 bg-primary-50">
      <CardBody className="flex flex-wrap items-center gap-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-800">
          <Rocket aria-hidden="true" className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 basis-56 flex-col gap-2">
          <h2 className="font-semibold text-text">Get your restaurant ready</h2>
          <SetupProgressBar done={setup.done} total={setup.total} />
        </div>
        <Button asChild>
          <Link to="/setup">Continue setup</Link>
        </Button>
      </CardBody>
    </Card>
  );
}
