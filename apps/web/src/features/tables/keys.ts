export const tableKeys = {
  /**
   * The admin floor layout. It shares the ['floor'] prefix with the live floor status, so
   * a realtime floor notice refreshes both.
   */
  layout: ['floor'] as const,
  qrCodes: ['table-qr-codes'] as const,
};
