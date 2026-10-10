import { afterAll, beforeAll } from 'vitest';

/** Runs a describe block as if the PC's clock were set to `zone`, e.g. a POS PC left on UTC. */
export function withDeviceTimeZone(zone: string) {
  let before: string | undefined;
  beforeAll(() => {
    before = process.env.TZ;
    process.env.TZ = zone;
  });
  afterAll(() => {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  });
}
