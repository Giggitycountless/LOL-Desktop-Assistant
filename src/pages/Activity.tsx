import { FormEvent, useState } from "react";

import { useAppState } from "../state/AppStateProvider";

export function Activity() {
  const { snapshot, isLoading, createActivityNote } = useAppState();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const entries = snapshot?.recentActivity ?? [];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      await createActivityNote({
        title,
        body: body.length > 0 ? body : null,
      });

      setTitle("");
      setBody("");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-0 flex-1 overflow-auto px-8 py-7">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header>
          <p className="text-sm font-medium uppercase tracking-wide text-rose-700">Activity</p>
          <h1 className="mt-2 text-3xl font-semibold text-zinc-950">Local Activity</h1>
        </header>

        <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <form className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm" onSubmit={handleSubmit}>
            <h2 className="text-base font-semibold text-zinc-950">New Note</h2>
            <div className="mt-5 grid gap-4">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-zinc-700">Title</span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-rose-700 focus:ring-2 focus:ring-rose-100"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-zinc-700">Body</span>
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  rows={5}
                  className="resize-none rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-rose-700 focus:ring-2 focus:ring-rose-100"
                />
              </label>

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex h-10 items-center justify-center rounded-md bg-rose-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                {isSubmitting ? "Saving" : "Save Note"}
              </button>
            </div>
          </form>

          <section className="rounded-lg border border-zinc-200 bg-white shadow-sm">
            <div className="grid grid-cols-[1fr_9rem] border-b border-zinc-200 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <span>Entry</span>
              <span>Created</span>
            </div>

            {isLoading && <div className="px-5 py-12 text-center text-sm text-zinc-500">Loading activity</div>}

            {!isLoading && entries.length === 0 && (
              <div className="px-5 py-12 text-center text-sm text-zinc-500">No activity recorded</div>
            )}

            {!isLoading && entries.length > 0 && (
              <div className="divide-y divide-zinc-200">
                {entries.map((entry) => (
                  <article key={entry.id} className="grid grid-cols-[1fr_9rem] gap-4 px-5 py-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold capitalize text-zinc-600">
                          {entry.kind}
                        </span>
                        <h2 className="truncate text-sm font-semibold text-zinc-950">{entry.title}</h2>
                      </div>
                      {entry.body && <p className="mt-2 text-sm text-zinc-600">{entry.body}</p>}
                    </div>
                    <time className="text-right text-xs font-medium text-zinc-500">{entry.createdAt}</time>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
