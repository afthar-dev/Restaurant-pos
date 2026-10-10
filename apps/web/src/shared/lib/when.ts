/** Clock time in the device's zone: "9:02 am". */
export const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

/** Short date and time: "Wed, 7 Oct, 9:02 am". */
export const dayAndTime = (iso: string) =>
  `${new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}, ${time(iso)}`;

/** Printed bills, tickets and reports are in India time whatever zone the printing PC is set to. */
export const PRINT_TIME_ZONE = 'Asia/Kolkata';
