/** Printed bills, tickets and reports are in India time whatever zone the printing PC is set to. */
export const PRINT_TIME_ZONE = 'Asia/Kolkata';

/** Clock time in India time, whatever zone the device is set to: "9:02 am". */
export const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: PRINT_TIME_ZONE,
  });

/** Short date and time in India time: "Wed, 7 Oct, 9:02 am". */
export const dayAndTime = (iso: string) =>
  `${new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: PRINT_TIME_ZONE })}, ${time(iso)}`;
