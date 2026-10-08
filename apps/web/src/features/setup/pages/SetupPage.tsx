import { AlertTriangle, CheckCircle2, CircleDashed, MinusCircle } from 'lucide-react';
import { Link } from 'react-router';
import { useCan } from '@/shared/session/store';
import { Badge, Button, Card, CardBody, LoadingScreen, PageHeader } from '@/shared/ui';
import { SetupProgressBar } from '../components/SetupProgressBar';
import type { StepView } from '../steps';
import { useSetupProgress } from '../useSetupProgress';

/** What a new restaurant still has to do before its first service, one step per row. */
export function SetupPage() {
  const setup = useSetupProgress();
  const canPos = useCan('bill.print');

  if (setup.loading && !setup.failed) return <LoadingScreen />;

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="Setup guide"
        description={
          setup.complete
            ? 'Ready to serve. Open the day from the POS to take the first order.'
            : 'Work through these steps before your first service. Each one ticks itself off when it is done.'
        }
        actions={
          setup.complete && canPos ? (
            <Button asChild>
              <Link to="/pos">Go to POS</Link>
            </Button>
          ) : undefined
        }
      />
      <SetupProgressBar done={setup.done} total={setup.total} />
      <ol className="flex flex-col gap-3">
        {setup.steps.map((step, index) => (
          <StepRow
            key={step.id}
            step={step}
            number={index + 1}
            onSkip={() => setup.skip(step.id)}
            onUndo={() => setup.undo(step.id)}
            onRetry={() => setup.retry(step.id)}
          />
        ))}
      </ol>
    </section>
  );
}

function StepRow({
  step,
  number,
  onSkip,
  onUndo,
  onRetry,
}: {
  step: StepView;
  number: number;
  onSkip: () => void;
  onUndo: () => void;
  onRetry: () => void;
}) {
  return (
    <li>
      <Card>
        <CardBody className="flex flex-wrap items-start gap-4">
          <StepIcon status={step.status} number={number} />
          <div className="flex min-w-0 flex-1 basis-60 flex-col gap-1">
            <h2 className="text-base font-semibold">{step.title}</h2>
            <p className="text-sm text-muted">{step.help}</p>
            {step.status === 'skipped' && (
              <p className="text-sm text-subtle">{`Skipped — ${step.skipLabel}`}</p>
            )}
            {step.status === 'error' && (
              <p className="text-sm text-red-700">Could not check this step.</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {step.status === 'done' && <Badge tone="success">Done</Badge>}
            {step.status === 'todo' && (
              <>
                <Button asChild>
                  <Link to={`${step.path}?from=setup`}>
                    Set up<span className="sr-only">{` ${step.title}`}</span>
                  </Link>
                </Button>
                {step.skipLabel && (
                  <Button variant="secondary" onClick={onSkip}>
                    {step.skipLabel}
                  </Button>
                )}
              </>
            )}
            {step.status === 'skipped' && (
              <Button variant="secondary" onClick={onUndo}>
                Undo<span className="sr-only">{` skip for ${step.title}`}</span>
              </Button>
            )}
            {step.status === 'error' && (
              <Button variant="secondary" onClick={onRetry}>
                Retry<span className="sr-only">{` ${step.title}`}</span>
              </Button>
            )}
          </div>
        </CardBody>
      </Card>
    </li>
  );
}

function StepIcon({ status, number }: { status: StepView['status']; number: number }) {
  const base = 'flex size-9 shrink-0 items-center justify-center rounded-full [&>svg]:size-5';
  if (status === 'done') {
    return (
      <span className={`${base} bg-green-100 text-green-800`}>
        <CheckCircle2 aria-hidden="true" />
      </span>
    );
  }
  if (status === 'skipped') {
    return (
      <span className={`${base} bg-surface-2 text-subtle`}>
        <MinusCircle aria-hidden="true" />
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className={`${base} bg-red-50 text-red-700`}>
        <AlertTriangle aria-hidden="true" />
      </span>
    );
  }
  if (status === 'loading') {
    return (
      <span className={`${base} bg-surface-2 text-subtle`}>
        <CircleDashed aria-hidden="true" />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`${base} bg-primary-50 font-semibold text-primary-800 tabular-nums`}
    >
      {number}
    </span>
  );
}
