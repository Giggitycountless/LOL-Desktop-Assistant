import { FormEvent, useEffect, useMemo, useState } from "react";

import type { ActivityKind } from "../backend/types";
import { useAppCore } from "../state/AppStateProvider";

type ActivityFilter = ActivityKind | "all";
const ACTIVITY_RENDER_BATCH = 80;

export function Activity() {
  const {
    activityEntries,
    isActivityLoading,
    createActivityNote,
    loadActivityEntries,
    t,
  } = useAppCore();
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [limit, setLimit] = useState(100);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [visibleCount, setVisibleCount] = useState(ACTIVITY_RENDER_BATCH);

  const query = useMemo(
    () => ({
      limit,
      kind: filter === "all" ? null : filter,
    }),
    [filter, limit],
  );
  const visibleEntries = useMemo(
    () => activityEntries.slice(0, visibleCount),
    [activityEntries, visibleCount],
  );

  useEffect(() => {
    void loadActivityEntries(query);
  }, [loadActivityEntries, query]);

  useEffect(() => {
    setVisibleCount(Math.min(ACTIVITY_RENDER_BATCH, activityEntries.length));
  }, [activityEntries]);

  useEffect(() => {
    if (visibleCount >= activityEntries.length) {
      return;
    }

    const timer = window.setTimeout(() => {
      setVisibleCount((current) => Math.min(current + ACTIVITY_RENDER_BATCH, activityEntries.length));
    }, 24);

    return () => window.clearTimeout(timer);
  }, [activityEntries.length, visibleCount]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const didSave = await createActivityNote({
        title,
        body: body.length > 0 ? body : null,
      });

      if (didSave) {
        setTitle("");
        setBody("");
        await loadActivityEntries(query);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRefresh() {
    await loadActivityEntries(query);
  }

  return (
    <main className="min-h-0 flex-1 overflow-auto px-8 py-7">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-rose-700">{t("activity.eyebrow")}</p>
            <h1 className="mt-2 text-3xl font-semibold text-zinc-950">{t("activity.title")}</h1>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isActivityLoading}
            className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400"
          >
            {isActivityLoading ? t("common.refreshing") : t("common.refresh")}
          </button>
        </header>

        <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <form className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm" onSubmit={handleSubmit}>
            <h2 className="text-base font-semibold text-zinc-950">{t("activity.newNote")}</h2>
            <div className="mt-5 grid gap-4">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-zinc-700">{t("activity.noteTitle")}</span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-rose-700 focus:ring-2 focus:ring-rose-100"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-zinc-700">{t("activity.body")}</span>
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
                {isSubmitting ? t("common.saving") : t("activity.saveNote")}
              </button>
            </div>
          </form>

          <section className="rounded-lg border border-zinc-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-5 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
                  {t("activity.kind")}
                  <select
                    value={filter}
                    onChange={(event) => setFilter(event.target.value as ActivityFilter)}
                    className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-950 outline-none focus:border-rose-700 focus:ring-2 focus:ring-rose-100"
                  >
                    <option value="all">{t("activity.all")}</option>
                    <option value="note">{t("activity.notes")}</option>
                    <option value="settings">{t("nav.settings")}</option>
                    <option value="system">{t("activity.system")}</option>
                  </select>
                </label>

                <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
                  {t("activity.limit")}
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={limit}
                    onChange={(event) => setLimit(Number(event.target.value))}
                    className="h-9 w-24 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-950 outline-none focus:border-rose-700 focus:ring-2 focus:ring-rose-100"
                  />
                </label>
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {visibleEntries.length}/{activityEntries.length} {t("activity.shown")}
              </p>
            </div>

            {isActivityLoading && activityEntries.length === 0 && (
              <div className="px-5 py-12 text-center text-sm text-zinc-500">{t("dashboard.loadingActivity")}</div>
            )}

            {!isActivityLoading && activityEntries.length === 0 && (
              <div className="px-5 py-12 text-center">
                <p className="text-sm font-medium text-zinc-600">{t("activity.noEntries")}</p>
                <p className="mt-1 text-sm text-zinc-500">{t("activity.emptyHint")}</p>
              </div>
            )}

            {activityEntries.length > 0 && (
              <div className="divide-y divide-zinc-200">
                {visibleEntries.map((entry) => (
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
                {visibleEntries.length < activityEntries.length && (
                  <div className="px-5 py-4 text-center text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    {t("common.loading")}
                  </div>
                )}
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
