import { useEffect, useMemo, useState } from "react";

import { useAppState } from "../state/AppStateProvider";
import type { RankedChampionDataStatus, RankedChampionLane, RankedChampionSort, RankedChampionStat } from "../backend/types";

const lanes: Array<{ id: RankedChampionLane; label: string; shortLabel: string }> = [
  { id: "top", label: "Top", shortLabel: "TOP" },
  { id: "jungle", label: "Jungle", shortLabel: "JUG" },
  { id: "middle", label: "Mid", shortLabel: "MID" },
  { id: "bottom", label: "Bot", shortLabel: "BOT" },
  { id: "support", label: "Support", shortLabel: "SUP" },
];

const sorts: Array<{ id: RankedChampionSort; label: string; metric: keyof RankedChampionStat }> = [
  { id: "overall", label: "Overall", metric: "overallScore" },
  { id: "winRate", label: "Win rate", metric: "winRate" },
  { id: "banRate", label: "Ban rate", metric: "banRate" },
  { id: "pickRate", label: "Pick rate", metric: "pickRate" },
];

export function RankedChampions() {
  const {
    isRankedChampionStatsLoading,
    leagueImages,
    loadLeagueChampionIcon,
    loadRankedChampionStats,
    rankedChampionStats,
    refreshRankedChampionStats,
  } = useAppState();
  const [lane, setLane] = useState<RankedChampionLane>("top");
  const [sortBy, setSortBy] = useState<RankedChampionSort>("overall");
  const activeSort = useMemo(() => sorts.find((sort) => sort.id === sortBy) ?? sorts[0], [sortBy]);
  const records = rankedChampionStats?.records ?? [];
  const status = rankedChampionStats?.dataStatus ?? "sample";
  const statusView = dataStatusView(status);
  const metadata = rankedChampionStats
    ? [rankedChampionStats.patch, rankedChampionStats.region, rankedChampionStats.queue, rankedChampionStats.tier].filter(Boolean).join(" / ")
    : "";

  useEffect(() => {
    void loadRankedChampionStats({ lane, sortBy });
  }, [lane, loadRankedChampionStats, sortBy]);

  useEffect(() => {
    for (const record of records) {
      void loadLeagueChampionIcon(record.championId);
    }
  }, [loadLeagueChampionIcon, records]);

  return (
    <main className="min-h-0 flex-1 overflow-auto px-8 py-7">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-7">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-rose-700">Ranked Champions</p>
            <h1 className="mt-2 text-3xl font-semibold text-zinc-950">Ranked Champion Data</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isRankedChampionStatsLoading}
              onClick={() => void refreshRankedChampionStats({ lane, sortBy })}
              type="button"
            >
              <RefreshIcon />
              <span>{isRankedChampionStatsLoading ? "Refreshing" : "Refresh"}</span>
            </button>
            <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-600">
              {isRankedChampionStatsLoading ? "Loading" : `${records.length} champions`}
            </div>
          </div>
        </header>

        <section className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            {lanes.map((laneOption) => (
              <button
                className={[
                  "inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition",
                  lane === laneOption.id
                    ? "border-rose-700 bg-rose-700 text-white shadow-sm"
                    : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50",
                ].join(" ")}
                key={laneOption.id}
                onClick={() => setLane(laneOption.id)}
                type="button"
              >
                <LaneIcon lane={laneOption.id} />
                <span>{laneOption.label}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {sorts.map((sort) => (
              <button
                className={[
                  "h-10 rounded-md border px-3 text-sm font-semibold transition",
                  sortBy === sort.id
                    ? "border-zinc-950 bg-zinc-950 text-white shadow-sm"
                    : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50",
                ].join(" ")}
                key={sort.id}
                onClick={() => setSortBy(sort.id)}
                type="button"
              >
                {sort.label}
              </button>
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-zinc-950">{laneLabel(lane)} champions</h2>
                <span className={["rounded px-2 py-0.5 text-xs font-bold", statusView.className].join(" ")}>
                  {statusView.label}
                </span>
              </div>
              <p className="mt-1 text-sm text-zinc-500">
                Sorted by {activeSort.label.toLowerCase()} · {rankedChampionStats?.source ?? "Local ranked data sample"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-zinc-700">{metadata || "Sample data"}</p>
              <p className="mt-1 text-xs font-medium text-zinc-500">{timeSummary(rankedChampionStats)}</p>
            </div>
          </div>

          {rankedChampionStats?.statusMessage && (
            <div className="border-b border-zinc-200 bg-zinc-50 px-5 py-3 text-sm font-medium text-zinc-600">
              {rankedChampionStats.statusMessage}
            </div>
          )}

          <div className="overflow-x-auto">
            <div className="grid min-w-[64rem] grid-cols-[4rem_minmax(14rem,1.3fr)_7rem_8rem_8rem_8rem_11rem] gap-3 border-b border-zinc-200 bg-zinc-100 px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              <span>Rank</span>
              <span>Champion</span>
              <span>Overall</span>
              <span>Win</span>
              <span>Pick</span>
              <span>Ban</span>
              <span>Sample</span>
            </div>

            {records.length === 0 && (
              <div className="px-5 py-8 text-sm text-zinc-500">
                No ranked champion data is available for this lane.
              </div>
            )}

            {records.map((record, index) => (
              <ChampionRow
                highlightMetric={activeSort.metric}
                imageUrl={leagueImages.championIcons[record.championId]}
                key={`${record.lane}-${record.championId}`}
                rank={index + 1}
                record={record}
              />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function ChampionRow({
  highlightMetric,
  imageUrl,
  rank,
  record,
}: {
  highlightMetric: keyof RankedChampionStat;
  imageUrl: string | undefined;
  rank: number;
  record: RankedChampionStat;
}) {
  return (
    <div className="grid min-w-[64rem] grid-cols-[4rem_minmax(14rem,1.3fr)_7rem_8rem_8rem_8rem_11rem] items-center gap-3 border-b border-zinc-100 px-5 py-3 last:border-b-0">
      <span className="text-sm font-bold text-zinc-500">#{rank}</span>
      <div className="flex min-w-0 items-center gap-3">
        <ChampionImage championName={record.championName} imageUrl={imageUrl} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-zinc-950">{record.championName}</p>
          <p className="mt-1 text-xs text-zinc-500">{laneLabel(record.lane)}</p>
        </div>
      </div>
      <Metric value={record.overallScore} suffix="" isActive={highlightMetric === "overallScore"} />
      <Metric value={record.winRate} suffix="%" isActive={highlightMetric === "winRate"} />
      <Metric value={record.pickRate} suffix="%" isActive={highlightMetric === "pickRate"} />
      <Metric value={record.banRate} suffix="%" isActive={highlightMetric === "banRate"} />
      <div className="text-sm font-semibold text-zinc-700">
        <p>{formatGames(record.games)} games</p>
        <p className="mt-1 text-xs font-medium text-zinc-500">
          {formatGames(record.wins)}W · {formatGames(record.picks)}P · {formatGames(record.bans)}B
        </p>
      </div>
    </div>
  );
}

function Metric({ isActive, suffix, value }: { isActive: boolean; suffix: string; value: number }) {
  const width = `${Math.max(0, Math.min(100, value))}%`;

  return (
    <div className="min-w-0">
      <div
        className={[
          "mb-1 h-1.5 overflow-hidden rounded-full",
          isActive ? "bg-rose-100" : "bg-zinc-100",
        ].join(" ")}
      >
        <div className={["h-full rounded-full", isActive ? "bg-rose-700" : "bg-zinc-400"].join(" ")} style={{ width }} />
      </div>
      <span className={["text-sm font-bold", isActive ? "text-rose-800" : "text-zinc-700"].join(" ")}>
        {value.toFixed(1)}
        {suffix}
      </span>
    </div>
  );
}

function ChampionImage({ championName, imageUrl }: { championName: string; imageUrl: string | undefined }) {
  if (imageUrl) {
    return <img alt={`${championName} icon`} className="h-11 w-11 shrink-0 rounded-md border border-zinc-200 object-cover" src={imageUrl} />;
  }

  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-100 text-sm font-semibold text-zinc-500">
      {initials(championName)}
    </div>
  );
}

function RefreshIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none">
      <path d="M20 12a8 8 0 0 1-13.4 5.9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 12A8 8 0 0 1 17.4 6.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M7 18H4v-3M17 6h3v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LaneIcon({ lane }: { lane: RankedChampionLane }) {
  const paths: Record<RankedChampionLane, string> = {
    top: "M5 5h14v4H9v10H5V5Z",
    jungle: "M12 3 7 10h3l-3 7 6-8h-3l2-6Zm5 4 3 5h-3l2 5-5-7h3l-1-3Z",
    middle: "M5 17 17 5h2v2L7 19H5v-2Z",
    bottom: "M19 19H5v-4h10V5h4v14Z",
    support: "M12 4 5 8v5c0 4 3 6 7 7 4-1 7-3 7-7V8l-7-4Zm0 4 3 2v3c0 2-1 3-3 4-2-1-3-2-3-4v-3l3-2Z",
  };

  return (
    <svg aria-hidden="true" className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d={paths[lane]} />
    </svg>
  );
}

function laneLabel(lane: RankedChampionLane) {
  switch (lane) {
    case "top":
      return "Top";
    case "jungle":
      return "Jungle";
    case "middle":
      return "Mid";
    case "bottom":
      return "Bot";
    case "support":
      return "Support";
  }
}

function formatGames(value: number) {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  }

  return String(value);
}

function dataStatusView(status: RankedChampionDataStatus) {
  switch (status) {
    case "fresh":
      return { label: "Fresh", className: "bg-emerald-100 text-emerald-800" };
    case "cached":
      return { label: "Cached", className: "bg-sky-100 text-sky-800" };
    case "staleCache":
      return { label: "Stale cache", className: "bg-amber-100 text-amber-800" };
    case "sample":
      return { label: "Sample", className: "bg-zinc-100 text-zinc-700" };
  }
}

function timeSummary(
  stats:
    | {
        generatedAt: string | null;
        importedAt: string | null;
        updatedAt: string;
      }
    | null,
) {
  if (!stats) {
    return "pending";
  }

  const parts = [];
  if (stats.generatedAt) {
    parts.push(`generated ${stats.generatedAt}`);
  }
  if (stats.importedAt) {
    parts.push(`cached ${stats.importedAt}`);
  }

  return parts.length > 0 ? parts.join(" / ") : `updated ${stats.updatedAt}`;
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
