import { useState } from 'react';
import { Link } from 'react-router';
import { Button, describeError, ErrorNote, LoadingScreen, PageHeader } from '@/shared/ui';
import { CategoriesSheet } from '../components/CategoriesSheet';
import { ExpenseForm } from '../components/ExpenseForm';
import { ExpenseList } from '../components/ExpenseList';
import { useDayExpenses } from '../queries';

/** Money spent today: gas, salaries, repairs… Cash expenses come off the expected cash. */
export function ExpensesPage() {
  const today = useDayExpenses();
  const [categories, setCategories] = useState(false);

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader
        title="Expenses"
        description="Money spent today. Cash expenses come out of the drawer and are subtracted at day close."
        actions={
          <Button variant="secondary" onClick={() => setCategories(true)}>
            Categories
          </Button>
        }
      />
      {!today.data ? (
        today.isError ? (
          <ErrorNote message={describeError(today.error)} />
        ) : (
          <LoadingScreen />
        )
      ) : today.data.day ? (
        <>
          <ExpenseForm />
          <ExpenseList expenses={today.data.expenses} totals={today.data.totals} canVoid />
        </>
      ) : (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">
          Open the business day first.{' '}
          <Link to="/pos" className="underline">
            Go to the POS
          </Link>
        </p>
      )}
      {categories && <CategoriesSheet onClose={() => setCategories(false)} />}
    </section>
  );
}
