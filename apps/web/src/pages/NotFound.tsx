import { Link } from 'react-router';

export function NotFound() {
  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <Link to="/" className="text-emerald-800 underline">
        Go to the home screen
      </Link>
    </section>
  );
}
