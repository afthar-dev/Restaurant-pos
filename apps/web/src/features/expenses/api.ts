import { apiFetch } from '@/shared/api/http';
import type { DayExpenses, Expense, ExpenseCategory, NewExpense } from './types';

export const fetchCategories = () => apiFetch<ExpenseCategory[]>('/api/expense-categories');

export const addCategory = (name: string) =>
  apiFetch<ExpenseCategory>('/api/expense-categories', { method: 'POST', body: { name } });

export const renameCategory = ({ id, name }: { id: string; name: string }) =>
  apiFetch<ExpenseCategory>(`/api/expense-categories/${id}`, { method: 'PUT', body: { name } });

export const archiveCategory = (category: ExpenseCategory) =>
  apiFetch(`/api/expense-categories/${category.id}/archive`, { method: 'POST' });

/** `day` is "current" (the open day) or a business day id. */
export const fetchExpenses = (day: string) =>
  apiFetch<DayExpenses>(`/api/expenses?day=${encodeURIComponent(day)}`);

export const addExpense = (idempotencyKey: string, body: NewExpense) =>
  apiFetch<Expense>('/api/expenses', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body,
  });

export const voidExpense = ({ id, reason }: { id: string; reason: string }) =>
  apiFetch<Expense>(`/api/expenses/${id}/void`, { method: 'POST', body: { reason } });
