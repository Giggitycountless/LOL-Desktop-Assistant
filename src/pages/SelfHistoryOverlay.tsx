import { useEffect } from "react";

import type { ChampSelectPlayer, RankedQueueSummary, RecentMatchSummary } from "../backend/types";
import { useAppState } from "../state/AppStateProvider";

const TEAM_SIZE = 5;
const MATCH_ROWS = 10;

export function SelfHistoryOverlay() {
  const {
    champSelectSnapshot,
    leagueImages,
    leagueSelfSnapshot,
    loadLeagueChampionIcon,
    loadLeagueProfileIcon,
    refreshLeagueClient,
  } = useAppState();
  const profileIconId = leagueSelfSnapshot?.summoner?.profileIconId ?? null;
  const players = champSelectSnapshot?.players ?? [];
  const allies = fillTeam(players.filter((player) => player.team === "ally"));
  const enemies = fillTeam(players.filter((player) => player.team === "enemy"));

  useEffect(() => {
    void refreshLeagueClient({ matchLimit: 6 });
  }, [refreshLeagueClient]);

  useEffect(() => {
    void loadLeagueProfileIcon(profileIconId);
  }, [loadLeagueProfileIcon, profileIconId]);

  useEffect(() => {
    for (const player of players) {
      void loadLeagueChampionIcon(player.championId);
      for (const match of player.recentStats?.recentMatches ?? []) {
        void loadLeagueChampionIcon(match.championId);
      }
    }
  }, [loadLeagueChampionIcon, players]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#eef1f5] p-2 text-slate-700">
      <div className="grid h-[calc(100vh-4rem)] grid-cols-2 gap-2">
        <TeamBoard imageUrls={leagueImages.championIcons} players={enemies} tone="enemy" />
        <TeamBoard imageUrls={leagueImages.championIcons} players={allies} tone="ally" />
      </div>
      {players.length === 0 && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 rounded-md border border-slate-200 bg-white/95 px-5 py-3 text-center text-sm font-bold text-slate-500 shadow-sm">
          未读取到英雄选择数据
        </div>
      )}
      <SummaryBar allies={allies} enemies={enemies} />
    </main>
  );
}

function TeamBoard({
  imageUrls,
  players,
  tone,
}: {
  imageUrls: Record<number, string>;
  players: Array<ChampSelectPlayer | null>;
  tone: "ally" | "enemy";
}) {
  return (
    <section className="grid h-full grid-cols-5 gap-2 rounded-md bg-white p-2 shadow-[0_0_0_1px_rgba(148,163,184,0.25),0_2px_8px_rgba(15,23,42,0.08)]">
      {players.map((player, index) => (
        <PlayerTrack
          imageUrls={imageUrls}
          key={player ? `${tone}-${player.summonerId}` : `${tone}-empty-${index}`}
          player={player}
          tone={tone}
        />
      ))}
    </section>
  );
}

function PlayerTrack({
  imageUrls,
  player,
  tone,
}: {
  imageUrls: Record<number, string>;
  player: ChampSelectPlayer | null;
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
        <ChampionPortrait displayName={player?.displayName ?? "未定级"} src={selectedChampionUrl} />
        <div className="grid gap-1">
          <RankPill value={formatRank(soloRank)} />
          <RankPill muted value={formatRank(flexRank)} />
        </div>
      </div>

      <div className="relative mt-2 h-9 rounded border border-slate-200 bg-white px-2 py-1.5 shadow-sm">
        <p className="truncate text-center text-xs font-black italic text-slate-700">Score: {score}</p>
        {badge && (
          <span className={["absolute -right-px -top-2 flex h-5 min-w-7 items-center justify-center rounded-sm px-1 text-xs font-black text-white", tone === "ally" ? "bg-emerald-500" : "bg-blue-500"].join(" ")}>
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
      <div className={["flex h-8 min-w-0 items-center justify-center rounded px-1 text-sm font-black italic", match ? resultClass(match) : "bg-slate-50 text-slate-300"].join(" ")}>
        <span className="truncate">{match ? `${match.kills}-${match.deaths}-${match.assists}` : ""}</span>
      </div>
    </div>
  );
}

function SummaryBar({
  allies,
  enemies,
}: {
  allies: Array<ChampSelectPlayer | null>;
  enemies: Array<ChampSelectPlayer | null>;
}) {
  const allyWins = teamWins(allies);
  const allyGames = teamGames(allies);
  const enemyWins = teamWins(enemies);
  const enemyGames = teamGames(enemies);

  return (
    <div className="mt-2 flex gap-3">
      <SummaryCard label="友方胜利次数" tone="ally" value={`${allyWins}/${allyGames}`} />
      <SummaryCard label="敌方胜利次数" tone="enemy" value={`${enemyWins}/${enemyGames}`} />
    </div>
  );
}

function SummaryCard({ label, tone, value }: { label: string; tone: "ally" | "enemy"; value: string }) {
  return (
    <div className="rounded bg-white px-3 py-1.5 shadow-[0_0_0_1px_rgba(148,163,184,0.25)]">
      <p className="text-xs font-bold text-slate-400">{label}</p>
      <p className={["mt-0.5 text-base font-black", tone === "ally" ? "text-emerald-500" : "text-rose-500"].join(" ")}>
        {tone === "ally" ? "♧ " : "♤ "}
        {value}
      </p>
    </div>
  );
}

function ChampionPortrait({ displayName, src }: { displayName: string; src: string | undefined }) {
  if (src) {
    return <img alt="" className="h-14 w-14 rounded border border-slate-300 object-cover shadow-sm" src={src} />;
  }

  return (
    <div className="flex h-14 w-14 items-center justify-center rounded border border-slate-300 bg-slate-200 text-sm font-black text-slate-500 shadow-sm">
      {initials(displayName)}
    </div>
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
    <div className={["flex h-[1.625rem] min-w-0 items-center justify-center rounded bg-blue-50 px-1 text-sm font-black", muted ? "text-blue-300" : "text-blue-500"].join(" ")}>
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

function formatRank(summary: RankedQueueSummary | undefined) {
  if (!summary || !summary.isRanked || !summary.tier) {
    return "未定级";
  }

  const tier = rankTierLabel(summary.tier);
  const division = summary.division ? romanToNumber(summary.division) : "";

  return `${tier}${division}`;
}

function rankTierLabel(tier: string) {
  const labels: Record<string, string> = {
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

  return labels[tier.toUpperCase()] ?? tier;
}

function romanToNumber(value: string) {
  const labels: Record<string, string> = {
    I: "Ⅰ",
    II: "Ⅱ",
    III: "Ⅲ",
    IV: "Ⅳ",
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
