import { FormEvent, useEffect, useMemo, useState } from "react";

import type { SaveSettingsInput, StartupPage } from "../backend/types";
import { useAppState } from "../state/AppStateProvider";

const MIN_ACTIVITY_LIMIT = 1;
const MAX_ACTIVITY_LIMIT = 500;

export function Settings() {
  const {
    snapshot,
    saveSettings,
    exportLocalData,
    importLocalData,
    clearActivityEntries,
  } = useAppState();
  const [draft, setDraft] = useState<SaveSettingsInput>({
    startupPage: "dashboard",
    compactMode: false,
    activityLimit: 100,
  });
  const [exportJson, setExportJson] = useState("");
  const [importJson, setImportJson] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const persisted = snapshot?.settings;
  const defaults = snapshot?.settingsDefaults;

  useEffect(() => {
    if (persisted) {
      setDraft({
        startupPage: persisted.startupPage,
        compactMode: persisted.compactMode,
        activityLimit: persisted.activityLimit,
      });
    }
  }, [persisted]);

  const validationMessage = useMemo(() => validateDraft(draft), [draft]);
  const hasUnsavedChanges = Boolean(
    persisted &&
      (draft.startupPage !== persisted.startupPage ||
        draft.compactMode !== persisted.compactMode ||
        draft.activityLimit !== persisted.activityLimit),
  );
  const canSave = hasUnsavedChanges && !validationMessage && !isSaving;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSave) {
      return;
    }

    setIsSaving(true);

    try {
      await saveSettings(draft);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleExport() {
    setIsExporting(true);

    try {
      const json = await exportLocalData();
      if (json) {
        setExportJson(json);
      }
    } finally {
      setIsExporting(false);
    }
  }

  async function handleImport() {
    if (!importJson.trim()) {
      return;
    }

    setIsImporting(true);

    try {
      const didImport = await importLocalData(importJson);
      if (didImport) {
        setImportJson("");
      }
    } finally {
      setIsImporting(false);
    }
  }

  async function handleClearActivity() {
    if (!confirmClear) {
      return;
    }

    setIsClearing(true);

    try {
      const didClear = await clearActivityEntries(confirmClear);
      if (didClear) {
        setConfirmClear(false);
      }
    } finally {
      setIsClearing(false);
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
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-zinc-950">Application State</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  {hasUnsavedChanges ? "Unsaved changes" : "Current settings are saved"}
                </p>
              </div>
              <button
                type="button"
                disabled={!defaults}
                onClick={() => defaults && setDraft(defaults)}
                className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400"
              >
                Reset
              </button>
            </div>

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
                  min={MIN_ACTIVITY_LIMIT}
                  max={MAX_ACTIVITY_LIMIT}
                  value={draft.activityLimit}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      activityLimit: Number(event.target.value),
                    }))
                  }
                  className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-rose-700 focus:ring-2 focus:ring-rose-100"
                />
                {validationMessage && <span className="text-sm font-medium text-amber-700">{validationMessage}</span>}
              </label>

              <button
                type="submit"
                disabled={!canSave}
                className="inline-flex h-10 items-center justify-center rounded-md bg-rose-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                {isSaving ? "Saving" : "Save Settings"}
              </button>
            </div>
          </form>

          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-zinc-950">Current Values</h2>
            <dl className="mt-5 grid gap-4">
              <SettingRow label="Startup page" value={persisted?.startupPage ?? "Loading"} />
              <SettingRow label="Compact mode" value={persisted?.compactMode ? "On" : "Off"} />
              <SettingRow label="Activity limit" value={persisted ? String(persisted.activityLimit) : "Loading"} />
              <SettingRow label="Updated" value={persisted?.updatedAt ?? "Loading"} />
            </dl>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-zinc-950">Export Local Data</h2>
            <div className="mt-5 grid gap-4">
              <button
                type="button"
                onClick={handleExport}
                disabled={isExporting}
                className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                {isExporting ? "Exporting" : "Export JSON"}
              </button>
              <textarea
                value={exportJson}
                onChange={(event) => setExportJson(event.target.value)}
                rows={9}
                className="resize-none rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-800 outline-none focus:border-rose-700 focus:ring-2 focus:ring-rose-100"
              />
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-zinc-950">Import And Clear</h2>
            <div className="mt-5 grid gap-4">
              <textarea
                value={importJson}
                onChange={(event) => setImportJson(event.target.value)}
                rows={7}
                className="resize-none rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs text-zinc-800 outline-none focus:border-rose-700 focus:ring-2 focus:ring-rose-100"
              />
              <button
                type="button"
                onClick={handleImport}
                disabled={isImporting || importJson.trim().length === 0}
                className="inline-flex h-10 items-center justify-center rounded-md bg-rose-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                {isImporting ? "Importing" : "Import JSON"}
              </button>

              <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
                <label className="flex items-center gap-3 text-sm font-medium text-amber-900">
                  <input
                    type="checkbox"
                    checked={confirmClear}
                    onChange={(event) => setConfirmClear(event.target.checked)}
                    className="h-5 w-5 accent-amber-700"
                  />
                  Confirm clearing local activity
                </label>
                <button
                  type="button"
                  onClick={handleClearActivity}
                  disabled={!confirmClear || isClearing}
                  className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-amber-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                >
                  {isClearing ? "Clearing" : "Clear Activity"}
                </button>
              </div>
            </div>
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

function validateDraft(draft: SaveSettingsInput) {
  if (!Number.isInteger(draft.activityLimit)) {
    return "Activity limit must be a whole number";
  }

  if (draft.activityLimit < MIN_ACTIVITY_LIMIT || draft.activityLimit > MAX_ACTIVITY_LIMIT) {
    return `Activity limit must be between ${MIN_ACTIVITY_LIMIT} and ${MAX_ACTIVITY_LIMIT}`;
  }

  return null;
}
