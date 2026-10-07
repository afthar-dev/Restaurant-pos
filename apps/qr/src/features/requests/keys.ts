export const requestKeys = {
  mine: (token: string) => ['requests', token] as const,
};
