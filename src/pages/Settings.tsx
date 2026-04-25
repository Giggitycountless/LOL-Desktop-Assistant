import { FormEvent, useEffect, useMemo, useState } from "react";

import { fetchLeagueChampionCatalog } from "../backend/leagueClient";
import type { AppLanguagePreference, LeagueChampionSummary, SaveSettingsInput, StartupPage } from "../backend/types";
import type { TranslationKey } from "../i18n";
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
    t,
  } = useAppState();
  const [draft, setDraft] = useState<SaveSettingsInput>({
    startupPage: "dashboard",
    language: "system",
    compactMode: false,
    activityLimit: 100,
    autoAcceptEnabled: true,
    autoPickEnabled: false,
    autoPickChampionId: null,
    autoBanEnabled: false,
    autoBanChampionId: null,
  });
  const [champions, setChampions] = useState<LeagueChampionSummary[]>([]);
  const [isLoadingChampions, setIsLoadingChampions] = useState(false);
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
        language: persisted.language,
        compactMode: persisted.compactMode,
        activityLimit: persisted.activityLimit,
        autoAcceptEnabled: persisted.autoAcceptEnabled,
        autoPickEnabled: persisted.autoPickEnabled,
        autoPickChampionId: persisted.autoPickChampionId,
        autoBanEnabled: persisted.autoBanEnabled,
        autoBanChampionId: persisted.autoBanChampionId,
      });
    }
  }, [persisted]);

  useEffect(() => {
    let isMounted = true;
    setIsLoadingChampions(true);

    fetchLeagueChampionCatalog()
      .then((records) => {
        if (isMounted) {
          setChampions(records);
        }
      })
      .catch(() => {
        if (isMounted) {
          setChampions([]);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingChampions(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const validationMessage = useMemo(() => validateDraft(draft, t), [draft, t]);
  const hasUnsavedChanges = Boolean(
    persisted &&
      (draft.startupPage !== persisted.startupPage ||
        draft.language !== persisted.language ||
        draft.compactMode !== persisted.compactMode ||
        draft.activityLimit !== persisted.activityLimit ||
        draft.autoAcceptEnabled !== persisted.autoAcceptEnabled ||
        draft.autoPickEnabled !== persisted.autoPickEnabled ||
        draft.autoPickChampionId !== persisted.autoPickChampionId ||
        draft.autoBanEnabled !== persisted.autoBanEnabled ||
        draft.autoBanChampionId !== persisted.autoBanChampionId),
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
          <p className="text-sm font-medium uppercase tracking-wide text-rose-700">{t("settings.eyebrow")}</p>
          <h1 className="mt-2 text-3xl font-semibold text-zinc-950">{t("settings.title")}</h1>
        </header>

        <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <form className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm" onSubmit={handleSubmit}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-zinc-950">{t("settings.applicationState")}</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  {hasUnsavedChanges ? t("settings.unsaved") : t("settings.saved")}
                </p>
              </div>
              <button
                type="button"
                disabled={!defaults}
                onClick={() => defaults && setDraft(defaults)}
                className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400"
              >
                {t("settings.reset")}
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-zinc-700">{t("settings.startupPage")}</span>
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
                  <option value="dashboard">{t("nav.dashboard")}</option>
                  <option value="activity">{t("nav.activity")}</option>
                  <option value="settings">{t("nav.settings")}</option>
                </select>
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-zinc-700">{t("settings.language")}</span>
                <select
                  value={draft.language}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      language: event.target.value as AppLanguagePreference,
                    }))
                  }
                  className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-rose-700 focus:ring-2 focus:ring-rose-100"
                >
                  <option value="system">{t("settings.languageSystem")}</option>
                  <option value="zh">{t("settings.languageZh")}</option>
                  <option value="en">{t("settings.languageEn")}</option>
                </select>
              </label>

              <label className="flex items-center justify-between gap-4 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3">
                <span className="text-sm font-medium text-zinc-700">{t("settings.compactMode")}</span>
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
                <span className="text-sm font-medium text-zinc-700">{t("settings.activityLimit")}</span>
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

              <div className="grid gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-4">
                <h3 className="text-sm font-semibold text-zinc-950">{t("settings.lobbyAutomation")}</h3>
                <label className="flex items-center justify-between gap-4">
                  <span className="text-sm font-medium text-zinc-700">{t("settings.autoAccept")}</span>
                  <input
                    type="checkbox"
                    checked={draft.autoAcceptEnabled}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        autoAcceptEnabled: event.target.checked,
                      }))
                    }
                    className="h-5 w-5 accent-rose-700"
                  />
                </label>

                <AutomationChampionPicker
                  label={t("settings.autoPick")}
                  loadingLabel={t("settings.loadingChampions")}
                  searchLabel={t("settings.searchChampion")}
                  enabled={draft.autoPickEnabled}
                  championId={draft.autoPickChampionId}
                  champions={champions}
                  isLoading={isLoadingChampions}
                  onEnabledChange={(enabled) =>
                    setDraft((current) => ({
                      ...current,
                      autoPickEnabled: enabled,
                    }))
                  }
                  onChampionChange={(championId) =>
                    setDraft((current) => ({
                      ...current,
                      autoPickChampionId: championId,
                    }))
                  }
                />

                <AutomationChampionPicker
                  label={t("settings.autoBan")}
                  loadingLabel={t("settings.loadingChampions")}
                  searchLabel={t("settings.searchChampion")}
                  enabled={draft.autoBanEnabled}
                  championId={draft.autoBanChampionId}
                  champions={champions}
                  isLoading={isLoadingChampions}
                  onEnabledChange={(enabled) =>
                    setDraft((current) => ({
                      ...current,
                      autoBanEnabled: enabled,
                    }))
                  }
                  onChampionChange={(championId) =>
                    setDraft((current) => ({
                      ...current,
                      autoBanChampionId: championId,
                    }))
                  }
                />
              </div>

              <button
                type="submit"
                disabled={!canSave}
                className="inline-flex h-10 items-center justify-center rounded-md bg-rose-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                {isSaving ? t("common.saving") : t("settings.saveSettings")}
              </button>
            </div>
          </form>

          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-zinc-950">{t("settings.currentValues")}</h2>
            <dl className="mt-5 grid gap-4">
              <SettingRow label={t("settings.startupPage")} value={persisted ? startupPageLabel(persisted.startupPage, t) : t("common.loading")} />
              <SettingRow label={t("settings.language")} value={persisted ? languageLabel(persisted.language, t) : t("common.loading")} />
              <SettingRow label={t("settings.compactMode")} value={persisted?.compactMode ? t("common.on") : t("common.off")} />
              <SettingRow label={t("settings.activityLimit")} value={persisted ? String(persisted.activityLimit) : t("common.loading")} />
              <SettingRow label={t("settings.autoAcceptShort")} value={persisted ? (persisted.autoAcceptEnabled ? t("common.on") : t("common.off")) : t("common.loading")} />
              <SettingRow label={t("settings.autoPickShort")} value={persisted ? automationSummary(persisted.autoPickEnabled, persisted.autoPickChampionId, champions, t) : t("common.loading")} />
              <SettingRow label={t("settings.autoBanShort")} value={persisted ? automationSummary(persisted.autoBanEnabled, persisted.autoBanChampionId, champions, t) : t("common.loading")} />
              <SettingRow label={t("dashboard.updated")} value={persisted?.updatedAt ?? t("common.loading")} />
            </dl>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-zinc-950">{t("settings.exportLocalData")}</h2>
            <div className="mt-5 grid gap-4">
              <button
                type="button"
                onClick={handleExport}
                disabled={isExporting}
                className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                {isExporting ? t("common.exporting") : t("settings.exportJson")}
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
            <h2 className="text-base font-semibold text-zinc-950">{t("settings.importAndClear")}</h2>
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
                {isImporting ? t("common.importing") : t("settings.importJson")}
              </button>

              <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
                <label className="flex items-center gap-3 text-sm font-medium text-amber-900">
                  <input
                    type="checkbox"
                    checked={confirmClear}
                    onChange={(event) => setConfirmClear(event.target.checked)}
                    className="h-5 w-5 accent-amber-700"
                  />
                  {t("settings.confirmClear")}
                </label>
                <button
                  type="button"
                  onClick={handleClearActivity}
                  disabled={!confirmClear || isClearing}
                  className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-amber-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                >
                  {isClearing ? t("common.clear") : t("settings.clearActivity")}
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

function AutomationChampionPicker({
  label,
  loadingLabel,
  searchLabel,
  enabled,
  championId,
  champions,
  isLoading,
  onEnabledChange,
  onChampionChange,
}: {
  label: string;
  loadingLabel: string;
  searchLabel: string;
  enabled: boolean;
  championId: number | null;
  champions: LeagueChampionSummary[];
  isLoading: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onChampionChange: (championId: number | null) => void;
}) {
  const listId = `${label.toLowerCase().replace(/\s+/g, "-")}-list`;
  const [query, setQuery] = useState("");

  useEffect(() => {
    const selected = champions.find((champion) => champion.championId === championId);
    setQuery(selected ? championLabel(selected) : "");
  }, [championId, champions]);

  function handleQueryChange(value: string) {
    setQuery(value);
    const champion = findChampion(value, champions);
    onChampionChange(champion?.championId ?? null);
  }

  return (
    <div className="grid gap-2 rounded-md border border-zinc-200 bg-white px-3 py-3">
      <label className="flex items-center justify-between gap-4">
        <span className="text-sm font-medium text-zinc-700">{label}</span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
          className="h-5 w-5 accent-rose-700"
        />
      </label>
      <div className="grid gap-1">
        <input
          type="search"
          list={listId}
          value={query}
          disabled={!enabled}
          placeholder={isLoading ? loadingLabel : searchLabel}
          onChange={(event) => handleQueryChange(event.target.value)}
          className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-rose-700 focus:ring-2 focus:ring-rose-100 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
        />
        <datalist id={listId}>
          {champions.map((champion) => (
            <option key={champion.championId} value={championLabel(champion)} />
          ))}
        </datalist>
      </div>
    </div>
  );
}

function validateDraft(draft: SaveSettingsInput, t: (key: TranslationKey) => string) {
  if (!Number.isInteger(draft.activityLimit)) {
    return t("settings.validationInteger");
  }

  if (draft.activityLimit < MIN_ACTIVITY_LIMIT || draft.activityLimit > MAX_ACTIVITY_LIMIT) {
    return `${t("settings.activityLimit")} ${MIN_ACTIVITY_LIMIT}-${MAX_ACTIVITY_LIMIT}`;
  }

  if (draft.autoPickEnabled && !draft.autoPickChampionId) {
    return t("settings.validationPick");
  }

  if (draft.autoBanEnabled && !draft.autoBanChampionId) {
    return t("settings.validationBan");
  }

  return null;
}

function findChampion(value: string, champions: LeagueChampionSummary[]) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return (
    champions.find((champion) => championLabel(champion).toLowerCase() === normalized) ??
    champions.find((champion) => champion.championName.toLowerCase() === normalized) ??
    champions.find((champion) => String(champion.championId) === normalized) ??
    null
  );
}

function championLabel(champion: LeagueChampionSummary) {
  return `${champion.championName} (${champion.championId})`;
}

function automationSummary(
  enabled: boolean | undefined,
  championId: number | null | undefined,
  champions: LeagueChampionSummary[],
  t: (key: TranslationKey) => string,
) {
  if (!enabled) {
    return t("common.off");
  }

  const champion = champions.find((record) => record.championId === championId);
  return champion?.championName ?? (championId ? String(championId) : t("settings.noChampion"));
}

function startupPageLabel(page: StartupPage, t: (key: TranslationKey) => string) {
  switch (page) {
    case "dashboard":
      return t("nav.dashboard");
    case "activity":
      return t("nav.activity");
    case "settings":
      return t("nav.settings");
  }
}

function languageLabel(language: AppLanguagePreference, t: (key: TranslationKey) => string) {
  switch (language) {
    case "system":
      return t("settings.languageSystem");
    case "zh":
      return t("settings.languageZh");
    case "en":
      return t("settings.languageEn");
  }
}
