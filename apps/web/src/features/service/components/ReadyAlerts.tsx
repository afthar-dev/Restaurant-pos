import { useReadyAlerts } from '@/features/orders';

/** Food-ready alerts, only while the business day is open (inside DayGate). */
export function ReadyAlerts() {
  useReadyAlerts();
  return null;
}
