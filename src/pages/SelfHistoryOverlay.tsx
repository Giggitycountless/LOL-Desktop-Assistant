import { MouseEvent, useEffect, useState } from "react";

import type { ChampSelectPlayer, RankedQueueSummary, RecentMatchSummary } from "../backend/types";
import type { EffectiveLanguage, TranslationKey } from "../i18n";
import type { LeagueChampionAbilityView, LeagueChampionDetailsView } from "../state/AppStateProvider";
import { useAppCore, useChampSelect, useLeagueAssets } from "../state/AppStateProvider";

const TEAM_SIZE = 5;
const MATCH_ROWS = 10;

type T = (key: TranslationKey) => string;

export function SelfHistoryOverlay() {
  const { effectiveLanguage, t } = useAppCore();
  const { champSelectSnapshot, refreshChampSelectSnapshot } = useChampSelect();
  const {
    championDetailsById,
    leagueImages,
    loadLeagueChampionDetails,
  } = useLeagueAssets();
  const [selectedChampionId, setSelectedChampionId] = useState<number | null>(null);
  const [isChampionDetailsLoading, setIsChampionDetailsLoading] = useState(false);
  const [championDetailsError, setChampionDetailsError] = useState(false);
  const [isRefreshingChampSelect, setIsRefreshingChampSelect] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const players = champSelectSnapshot?.players ?? [];
  const allies = fillTeam(players.filter((player) => player.team === "ally"));
  const enemies = fillTeam(players.filter((player) => player.team === "enemy"));
  const selectedChampionDetails = selectedChampionId ? championDetailsById[selectedChampionId] : undefined;

  useEffect(() => {
    if (!refreshFailed) {
      return;
    }

    const timer = window.setTimeout(() => setRefreshFailed(false), 2500);
    return () => window.clearTimeout(timer);
  }, [refreshFailed]);

  async function handleChampionSelect(event: MouseEvent, championId: number | null | undefined) {
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
  }

  async function handleRefreshChampSelect(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (isRefreshingChampSelect) {
      return;
    }

    setRefreshFailed(false);
    setIsRefreshingChampSelect(true);
    const didRefresh = await refreshChampSelectSnapshot();
    setIsRefreshingChampSelect(false);
    setRefreshFailed(!didRefresh);
  }

  return (
    <main
      className="relative flex h-screen flex-col overflow-hidden bg-[#eef1f5] p-2 text-slate-700"
      onClick={() => setSelectedChampionId(null)}
    >
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
        <TeamBoard
          effectiveLanguage={effectiveLanguage}
          imageUrls={leagueImages.championIcons}
          onChampionSelect={handleChampionSelect}
          players={enemies}
          selectedChampionId={selectedChampionId}
          t={t}
          tone="enemy"
        />
        <TeamBoard
          effectiveLanguage={effectiveLanguage}
          imageUrls={leagueImages.championIcons}
          onChampionSelect={handleChampionSelect}
          players={allies}
          selectedChampionId={selectedChampionId}
          t={t}
          tone="ally"
        />
      </div>
      <div className="absolute right-2 top-2 z-10 flex items-center gap-2">
        {refreshFailed && (
          <span className="rounded border border-rose-100 bg-white/95 px-2 py-1 text-xs font-bold text-rose-500 shadow-sm">
            {t("overlay.refreshFailed")}
          </span>
        )}
        <button
          aria-label={t("overlay.refresh")}
          className="flex h-9 w-9 items-center justify-center rounded border border-slate-200 bg-white/95 text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-blue-500 disabled:cursor-wait disabled:opacity-70"
          disabled={isRefreshingChampSelect}
          onClick={handleRefreshChampSelect}
          title={t("overlay.refresh")}
          type="button"
        >
          <RefreshIcon isSpinning={isRefreshingChampSelect} />
        </button>
      </div>
      {players.length === 0 && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 rounded-md border border-slate-200 bg-white/95 px-5 py-3 text-center text-sm font-bold text-slate-500 shadow-sm">
          {t("overlay.empty")}
        </div>
      )}
      {selectedChampionId && (
        <ChampionDetailsPanel
          details={selectedChampionDetails}
          hasError={championDetailsError}
          isLoading={isChampionDetailsLoading && !selectedChampionDetails}
          onClose={(event) => {
            event.stopPropagation();
            setSelectedChampionId(null);
          }}
          t={t}
        />
      )}
      <SummaryBar allies={allies} enemies={enemies} t={t} />
    </main>
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

function TeamBoard({
  effectiveLanguage,
  imageUrls,
  onChampionSelect,
  players,
  selectedChampionId,
  t,
  tone,
}: {
  effectiveLanguage: EffectiveLanguage;
  imageUrls: Record<number, string>;
  onChampionSelect: (event: MouseEvent, championId: number | null | undefined) => void;
  players: Array<ChampSelectPlayer | null>;
  selectedChampionId: number | null;
  t: T;
  tone: "ally" | "enemy";
}) {
  return (
    <section className="grid h-full grid-cols-5 gap-2 rounded-md bg-white p-2 shadow-[0_0_0_1px_rgba(148,163,184,0.25),0_2px_8px_rgba(15,23,42,0.08)]">
      {players.map((player, index) => (
        <PlayerTrack
          effectiveLanguage={effectiveLanguage}
          imageUrls={imageUrls}
          key={player ? `${tone}-${player.summonerId}` : `${tone}-empty-${index}`}
          onChampionSelect={onChampionSelect}
          player={player}
          selectedChampionId={selectedChampionId}
          t={t}
          tone={tone}
        />
      ))}
    </section>
  );
}

function PlayerTrack({
  effectiveLanguage,
  imageUrls,
  onChampionSelect,
  player,
  selectedChampionId,
  t,
  tone,
}: {
  effectiveLanguage: EffectiveLanguage;
  imageUrls: Record<number, string>;
  onChampionSelect: (event: MouseEvent, championId: number | null | undefined) => void;
  player: ChampSelectPlayer | null;
  selectedChampionId: number | null;
  t: T;
  tone: "ally" | "enemy";
}) {
  const selectedChampionUrl = player?.championId ? imageUrls[player.championId] : undefined;
  const rows = fillMatches(player?.recentStats?.recentMatches ?? []);
  const soloRank = player?.rankedQueues.find((queue) => queue.queue === "soloDuo");
  const flexRank = player?.rankedQueues.find((queue) => queue.queue === "flex");
  const score = player ? playerScore(player) : 0;
  const badge = player ? playerBadge(player, tone) : "";

  return (
    <article className="min-w-0">
      <div className="grid h-14 grid-cols-[3.5rem_minmax(0,1fr)] gap-1">
        <ChampionPortrait
          championId={player?.championId}
          displayName={player?.displayName ?? t("overlay.unselected")}
          isSelected={Boolean(player?.championId && player.championId === selectedChampionId)}
          onSelect={onChampionSelect}
          src={selectedChampionUrl}
          t={t}
        />
        <div className="grid gap-1">
          <RankPill value={formatRank(soloRank, effectiveLanguage, t)} />
          <RankPill muted value={formatRank(flexRank, effectiveLanguage, t)} />
        </div>
      </div>

      <div className="relative mt-2 h-9 rounded border border-slate-200 bg-white px-2 py-1.5 shadow-sm">
        <p className="truncate text-center text-xs font-black italic text-slate-700">{t("overlay.score")}: {score}</p>
        {badge && (
          <span
            className={[
              "absolute -right-px -top-2 flex h-5 min-w-7 items-center justify-center rounded-sm px-1 text-xs font-black text-white",
              tone === "ally" ? "bg-emerald-500" : "bg-blue-500",
            ].join(" ")}
          >
            {badge}
          </span>
        )}
      </div>

      <div className="mt-3 grid gap-1.5">
        {rows.map((match, index) => (
          <MatchRow
            imageUrl={match?.championId ? imageUrls[match.championId] : undefined}
            key={match ? match.gameId : `empty-${index}`}
            match={match}
          />
        ))}
      </div>
    </article>
  );
}

function MatchRow({ imageUrl, match }: { imageUrl: string | undefined; match: RecentMatchSummary | null }) {
  return (
    <div className="grid h-8 grid-cols-[2rem_minmax(0,1fr)] gap-1.5">
      <SmallChampionIcon championName={match?.championName ?? "?"} src={imageUrl} />
      <div
        className={[
          "flex h-8 min-w-0 items-center justify-center rounded px-1 text-sm font-black italic",
          match ? resultClass(match) : "bg-slate-50 text-slate-300",
        ].join(" ")}
      >
        <span className="truncate">{match ? `${match.kills}-${match.deaths}-${match.assists}` : ""}</span>
      </div>
    </div>
  );
}

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
  onClose: (event: MouseEvent<HTMLButtonElement>) => void;
  t: T;
}) {
  return (
    <aside
      className="absolute right-2 top-2 z-20 flex max-h-[calc(100vh-1rem)] w-[22rem] flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-2xl"
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
          className="flex h-8 w-8 items-center justify-center rounded border border-slate-300 bg-white text-lg font-black text-slate-500 hover:bg-slate-100"
          onClick={onClose}
          type="button"
        >
          x
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

function AbilityCard({ ability, t }: { ability: LeagueChampionAbilityView; t: T }) {
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
            <span className="flex h-5 min-w-8 items-center justify-center rounded bg-blue-50 px-1 text-xs font-black text-blue-500">
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
}

function AbilityStat({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0 rounded bg-slate-50 px-1.5 py-1 text-center">
      <p className="text-slate-400">{label}</p>
      <p className="truncate text-slate-700">{value ?? "-"}</p>
    </div>
  );
}

function SummaryBar({
  allies,
  enemies,
  t,
}: {
  allies: Array<ChampSelectPlayer | null>;
  enemies: Array<ChampSelectPlayer | null>;
  t: T;
}) {
  const allyWins = teamWins(allies);
  const allyGames = teamGames(allies);
  const enemyWins = teamWins(enemies);
  const enemyGames = teamGames(enemies);

  return (
    <div className="mt-2 flex shrink-0 gap-3">
      <SummaryCard label={t("overlay.allyWins")} tone="ally" value={`${allyWins}/${allyGames}`} />
      <SummaryCard label={t("overlay.enemyWins")} tone="enemy" value={`${enemyWins}/${enemyGames}`} />
    </div>
  );
}

function SummaryCard({ label, tone, value }: { label: string; tone: "ally" | "enemy"; value: string }) {
  return (
    <div className="rounded bg-white px-3 py-1.5 shadow-[0_0_0_1px_rgba(148,163,184,0.25)]">
      <p className="text-xs font-bold text-slate-400">{label}</p>
      <p className={["mt-0.5 text-base font-black", tone === "ally" ? "text-emerald-500" : "text-rose-500"].join(" ")}>
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
}: {
  championId: number | null | undefined;
  displayName: string;
  isSelected: boolean;
  onSelect: (event: MouseEvent, championId: number | null | undefined) => void;
  src: string | undefined;
  t: T;
}) {
  const baseClass = [
    "flex h-14 w-14 items-center justify-center rounded border object-cover shadow-sm transition",
    championId ? "cursor-pointer hover:scale-[1.03] hover:border-blue-400" : "cursor-default",
    isSelected ? "border-blue-500 ring-2 ring-blue-200" : "border-slate-300",
  ].join(" ");

  return (
    <button
      aria-label={championId ? `${t("overlay.viewAbilities")} ${displayName}` : t("overlay.unselected")}
      className="h-14 w-14 rounded"
      disabled={!championId}
      onClick={(event) => onSelect(event, championId)}
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
    return <img alt="" className="h-8 w-8 rounded border border-slate-300 object-cover shadow-sm" src={src} />;
  }

  return (
    <div className="flex h-8 w-8 items-center justify-center rounded border border-slate-300 bg-slate-100 text-[10px] font-black text-slate-400">
      {initials(championName)}
    </div>
  );
}

function RankPill({ muted = false, value }: { muted?: boolean; value: string }) {
  return (
    <div
      className={[
        "flex h-[1.625rem] min-w-0 items-center justify-center rounded bg-blue-50 px-1 text-sm font-black",
        muted ? "text-blue-300" : "text-blue-500",
      ].join(" ")}
    >
      <span className="truncate">{value}</span>
    </div>
  );
}

function fillTeam(players: ChampSelectPlayer[]) {
  return Array.from({ length: TEAM_SIZE }, (_, index) => players[index] ?? null);
}

function fillMatches(matches: RecentMatchSummary[]) {
  return Array.from({ length: MATCH_ROWS }, (_, index) => matches[index] ?? null);
}

function teamWins(players: Array<ChampSelectPlayer | null>) {
  return players.reduce((total, player) => total + (player?.recentStats?.recentMatches.filter((match) => match.result === "win").length ?? 0), 0);
}

function teamGames(players: Array<ChampSelectPlayer | null>) {
  return players.reduce((total, player) => total + (player?.recentStats?.recentMatches.length ?? 0), 0);
}

function playerScore(player: ChampSelectPlayer) {
  const stats = player.recentStats;
  if (!stats || stats.recentMatches.length === 0) {
    return 0;
  }

  const wins = stats.recentMatches.filter((match) => match.result === "win").length;
  const kda = stats.averageKda ?? 0;
  const volume = stats.matchCount * 408;

  return Math.round(volume + wins * 777 + kda * 1200);
}

function playerBadge(player: ChampSelectPlayer, tone: "ally" | "enemy") {
  const stats = player.recentStats;
  if (!stats || stats.recentMatches.length === 0) {
    return "";
  }

  const wins = stats.recentMatches.filter((match) => match.result === "win").length;
  if (tone === "ally") {
    return String(Math.max(1, wins));
  }

  return String(Math.max(1, stats.matchCount - wins));
}

function formatRank(summary: RankedQueueSummary | undefined, language: EffectiveLanguage, t: T) {
  if (!summary || !summary.isRanked || !summary.tier) {
    return t("overlay.unranked");
  }

  const tier = rankTierLabel(summary.tier, language);
  const division = summary.division ? romanToNumber(summary.division) : "";

  return `${tier}${division}`;
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

function resultClass(match: RecentMatchSummary) {
  if (match.result === "win") {
    return "bg-emerald-100 text-emerald-600";
  }
  if (match.result === "loss") {
    return "bg-rose-100 text-rose-500";
  }

  return "bg-slate-100 text-slate-400";
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
