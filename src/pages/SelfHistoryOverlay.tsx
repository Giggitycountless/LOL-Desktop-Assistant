import { useEffect } from "react";

import { useAppState } from "../state/AppStateProvider";
import type { RecentMatchSummary } from "../backend/types";

export function SelfHistoryOverlay() {
  const {
    isLeagueClientLoading,
    leagueImages,
    leagueSelfSnapshot,
    loadLeagueChampionIcon,
    loadLeagueProfileIcon,
    refreshLeagueClient,
  } = useAppState();
  const summoner = leagueSelfSnapshot?.summoner ?? null;
  const profileIconId = summoner?.profileIconId ?? null;
  const profileIconUrl = profileIconId ? leagueImages.profileIcons[profileIconId] : undefined;
  const recentMatches = leagueSelfSnapshot?.recentMatches ?? [];
  const topChampions = leagueSelfSnapshot?.recentPerformance.topChampions ?? [];
  const soloDuo = leagueSelfSnapshot?.rankedQueues.find((queue) => queue.queue === "soloDuo");

  useEffect(() => {
    void loadLeagueProfileIcon(profileIconId);
  }, [loadLeagueProfileIcon, profileIconId]);

  useEffect(() => {
    for (const match of recentMatches) {
      void loadLeagueChampionIcon(match.championId);
    }
    for (const champion of topChampions) {
      void loadLeagueChampionIcon(champion.championId);
    }
  }, [loadLeagueChampionIcon, recentMatches, topChampions]);

  return (
    <main className="min-h-screen overflow-auto bg-zinc-950 p-3 text-zinc-100">
      <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar fallback={summoner ? initials(summoner.displayName) : "LoL"} src={profileIconUrl} />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold">{summoner?.displayName ?? "Self History"}</p>
              <p className="mt-0.5 text-xs font-medium text-zinc-400">
                {summoner ? `Level ${summoner.summonerLevel}` : statusLabel(leagueSelfSnapshot?.status.phase)}
              </p>
            </div>
          </div>
          <button
            className="inline-flex h-9 items-center rounded-md border border-zinc-700 bg-zinc-800 px-3 text-xs font-semibold text-zinc-100 transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isLeagueClientLoading}
            onClick={() => refreshLeagueClient({ matchLimit: 6 })}
            type="button"
          >
            {isLeagueClientLoading ? "Loading" : "Refresh"}
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Metric label="KDA" value={formatKda(leagueSelfSnapshot?.recentPerformance.averageKda ?? null)} />
          <Metric label="Rank" value={formatRank(soloDuo)} />
          <Metric label="Games" value={String(leagueSelfSnapshot?.recentPerformance.matchCount ?? 0)} />
        </div>
      </section>

      <section className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4 shadow-sm">
        <h2 className="text-sm font-semibold">Recent Champions</h2>
        <div className="mt-3 grid gap-2">
          {topChampions.length === 0 && <p className="text-sm text-zinc-400">No recent champion data</p>}
          {topChampions.map((champion) => (
            <div className="flex min-w-0 items-center gap-2" key={`${champion.championId ?? champion.championName}-${champion.championName}`}>
              <ChampionIcon championName={champion.championName} src={champion.championId ? leagueImages.championIcons[champion.championId] : undefined} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{champion.championName}</p>
                <p className="text-xs text-zinc-400">{champion.games} recent {champion.games === 1 ? "game" : "games"}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4 shadow-sm">
        <h2 className="text-sm font-semibold">Recent Matches</h2>
        <div className="mt-3 grid gap-2">
          {recentMatches.length === 0 && <p className="text-sm text-zinc-400">No recent matches available</p>}
          {recentMatches.slice(0, 6).map((match) => (
            <MatchRow imageUrl={match.championId ? leagueImages.championIcons[match.championId] : undefined} key={match.gameId} match={match} />
          ))}
        </div>
      </section>
    </main>
  );
}

function MatchRow({ imageUrl, match }: { imageUrl: string | undefined; match: RecentMatchSummary }) {
  return (
    <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950/60 p-2">
      <ChampionIcon championName={match.championName} src={imageUrl} />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{match.championName}</p>
        <p className="mt-0.5 truncate text-xs text-zinc-400">{match.queueName ?? "Queue unavailable"}</p>
      </div>
      <div className="text-right">
        <p className={["text-xs font-bold", match.result === "win" ? "text-emerald-400" : "text-rose-400"].join(" ")}>
          {match.result === "win" ? "Win" : match.result === "loss" ? "Loss" : "Unknown"}
        </p>
        <p className="mt-0.5 text-xs font-semibold text-zinc-300">
          {match.kills}/{match.deaths}/{match.assists}
        </p>
      </div>
    </div>
  );
}

function Avatar({ fallback, src }: { fallback: string; src: string | undefined }) {
  if (src) {
    return <img alt="" className="h-12 w-12 shrink-0 rounded-md border border-zinc-700 object-cover" src={src} />;
  }

  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-zinc-700 bg-zinc-800 text-sm font-bold text-zinc-300">
      {fallback}
    </div>
  );
}

function ChampionIcon({ championName, src }: { championName: string; src: string | undefined }) {
  if (src) {
    return <img alt="" className="h-9 w-9 shrink-0 rounded border border-zinc-700 object-cover" src={src} />;
  }

  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-zinc-700 bg-zinc-800 text-xs font-bold text-zinc-400">
      {initials(championName)}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 truncate text-sm font-bold text-zinc-100">{value}</p>
    </div>
  );
}

function formatKda(value: number | null) {
  return value === null ? "--" : value.toFixed(1);
}

function formatRank(summary: { tier: string | null; division: string | null; leaguePoints: number | null; isRanked: boolean } | undefined) {
  if (!summary || !summary.isRanked || !summary.tier) {
    return "Unranked";
  }

  return `${summary.tier}${summary.division ? ` ${summary.division}` : ""}`;
}

function statusLabel(phase: string | undefined) {
  switch (phase) {
    case "connected":
      return "Connected";
    case "partialData":
      return "Partial data";
    case "notLoggedIn":
      return "Not logged in";
    case "notRunning":
      return "Not running";
    default:
      return "Unavailable";
  }
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
