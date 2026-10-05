function readTableToken(search: string): string | null {
  const token = new URLSearchParams(search).get('t')?.trim();
  return token ? token : null;
}

export function App({ search }: { search: string }) {
  const token = readTableToken(search);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-3 bg-white px-4 py-10 text-slate-900">
      {token ? (
        <>
          <h1 className="text-2xl font-semibold">Table menu</h1>
          <p className="text-slate-600">The menu for your table will appear here.</p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold">Scan to order</h1>
          <p className="text-slate-600">Scan the QR code on your table to see the menu.</p>
        </>
      )}
    </main>
  );
}
