import { FormEvent, useEffect, useState } from "react";

import { useAppState } from "../state/AppStateProvider";
import type { SaveSettingsInput, StartupPage } from "../backend/types";

export function Settings() {
  const { snapshot, saveSettings } = useAppState();
  const [draft, setDraft] = useState<SaveSettingsInput>({
    startupPage: "dashboard",
    compactMode: false,
    activityLimit: 100,
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (snapshot) {
      setDraft({
        startupPage: snapshot.settings.startupPage,
        compactMode: snapshot.settings.compactMode,
        activityLimit: snapshot.settings.activityLimit,
      });
    }
  }, [snapshot]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);

    try {
      await saveSettings(draft);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-0 flex-1 overflow-auto px-8 py-7">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header>
          <p className="text-sm font-medium uppercase tracking-wide text-rose-700">Settings</p>
          <h1 className="mt-2 text-3xl font-semibold text-zinc-950">Preferences</h1>
        </header>

        <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <form className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm" onSubmit={handleSubmit}>
            <h2 className="text-base font-semibold text-zinc-950">Application State</h2>
            <div className="mt-5 grid gap-4">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-zinc-700">Startup page</span>
                <select
                  value={draft.startupPage}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      startupPage: event.target.value as StartupPage,
                    }))
                  }
                  className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-rose-700 focus:ring-2 focus:ring-rose-100"
                >
                  <option value="dashboard">Dashboard</option>
                  <option value="activity">Activity</option>
                  <option value="settings">Settings</option>
                </select>
              </label>

              <label className="flex items-center justify-between gap-4 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3">
                <span className="text-sm font-medium text-zinc-700">Compact mode</span>
                <input
                  type="checkbox"
                  checked={draft.compactMode}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      compactMode: event.target.checked,
                    }))
                  }
                  className="h-5 w-5 accent-rose-700"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-zinc-700">Activity limit</span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={draft.activityLimit}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      activityLimit: Number(event.target.value),
                    }))
                  }
                  className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-rose-700 focus:ring-2 focus:ring-rose-100"
                />
              </label>

              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex h-10 items-center justify-center rounded-md bg-rose-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                {isSaving ? "Saving" : "Save Settings"}
              </button>
            </div>
          </form>

          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-zinc-950">Current Values</h2>
            <dl className="mt-5 grid gap-4">
              <SettingRow label="Startup page" value={snapshot?.settings.startupPage ?? "Loading"} />
              <SettingRow label="Compact mode" value={snapshot?.settings.compactMode ? "On" : "Off"} />
              <SettingRow label="Activity limit" value={snapshot ? String(snapshot.settings.activityLimit) : "Loading"} />
              <SettingRow label="Updated" value={snapshot?.settings.updatedAt ?? "Loading"} />
            </dl>
          </div>
        </section>
      </div>
    </main>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3">
      <dt className="text-sm font-medium text-zinc-600">{label}</dt>
      <dd className="text-sm font-semibold capitalize text-zinc-950">{value}</dd>
    </div>
  );
}
