import { getCurrentWindow } from "@tauri-apps/api/window";
import { memo, useCallback, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";

import type {
  ChampSelectPlayer,
  ChampSelectRecentStatsStatus,
  MatchResult,
  RankedQueueSummary,
  RecentMatchSummary,
} from "../backend/types";
import type { EffectiveLanguage, TranslationKey } from "../i18n";
import type { LeagueChampionAbilityView, LeagueChampionDetailsView } from "../state/AppStateProvider";
import { useAppCore, useChampSelect, useLeagueAssets } from "../state/AppStateProvider";
import { canOpenSelfHistoryOverlayWindow, destroySelfHistoryOverlayWindow } from "../windows/selfHistoryOverlayWindow";

const TEAM_SIZE = 5;
const MATCH_ROWS = 6;
const HISTORY_LOAD_TIMEOUT_MS = 8000;

type T = (key: TranslationKey) => string;
type TeamTone = "ally" | "enemy";

type MatchRowView = {
  id: string;
  imageUrl: string | undefined;
  match: RecentMatchSummary | null;
};

type PlayerView = {
  id: string;
  badge: string;
  championId: number | null | undefined;
  championUrl: string | undefined;
  displayName: string;
  flexRank: string | null;
  gameCount: number;
  isEmpty: boolean;
  rows: MatchRowView[];
  score: number | null;
  soloRank: string | null;
  recentStatsStatus: ChampSelectRecentStatsStatus;
  winCount: number;
};

type OverlayModel = {
  allies: PlayerView[];
  enemies: PlayerView[];
  summary: {
    allyGames: number;
    allyWins: number;
    enemyGames: number;
    enemyWins: number;
  };
};

type InitialSnapshotStatus = "loading" | "ready" | "error";

export function SelfHistoryOverlay() {
  const { effectiveLanguage, t } = useAppCore();
  const { champSelectSnapshot, refreshChampSelectSnapshot } = useChampSelect();
  const { championDetailsById, leagueImages, loadLeagueChampionDetails } = useLeagueAssets();
  const [selectedChampionId, setSelectedChampionId] = useState<number | null>(null);
  const [isChampionDetailsLoading, setIsChampionDetailsLoading] = useState(false);
  const [championDetailsError, setChampionDetailsError] = useState(false);
  const [isRefreshingChampSelect, setIsRefreshingChampSelect] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [isOverlayAllowed, setIsOverlayAllowed] = useState(false);
  const [initialSnapshotStatus, setInitialSnapshotStatus] = useState<InitialSnapshotStatus>("loading");
  const players = champSelectSnapshot?.players ?? [];
  const hasPlayers = players.length > 0;
  const hasRecentStats = players.some((player) => player.recentStats !== null);
  const isHistoryLoading = hasPlayers && !hasRecentStats && initialSnapshotStatus === "loading";
  const isHistoryUnavailable = hasPlayers && !hasRecentStats && initialSnapshotStatus === "error";
  const selectedChampionDetails = selectedChampionId ? championDetailsById[selectedChampionId] : undefined;
  const model = useMemo(
    () => createOverlayModel(players, leagueImages.championIcons, effectiveLanguage, t),
    [effectiveLanguage, leagueImages.championIcons, players, t],
  );

  useEffect(() => {
    let wasCancelled = false;

    void canOpenSelfHistoryOverlayWindow().then(async (canOpen) => {
      if (wasCancelled) {
        return;
      }

      if (!canOpen) {
        await destroySelfHistoryOverlayWindow();
        return;
      }

      setIsOverlayAllowed(true);
    });

    return () => {
      wasCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!refreshFailed) {
      return;
    }

    const timer = window.setTimeout(() => setRefreshFailed(false), 2500);
    return () => window.clearTimeout(timer);
  }, [refreshFailed]);

  useEffect(() => {
    if (!isOverlayAllowed) {
      return;
    }

    let wasCancelled = false;
    setInitialSnapshotStatus("loading");
    void refreshChampSelectSnapshot().then((didRefresh) => {
      if (!wasCancelled) {
        setInitialSnapshotStatus(didRefresh ? "loading" : "error");
      }
    });

    return () => {
      wasCancelled = true;
    };
  }, [isOverlayAllowed, refreshChampSelectSnapshot]);

  useEffect(() => {
    if (hasRecentStats) {
      setInitialSnapshotStatus("ready");
    }
  }, [hasRecentStats]);

  useEffect(() => {
    if (!isHistoryLoading) {
      return;
    }

    const timer = window.setTimeout(() => {
      setInitialSnapshotStatus((currentStatus) => (currentStatus === "loading" ? "error" : currentStatus));
    }, HISTORY_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [isHistoryLoading]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedChampionId(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const closeChampionDetails = useCallback(() => {
    setSelectedChampionId(null);
  }, []);

  const handleChampionSelect = useCallback(
    async (event: MouseEvent, championId: number | null | undefined) => {
      event.stopPropagation();
      if (!championId) {
        return;
      }

      setSelectedChampionId(championId);
      setChampionDetailsError(false);
      if (championDetailsById[championId]) {
        return;
      }

      setIsChampionDetailsLoading(true);
      const didLoad = await loadLeagueChampionDetails(championId);
      setIsChampionDetailsLoading(false);
      setChampionDetailsError(!didLoad);
    },
    [championDetailsById, loadLeagueChampionDetails],
  );

  const handleRefreshChampSelect = useCallback(
    async (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (isRefreshingChampSelect) {
        return;
      }

      setRefreshFailed(false);
      setInitialSnapshotStatus("loading");
      setIsRefreshingChampSelect(true);
      const didRefresh = await refreshChampSelectSnapshot();
      setIsRefreshingChampSelect(false);
      setRefreshFailed(!didRefresh);
      setInitialSnapshotStatus(didRefresh ? "loading" : "error");
    },
    [isRefreshingChampSelect, refreshChampSelectSnapshot],
  );

  const handleHideOverlay = useCallback(async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    try {
      await getCurrentWindow().hide();
    } catch {
      console.warn("Self history overlay could not be hidden.");
    }
  }, []);

  if (!isOverlayAllowed) {
    return (
      <main className="flex h-screen items-center justify-center bg-[#e8edf3] text-sm font-bold text-slate-500">
        {t("common.pending")}
      </main>
    );
  }

  return (
    <main
      className="relative flex h-screen flex-col overflow-hidden bg-[#e8edf3] p-2 text-slate-700"
      onClick={closeChampionDetails}
    >
      <header
        className="mb-2 flex h-9 shrink-0 items-center justify-between rounded-md border border-white/80 bg-white/80 px-2 shadow-[0_1px_8px_rgba(15,23,42,0.10)] backdrop-blur"
      >
        <div className="flex min-w-0 items-center gap-2" data-tauri-drag-region>
          <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.14)]" />
          <p className="truncate text-xs font-black uppercase text-slate-600" data-tauri-drag-region>
            {t("overlay.windowTitle")}
          </p>
          <span className="hidden text-[11px] font-bold text-slate-400 lg:inline" data-tauri-drag-region>
            {t("overlay.dragHint")}
          </span>
        </div>
        <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
          {refreshFailed && (
            <span className="rounded border border-rose-100 bg-white px-2 py-1 text-xs font-bold text-rose-500 shadow-sm">
              {t("overlay.refreshFailed")}
            </span>
          )}
          <IconButton
            ariaLabel={t("overlay.refresh")}
            disabled={isRefreshingChampSelect}
            onClick={handleRefreshChampSelect}
            title={t("overlay.refresh")}
          >
            <RefreshIcon isSpinning={isRefreshingChampSelect} />
          </IconButton>
          <IconButton ariaLabel={t("overlay.hide")} onClick={handleHideOverlay} title={t("overlay.hide")}>
            <HideIcon />
          </IconButton>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
        <TeamBoard
          onChampionSelect={handleChampionSelect}
          players={model.enemies}
          selectedChampionId={selectedChampionId}
          t={t}
          tone="enemy"
        />
        <TeamBoard
          onChampionSelect={handleChampionSelect}
          players={model.allies}
          selectedChampionId={selectedChampionId}
          t={t}
          tone="ally"
        />
      </div>

      {(players.length === 0 || isHistoryLoading || isHistoryUnavailable) && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 rounded-md border border-slate-200 bg-white/95 px-5 py-3 text-center text-sm font-bold text-slate-500 shadow-lg">
          {initialSnapshotMessage(initialSnapshotStatus, t)}
        </div>
      )}

      {selectedChampionId && (
        <ChampionDetailsPanel
          details={selectedChampionDetails}
          hasError={championDetailsError}
          isLoading={isChampionDetailsLoading && !selectedChampionDetails}
          onClose={closeChampionDetails}
          t={t}
        />
      )}

      <SummaryBar summary={model.summary} t={t} />
    </main>
  );
}

const TeamBoard = memo(function TeamBoard({
  onChampionSelect,
  players,
  selectedChampionId,
  t,
  tone,
}: {
  onChampionSelect: (event: MouseEvent, championId: number | null | undefined) => void;
  players: PlayerView[];
  selectedChampionId: number | null;
  t: T;
  tone: TeamTone;
}) {
  return (
    <section
      className={[
        "grid h-full min-h-0 grid-cols-5 gap-2 rounded-md border bg-white/90 p-2 shadow-[0_0_0_1px_rgba(148,163,184,0.18),0_12px_28px_rgba(15,23,42,0.08)]",
        tone === "ally" ? "border-emerald-100" : "border-rose-100",
      ].join(" ")}
    >
      {players.map((player) => (
        <PlayerTrack
          key={player.id}
          onChampionSelect={onChampionSelect}
          player={player}
          selectedChampionId={selectedChampionId}
          t={t}
          tone={tone}
        />
      ))}
    </section>
  );
});

const PlayerTrack = memo(function PlayerTrack({
  onChampionSelect,
  player,
  selectedChampionId,
  t,
  tone,
}: {
  onChampionSelect: (event: MouseEvent, championId: number | null | undefined) => void;
  player: PlayerView;
  selectedChampionId: number | null;
  t: T;
  tone: TeamTone;
}) {
  const isSelected = Boolean(player.championId && player.championId === selectedChampionId);

  return (
    <article
      className={[
        "flex min-w-0 flex-col rounded-md border bg-gradient-to-b from-white to-slate-50/80 p-1.5 shadow-sm",
        player.isEmpty ? "border-slate-100 opacity-75" : tone === "ally" ? "border-emerald-100" : "border-rose-100",
      ].join(" ")}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="grid h-16 grid-cols-[4rem_minmax(0,1fr)] gap-1.5">
        <ChampionPortrait
          championId={player.championId}
          displayName={player.displayName}
          isSelected={isSelected}
          onSelect={onChampionSelect}
          src={player.championUrl}
          t={t}
          tone={tone}
        />
        <div className="grid min-w-0 grid-rows-2 gap-1">
          <RankPill label="S" title={t("overlay.rankUnavailable")} value={player.soloRank} />
          <RankPill label="F" title={t("overlay.rankUnavailable")} value={player.flexRank} />
        </div>
      </div>

      <div className="relative mt-2 rounded border border-slate-200 bg-white px-2 py-1.5 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase text-slate-400">{t("overlay.score")}</span>
          <span className="truncate text-sm font-black tabular-nums text-slate-800">{player.score ?? "--"}</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className={["h-full rounded-full", tone === "ally" ? "bg-emerald-400" : "bg-rose-400"].join(" ")}
            style={{ width: `${scoreWidth(player.score)}%` }}
          />
        </div>
        {player.badge && (
          <span
            className={[
              "absolute -right-px -top-2 flex h-5 min-w-7 items-center justify-center rounded-sm px-1 text-xs font-black text-white shadow-sm",
              tone === "ally" ? "bg-emerald-500" : "bg-rose-500",
            ].join(" ")}
            title={`${player.winCount}/${player.gameCount}`}
          >
            {player.badge}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between px-1 text-[11px] font-bold uppercase text-slate-400">
        <span>{t("overlay.recentSix")}</span>
        <span className="truncate text-right tabular-nums">
          {player.gameCount > 0 ? `${player.winCount}/${player.gameCount}` : recentStatsStatusMessage(player.recentStatsStatus, t)}
        </span>
      </div>
      <div className="mt-1 grid gap-1">
        {player.rows.map((row) => (
          <MatchRow key={row.id} row={row} />
        ))}
      </div>
    </article>
  );
});

const MatchRow = memo(function MatchRow({ row }: { row: MatchRowView }) {
  const match = row.match;

  return (
    <div
      className={[
        "grid h-8 grid-cols-[2rem_minmax(0,1fr)_2.4rem] items-center gap-1.5 rounded border px-1",
        match ? resultClass(match.result) : "border-slate-100 bg-slate-50 text-slate-300",
      ].join(" ")}
    >
      <SmallChampionIcon championName={match?.championName ?? "?"} src={row.imageUrl} />
      <span className="truncate text-center text-xs font-black tabular-nums">
        {match ? `${match.kills}/${match.deaths}/${match.assists}` : "--"}
      </span>
      <span className="truncate text-right text-[11px] font-black tabular-nums">
        {match?.kda === null || match?.kda === undefined ? "--" : match.kda.toFixed(1)}
      </span>
    </div>
  );
});

function ChampionDetailsPanel({
  details,
  hasError,
  isLoading,
  onClose,
  t,
}: {
  details: LeagueChampionDetailsView | undefined;
  hasError: boolean;
  isLoading: boolean;
  onClose: () => void;
  t: T;
}) {
  return (
    <aside
      className="absolute right-2 top-12 z-20 flex max-h-[calc(100vh-3.5rem)] w-[22rem] flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-2xl"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-3 py-3">
        {details?.squarePortraitUrl ? (
          <img alt="" className="h-12 w-12 rounded border border-slate-300 object-cover" src={details.squarePortraitUrl} />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded border border-slate-300 bg-slate-200 text-sm font-black text-slate-500">
            {details ? initials(details.championName) : "?"}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-black text-slate-900">{details?.championName ?? t("overlay.abilities")}</h2>
          <p className="truncate text-xs font-bold text-slate-500">{details?.title ?? t("overlay.readingAbilities")}</p>
        </div>
        <button
          aria-label={t("overlay.close")}
          className="flex h-8 w-8 items-center justify-center rounded border border-slate-300 bg-white text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          onClick={onClose}
          title={t("overlay.close")}
          type="button"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {isLoading && <p className="rounded bg-slate-100 px-3 py-2 text-sm font-bold text-slate-500">{t("overlay.loadingAbilities")}</p>}
        {hasError && !details && (
          <p className="rounded border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-500">
            {t("overlay.abilitiesUnavailable")}
          </p>
        )}
        {details && (
          <div className="grid gap-2">
            {details.abilities.map((ability) => (
              <AbilityCard ability={ability} key={`${ability.slot}-${ability.name}`} t={t} />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

const AbilityCard = memo(function AbilityCard({ ability, t }: { ability: LeagueChampionAbilityView; t: T }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-2 shadow-sm">
      <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-2">
        {ability.iconUrl ? (
          <img alt="" className="h-11 w-11 rounded border border-slate-300 object-cover" src={ability.iconUrl} />
        ) : (
          <div className="flex h-11 w-11 items-center justify-center rounded border border-slate-300 bg-slate-100 text-sm font-black text-slate-500">
            {ability.slot}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-5 min-w-8 items-center justify-center rounded bg-sky-50 px-1 text-xs font-black text-sky-600">
              {ability.slot}
            </span>
            <h3 className="truncate text-sm font-black text-slate-900">{ability.name}</h3>
          </div>
          <p className="mt-1 text-xs font-medium leading-snug text-slate-600">{ability.description}</p>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1 text-[11px] font-bold">
        <AbilityStat label={t("overlay.cooldown")} value={ability.cooldown} />
        <AbilityStat label={t("overlay.cost")} value={ability.cost} />
        <AbilityStat label={t("overlay.range")} value={ability.range} />
      </div>
    </section>
  );
});

function AbilityStat({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0 rounded bg-slate-50 px-1.5 py-1 text-center">
      <p className="truncate text-slate-400">{label}</p>
      <p className="truncate text-slate-700">{value ?? "-"}</p>
    </div>
  );
}

function SummaryBar({
  summary,
  t,
}: {
  summary: OverlayModel["summary"];
  t: T;
}) {
  return (
    <div className="mt-2 flex shrink-0 gap-3">
      <SummaryCard label={t("overlay.allyWins")} tone="ally" value={`${summary.allyWins}/${summary.allyGames}`} />
      <SummaryCard label={t("overlay.enemyWins")} tone="enemy" value={`${summary.enemyWins}/${summary.enemyGames}`} />
    </div>
  );
}

function SummaryCard({ label, tone, value }: { label: string; tone: TeamTone; value: string }) {
  return (
    <div className="rounded border border-white/80 bg-white/90 px-3 py-1.5 shadow-[0_0_0_1px_rgba(148,163,184,0.18)]">
      <p className="text-xs font-bold text-slate-400">{label}</p>
      <p className={["mt-0.5 text-base font-black tabular-nums", tone === "ally" ? "text-emerald-500" : "text-rose-500"].join(" ")}>
        {tone === "ally" ? "+" : "-"} {value}
      </p>
    </div>
  );
}

function ChampionPortrait({
  championId,
  displayName,
  isSelected,
  onSelect,
  src,
  t,
  tone,
}: {
  championId: number | null | undefined;
  displayName: string;
  isSelected: boolean;
  onSelect: (event: MouseEvent, championId: number | null | undefined) => void;
  src: string | undefined;
  t: T;
  tone: TeamTone;
}) {
  const baseClass = [
    "flex h-16 w-16 items-center justify-center rounded border object-cover shadow-sm transition",
    championId ? "cursor-pointer hover:scale-[1.02]" : "cursor-default",
    isSelected
      ? tone === "ally"
        ? "border-emerald-500 ring-2 ring-emerald-200"
        : "border-rose-500 ring-2 ring-rose-200"
      : "border-slate-300",
  ].join(" ");

  return (
    <button
      aria-label={championId ? `${t("overlay.viewAbilities")} ${displayName}` : t("overlay.unselected")}
      className="h-16 w-16 rounded"
      disabled={!championId}
      onClick={(event) => onSelect(event, championId)}
      title={displayName}
      type="button"
    >
      {src ? (
        <img alt="" className={baseClass} src={src} />
      ) : (
        <span className={`${baseClass} bg-slate-200 text-sm font-black text-slate-500`}>{initials(displayName)}</span>
      )}
    </button>
  );
}

function SmallChampionIcon({ championName, src }: { championName: string; src: string | undefined }) {
  if (src) {
    return <img alt="" className="h-6 w-6 rounded border border-slate-300 object-cover shadow-sm" src={src} />;
  }

  return (
    <div className="flex h-6 w-6 items-center justify-center rounded border border-slate-300 bg-slate-100 text-[10px] font-black text-slate-400">
      {initials(championName)}
    </div>
  );
}

function RankPill({ label, title, value }: { label: string; title: string; value: string | null }) {
  return (
    <div
      className={[
        "flex min-w-0 items-center gap-1 rounded border px-1.5 text-[11px] font-black",
        value ? "border-sky-100 bg-sky-50 text-sky-700" : "border-slate-100 bg-slate-50 text-slate-300",
      ].join(" ")}
      title={value ?? title}
    >
      <span className="shrink-0 text-slate-400">{label}</span>
      <span className="truncate">{value ?? "--"}</span>
    </div>
  );
}

function IconButton({
  ariaLabel,
  children,
  disabled,
  onClick,
  title,
}: {
  ariaLabel: string;
  children: ReactNode;
  disabled?: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  title: string;
}) {
  return (
    <button
      aria-label={ariaLabel}
      className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-sky-600 disabled:cursor-wait disabled:opacity-70"
      disabled={disabled}
      onClick={onClick}
      title={title}
      type="button"
    >
      {children}
    </button>
  );
}

function RefreshIcon({ isSpinning }: { isSpinning: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={isSpinning ? "h-4 w-4 animate-spin" : "h-4 w-4"}
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M20 11a8 8 0 0 0-14.5-4.6M4 4v5h5M4 13a8 8 0 0 0 14.5 4.6M20 20v-5h-5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
    </svg>
  );
}

function HideIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path d="M5 12h14" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
    </svg>
  );
}

function createOverlayModel(
  players: ChampSelectPlayer[],
  imageUrls: Record<number, string>,
  effectiveLanguage: EffectiveLanguage,
  t: T,
): OverlayModel {
  const allies = fillTeam(players.filter((player) => player.team === "ally")).map((player, index) =>
    playerView(player, index, "ally", imageUrls, effectiveLanguage, t),
  );
  const enemies = fillTeam(players.filter((player) => player.team === "enemy")).map((player, index) =>
    playerView(player, index, "enemy", imageUrls, effectiveLanguage, t),
  );

  return {
    allies,
    enemies,
    summary: {
      allyGames: teamGames(allies),
      allyWins: teamWins(allies),
      enemyGames: teamGames(enemies),
      enemyWins: teamWins(enemies),
    },
  };
}

function playerView(
  player: ChampSelectPlayer | null,
  index: number,
  tone: TeamTone,
  imageUrls: Record<number, string>,
  effectiveLanguage: EffectiveLanguage,
  t: T,
): PlayerView {
  const rows = fillMatches(player?.recentStats?.recentMatches ?? []).map((match, matchIndex) => ({
    id: match ? `${match.gameId}` : `${tone}-${index}-empty-${matchIndex}`,
    imageUrl: match?.championId ? imageUrls[match.championId] : undefined,
    match,
  }));
  const soloRank = player?.rankedQueues.find((queue) => queue.queue === "soloDuo");
  const flexRank = player?.rankedQueues.find((queue) => queue.queue === "flex");
  const stats = player?.recentStats ?? null;
  const winCount = stats?.recentMatches.filter((match) => match.result === "win").length ?? 0;
  const gameCount = stats?.recentMatches.length ?? 0;

  return {
    id: player ? `${tone}-${player.summonerId}` : `${tone}-empty-${index}`,
    badge: playerBadge(winCount, gameCount, tone),
    championId: player?.championId,
    championUrl: player?.championId ? imageUrls[player.championId] : undefined,
    displayName: player?.displayName ?? t("overlay.unselected"),
    flexRank: rankValue(flexRank, effectiveLanguage, t),
    gameCount,
    isEmpty: !player,
    rows,
    score: playerScore(player),
    soloRank: rankValue(soloRank, effectiveLanguage, t),
    recentStatsStatus: player?.recentStatsStatus ?? "notRequested",
    winCount,
  };
}

function fillTeam(players: ChampSelectPlayer[]) {
  return Array.from({ length: TEAM_SIZE }, (_, index) => players[index] ?? null);
}

function fillMatches(matches: RecentMatchSummary[]) {
  return Array.from({ length: MATCH_ROWS }, (_, index) => matches[index] ?? null);
}

function teamWins(players: PlayerView[]) {
  return players.reduce((total, player) => total + player.winCount, 0);
}

function teamGames(players: PlayerView[]) {
  return players.reduce((total, player) => total + player.gameCount, 0);
}

function playerScore(player: ChampSelectPlayer | null) {
  const stats = player?.recentStats;
  if (!stats || stats.recentMatches.length === 0) {
    return null;
  }

  const wins = stats.recentMatches.filter((match) => match.result === "win").length;
  const kda = stats.averageKda ?? 0;
  const volume = stats.matchCount * 408;

  return Math.round(volume + wins * 777 + kda * 1200);
}

function playerBadge(wins: number, games: number, tone: TeamTone) {
  if (games === 0) {
    return "";
  }

  if (tone === "ally") {
    return String(Math.max(1, wins));
  }

  return String(Math.max(1, games - wins));
}

function scoreWidth(score: number | null) {
  if (score === null) {
    return 0;
  }

  return Math.max(8, Math.min(100, Math.round(score / 220)));
}

function rankValue(summary: RankedQueueSummary | undefined, language: EffectiveLanguage, t: T) {
  if (!summary) {
    return null;
  }

  if (!summary.isRanked || !summary.tier) {
    return t("overlay.unranked");
  }

  const tier = rankTierLabel(summary.tier, language);
  const division = summary.division ? romanToNumber(summary.division) : "";

  return `${tier}${division}`;
}

function initialSnapshotMessage(status: InitialSnapshotStatus, t: T) {
  if (status === "loading") {
    return t("common.loading");
  }

  if (status === "error") {
    return t("overlay.historyUnavailable");
  }

  return t("overlay.empty");
}

function recentStatsStatusMessage(status: ChampSelectRecentStatsStatus, t: T) {
  if (status === "missingIdentity") {
    return t("overlay.historyIdentityUnavailable");
  }

  if (status === "unavailable") {
    return t("overlay.historyUnavailableShort");
  }

  if (status === "notRequested") {
    return "--";
  }

  return "0/0";
}

function rankTierLabel(tier: string, language: EffectiveLanguage) {
  const zhLabels: Record<string, string> = {
    IRON: "黑铁",
    BRONZE: "青铜",
    SILVER: "白银",
    GOLD: "黄金",
    PLATINUM: "铂金",
    EMERALD: "翡翠",
    DIAMOND: "钻石",
    MASTER: "大师",
    GRANDMASTER: "宗师",
    CHALLENGER: "王者",
  };

  const enLabels: Record<string, string> = {
    IRON: "Iron",
    BRONZE: "Bronze",
    SILVER: "Silver",
    GOLD: "Gold",
    PLATINUM: "Platinum",
    EMERALD: "Emerald",
    DIAMOND: "Diamond",
    MASTER: "Master",
    GRANDMASTER: "Grandmaster",
    CHALLENGER: "Challenger",
  };

  const labels = language === "zh" ? zhLabels : enLabels;
  return labels[tier.toUpperCase()] ?? tier;
}

function romanToNumber(value: string) {
  const labels: Record<string, string> = {
    I: "I",
    II: "II",
    III: "III",
    IV: "IV",
  };

  return labels[value.toUpperCase()] ?? value;
}

function resultClass(result: MatchResult) {
  if (result === "win") {
    return "border-emerald-100 bg-emerald-50 text-emerald-700";
  }
  if (result === "loss") {
    return "border-rose-100 bg-rose-50 text-rose-600";
  }

  return "border-slate-100 bg-slate-50 text-slate-400";
}

function initials(value: string) {
  const letters = value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return letters || "?";
}
