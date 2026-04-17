export function History() {
  return (
    <main className="min-h-0 flex-1 overflow-auto px-8 py-7">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header>
          <p className="text-sm font-medium uppercase tracking-wide text-rose-700">History</p>
          <h1 className="mt-2 text-3xl font-semibold text-zinc-950">Activity</h1>
        </header>

        <section className="rounded-lg border border-zinc-200 bg-white shadow-sm">
          <div className="grid grid-cols-[1fr_10rem] border-b border-zinc-200 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            <span>Event</span>
            <span>Time</span>
          </div>
          <div className="px-5 py-12 text-center text-sm text-zinc-500">No activity recorded</div>
        </section>
      </div>
    </main>
  );
}
