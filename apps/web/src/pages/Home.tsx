import { Link } from 'react-router';

const areas = [
  { to: '/pos', title: 'POS counter', body: 'Cashier billing, parcel orders and payments.' },
  { to: '/captain', title: 'Captain app', body: 'Waiters take table orders on their phones.' },
  { to: '/kds', title: 'Kitchen display', body: 'Live KOTs for the kitchen screen.' },
  { to: '/admin', title: 'Admin', body: 'Menu, tables, stock, expenses and reports.' },
];

export function Home() {
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold">Restaurant POS</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {areas.map((area) => (
          <Link
            key={area.to}
            to={area.to}
            className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-4 hover:border-emerald-700 focus-visible:outline-2 focus-visible:outline-emerald-700"
          >
            <span className="font-semibold">{area.title}</span>
            <span className="text-sm text-slate-600">{area.body}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
