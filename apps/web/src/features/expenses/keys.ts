export const expenseKeys = {
  /** Prefix of every expense list. */
  all: ['expenses'] as const,
  forDay: (day: string) => ['expenses', day] as const,
  categories: ['expense-categories'] as const,
};
