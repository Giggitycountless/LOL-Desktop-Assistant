import { FormEvent, useEffect, useId, useMemo, useState, type KeyboardEvent } from "react";

import { fetchLeagueChampionCatalog } from "../backend/leagueClient";
import type { AppLanguagePreference, AutoAcceptStatus, LeagueChampionSummary, SaveSettingsInput, StartupPage } from "../backend/types";
import type { TranslationKey } from "../i18n";
import { useAppCore } from "../state/AppStateProvider";

const MIN_ACTIVITY_LIMIT = 1;
const MAX_ACTIVITY_LIMIT = 500;
const CHAMPION_RESULT_LIMIT = 8;

type Translator = (key: TranslationKey) => string;

export function Settings() {
  const {
    snapshot,
    saveSettings,
    exportLocalData,
    importLocalData,
    clearActivityEntries,
    autoAcceptStatus,
    t,
  } = useAppCore();
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

  const activityValidationMessage = useMemo(() => validateActivityLimit(draft, t), [draft.activityLimit, t]);
  const automationValidationMessage = useMemo(() => validateAutomationDraft(draft, t), [draft, t]);
  const validationMessage = activityValidationMessage ?? automationValidationMessage;
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
                {activityValidationMessage && (
                  <span className="text-sm font-medium text-amber-700">{activityValidationMessage}</span>
                )}
              </label>

              <RoomAutomationPanel
                draft={draft}
                autoAcceptStatus={autoAcceptStatus}
                champions={champions}
                isLoadingChampions={isLoadingChampions}
                validationMessage={automationValidationMessage}
                onAutoAcceptChange={(enabled) =>
                  setDraft((current) => ({
                    ...current,
                    autoAcceptEnabled: enabled,
                  }))
                }
                onAutoPickEnabledChange={(enabled) =>
                  setDraft((current) => ({
                    ...current,
                    autoPickEnabled: enabled,
                  }))
                }
                onAutoPickChampionChange={(championId) =>
                  setDraft((current) => ({
                    ...current,
                    autoPickChampionId: championId,
                  }))
                }
                onAutoBanEnabledChange={(enabled) =>
                  setDraft((current) => ({
                    ...current,
                    autoBanEnabled: enabled,
                  }))
                }
                onAutoBanChampionChange={(championId) =>
                  setDraft((current) => ({
                    ...current,
                    autoBanChampionId: championId,
                  }))
                }
                t={t}
              />

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

function RoomAutomationPanel({
  draft,
  autoAcceptStatus,
  champions,
  isLoadingChampions,
  validationMessage,
  onAutoAcceptChange,
  onAutoPickEnabledChange,
  onAutoPickChampionChange,
  onAutoBanEnabledChange,
  onAutoBanChampionChange,
  t,
}: {
  draft: SaveSettingsInput;
  autoAcceptStatus: AutoAcceptStatus | null;
  champions: LeagueChampionSummary[];
  isLoadingChampions: boolean;
  validationMessage: string | null;
  onAutoAcceptChange: (enabled: boolean) => void;
  onAutoPickEnabledChange: (enabled: boolean) => void;
  onAutoPickChampionChange: (championId: number | null) => void;
  onAutoBanEnabledChange: (enabled: boolean) => void;
  onAutoBanChampionChange: (championId: number | null) => void;
  t: Translator;
}) {
  const statusItems = [
    {
      label: t("settings.autoAcceptShort"),
      value: draft.autoAcceptEnabled ? t("common.on") : t("common.off"),
      active: draft.autoAcceptEnabled,
    },
    {
      label: t("settings.autoAcceptStatus"),
      value: autoAcceptStatusLabel(autoAcceptStatus, t),
      active: autoAcceptStatus ? !["disabled", "error"].includes(autoAcceptStatus.state) : false,
    },
    {
      label: t("settings.autoPickShort"),
      value: automationSummary(draft.autoPickEnabled, draft.autoPickChampionId, champions, t),
      active: draft.autoPickEnabled && Boolean(draft.autoPickChampionId),
    },
    {
      label: t("settings.autoBanShort"),
      value: automationSummary(draft.autoBanEnabled, draft.autoBanChampionId, champions, t),
      active: draft.autoBanEnabled && Boolean(draft.autoBanChampionId),
    },
  ];

  return (
    <section className="grid gap-4 rounded-md border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-zinc-950">{t("settings.lobbyAutomation")}</h3>
        </div>
        <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-4">
          {statusItems.map((item) => (
            <div
              key={item.label}
              className={[
                "min-w-0 rounded-md border px-3 py-2",
                item.active ? "border-rose-200 bg-white" : "border-zinc-200 bg-zinc-100",
              ].join(" ")}
            >
              <div className="text-xs font-medium text-zinc-500">{item.label}</div>
              <div className="truncate text-sm font-semibold text-zinc-950">{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      <AutomationToggleRow
        label={t("settings.autoAccept")}
        enabled={draft.autoAcceptEnabled}
        onEnabledChange={onAutoAcceptChange}
      />

      <div className="grid gap-3 xl:grid-cols-2">
        <AutomationChampionPicker
          label={t("settings.autoPick")}
          enabled={draft.autoPickEnabled}
          championId={draft.autoPickChampionId}
          champions={champions}
          isLoading={isLoadingChampions}
          onEnabledChange={onAutoPickEnabledChange}
          onChampionChange={onAutoPickChampionChange}
          t={t}
        />
        <AutomationChampionPicker
          label={t("settings.autoBan")}
          enabled={draft.autoBanEnabled}
          championId={draft.autoBanChampionId}
          champions={champions}
          isLoading={isLoadingChampions}
          onEnabledChange={onAutoBanEnabledChange}
          onChampionChange={onAutoBanChampionChange}
          t={t}
        />
      </div>

      {validationMessage && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
          {validationMessage}
        </div>
      )}
    </section>
  );
}

function AutomationToggleRow({
  label,
  enabled,
  onEnabledChange,
}: {
  label: string;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-zinc-200 bg-white px-3 py-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-zinc-900">{label}</div>
      </div>
      <ToggleSwitch checked={enabled} label={label} onChange={onEnabledChange} />
    </div>
  );
}

function ToggleSwitch({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={[
        "relative h-7 w-12 flex-none rounded-full transition focus:outline-none focus:ring-2 focus:ring-rose-100",
        checked ? "bg-rose-700" : "bg-zinc-300",
      ].join(" ")}
    >
      <span
        className={[
          "absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition",
          checked ? "left-6" : "left-1",
        ].join(" ")}
      />
    </button>
  );
}

function AutomationChampionPicker({
  label,
  enabled,
  championId,
  champions,
  isLoading,
  onEnabledChange,
  onChampionChange,
  t,
}: {
  label: string;
  enabled: boolean;
  championId: number | null;
  champions: LeagueChampionSummary[];
  isLoading: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onChampionChange: (championId: number | null) => void;
  t: Translator;
}) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const selectedChampion = champions.find((champion) => champion.championId === championId) ?? null;
  const filteredChampions = useMemo(() => filterChampions(query, champions), [champions, query]);
  const isSearchDisabled = !enabled || isLoading || champions.length === 0;

  useEffect(() => {
    setActiveIndex(0);
  }, [filteredChampions]);

  function handleQueryChange(value: string) {
    setQuery(value);
    setIsOpen(true);
  }

  function selectChampion(champion: LeagueChampionSummary) {
    onChampionChange(champion.championId);
    setQuery("");
    setIsOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!isOpen && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      setIsOpen(true);
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, Math.max(filteredChampions.length - 1, 0)));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      const activeChampion = filteredChampions[activeIndex];
      if (activeChampion) {
        event.preventDefault();
        selectChampion(activeChampion);
      }
      return;
    }

    if (event.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <div className="grid gap-3 rounded-md border border-zinc-200 bg-white px-3 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-zinc-900">{label}</div>
        </div>
        <ToggleSwitch checked={enabled} label={label} onChange={onEnabledChange} />
      </div>

      <div className="relative grid gap-2">
        <label className="text-xs font-medium uppercase text-zinc-500">{t("settings.searchChampion")}</label>
        <input
          aria-controls={listId}
          aria-expanded={enabled && isOpen && !isSearchDisabled}
          aria-label={t("settings.searchChampion")}
          role="combobox"
          type="search"
          value={query}
          disabled={isSearchDisabled}
          placeholder={
            isLoading
              ? t("settings.loadingChampions")
              : selectedChampion
                ? selectedChampion.championName
                : t("settings.searchChampion")
          }
          onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
          onChange={(event) => handleQueryChange(event.target.value)}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          className={[
            "h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-rose-700 focus:ring-2 focus:ring-rose-100 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400",
            enabled && championId ? "pr-20" : "",
          ].join(" ")}
        />

        {enabled && championId && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              onChampionChange(null);
              setIsOpen(true);
            }}
            className="absolute right-2 top-7 inline-flex h-6 items-center rounded border border-zinc-200 bg-zinc-50 px-2 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100"
          >
            {t("settings.clearChampion")}
          </button>
        )}

        {enabled && isOpen && !isSearchDisabled && (
          <div
            className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-md border border-zinc-200 bg-white p-1 shadow-lg"
            id={listId}
            role="listbox"
          >
            {filteredChampions.length > 0 ? (
              filteredChampions.map((champion, index) => (
                <button
                  aria-selected={champion.championId === championId}
                  key={champion.championId}
                  role="option"
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    selectChampion(champion);
                  }}
                  className={[
                    "flex w-full items-center justify-between gap-3 rounded px-2 py-2 text-left text-sm transition hover:bg-rose-50",
                    champion.championId === championId || index === activeIndex
                      ? "bg-rose-50 text-rose-800"
                      : "text-zinc-800",
                  ].join(" ")}
                >
                  <span className="truncate font-medium">{champion.championName}</span>
                  <span className="text-xs font-semibold text-zinc-400">{champion.championId}</span>
                </button>
              ))
            ) : (
              <div className="px-2 py-3 text-sm text-zinc-500">{t("settings.noChampionMatches")}</div>
            )}
          </div>
        )}

        {enabled && !isLoading && champions.length === 0 && (
          <div className="text-sm text-amber-700">{t("settings.championSearchUnavailable")}</div>
        )}
        {enabled && !championId && <div className="text-sm text-zinc-500">{t("settings.noChampion")}</div>}
        {enabled && selectedChampion && (
          <div className="rounded-md border border-emerald-100 bg-emerald-50 px-2 py-1.5 text-sm font-medium text-emerald-700">
            {t("settings.selectedChampion")}: {selectedChampion.championName}
          </div>
        )}
      </div>
    </div>
  );
}

function validateActivityLimit(draft: SaveSettingsInput, t: Translator) {
  if (!Number.isInteger(draft.activityLimit)) {
    return t("settings.validationInteger");
  }

  if (draft.activityLimit < MIN_ACTIVITY_LIMIT || draft.activityLimit > MAX_ACTIVITY_LIMIT) {
    return `${t("settings.activityLimit")} ${MIN_ACTIVITY_LIMIT}-${MAX_ACTIVITY_LIMIT}`;
  }

  return null;
}

function validateAutomationDraft(draft: SaveSettingsInput, t: Translator) {
  if (draft.autoPickEnabled && !draft.autoPickChampionId) {
    return t("settings.validationPick");
  }

  if (draft.autoBanEnabled && !draft.autoBanChampionId) {
    return t("settings.validationBan");
  }

  return null;
}

function filterChampions(value: string, champions: LeagueChampionSummary[]) {
  const normalized = value.trim().toLowerCase();
  const filtered = normalized
    ? champions.filter(
        (champion) =>
          champion.championName.toLowerCase().includes(normalized) ||
          String(champion.championId).includes(normalized) ||
          championLabel(champion).toLowerCase().includes(normalized),
      )
    : champions;

  return filtered
    .slice()
    .sort((left, right) => left.championName.localeCompare(right.championName))
    .slice(0, CHAMPION_RESULT_LIMIT);
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

function autoAcceptStatusLabel(status: AutoAcceptStatus | null, t: (key: TranslationKey) => string) {
  if (!status) {
    return t("common.pending");
  }

  switch (status.state) {
    case "disabled":
      return t("common.off");
    case "waitingForClient":
      return t("settings.autoAcceptWaiting");
    case "connected":
      return t("common.connected");
    case "searching":
      return t("settings.autoAcceptSearching");
    case "readyCheckDetected":
      return t("settings.autoAcceptReadyCheck");
    case "accepting":
      return t("settings.autoAcceptAccepting");
    case "accepted":
      return t("settings.autoAcceptAccepted");
    case "error":
      return status.message ?? t("common.unavailable");
  }
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
