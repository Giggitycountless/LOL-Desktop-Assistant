import { useEffect } from "react";

import { useAppState } from "../state/AppStateProvider";
import type { KdaTag, RankedQueue, RankedQueueSummary, RecentChampionSummary } from "../backend/types";
import { openSelfHistoryOverlayWindow } from "../windows/selfHistoryOverlayWindow";

export function Profile() {
  const {
    leagueSelfSnapshot,
    leagueImages,
    isLeagueClientLoading,
    loadLeagueChampionIcon,
    loadLeagueProfileIcon,
    refreshLeagueClient,
  } = useAppState();
  const league = leagueSelfSnapshot;
  const summoner = league?.summoner ?? null;
  const profileIconId = summoner?.profileIconId ?? null;
  const profileIconUrl = profileIconId ? leagueImages.profileIcons[profileIconId] : undefined;
  const soloDuo = league?.rankedQueues.find((queue) => queue.queue === "soloDuo");
  const flex = league?.rankedQueues.find((queue) => queue.queue === "flex");
  const topChampions = league?.recentPerformance.topChampions ?? [];

  useEffect(() => {
    void loadLeagueProfileIcon(profileIconId);
  }, [loadLeagueProfileIcon, profileIconId]);

  useEffect(() => {
    for (const champion of topChampions) {
      void loadLeagueChampionIcon(champion.championId);
    }
  }, [loadLeagueChampionIcon, topChampions]);

  return (
    <main className="min-h-0 flex-1 overflow-auto px-8 py-7">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-7">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-rose-700">Profile</p>
            <h1 className="mt-2 text-3xl font-semibold text-zinc-950">Current Summoner</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 transition hover:border-zinc-400 hover:bg-zinc-50"
              onClick={() => void openSelfHistoryOverlayWindow()}
              type="button"
            >
              <WindowIcon />
              Open Floating Window
            </button>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 transition hover:border-zinc-400 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isLeagueClientLoading}
              onClick={() => refreshLeagueClient({ matchLimit: 6 })}
              type="button"
            >
              <RefreshIcon />
              {isLeagueClientLoading ? "Refreshing" : "Refresh"}
            </button>
          </div>
        </header>

        {!league && isLeagueClientLoading && <StatePanel title="Loading profile" body="Reading local League Client data" />}
        {league && !summoner && (
          <StatePanel title={profileStateTitle(league.status.phase)} body={league.status.message ?? "Profile data is unavailable"} />
        )}

        {league && summoner && (
          <>
            <section className="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
              <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-4">
                  <LeagueImage
                    alt={`${summoner.displayName} profile icon`}
                    fallback={profileIconId ? String(profileIconId) : initials(summoner.displayName)}
                    size="large"
                    src={profileIconUrl}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-2xl font-semibold text-zinc-950">{summoner.displayName}</p>
                    <p className="mt-1 text-sm font-medium text-zinc-500">Level {summoner.summonerLevel}</p>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <Metric label="Client" value={formatLeaguePhase(league.status.phase)} />
                  <Metric label="Updated" value={formatTimestamp(league.refreshedAt)} />
                </div>
              </div>

              <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-zinc-950">Recent 6 Performance</h2>
                    <p className="mt-1 text-sm text-zinc-500">{performanceLabel(league.recentPerformance.matchCount)}</p>
                  </div>
                  <KdaBadge tag={league.recentPerformance.kdaTag} value={league.recentPerformance.averageKda} />
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  {topChampions.length > 0 ? (
                    topChampions.map((champion) => (
                      <ChampionCard
                        champion={champion}
                        imageUrl={champion.championId ? leagueImages.championIcons[champion.championId] : undefined}
                        key={`${champion.championId ?? champion.championName}-${champion.championName}`}
                      />
                    ))
                  ) : (
                    <p className="text-sm text-zinc-500 sm:col-span-3">No recent champion data available</p>
                  )}
                </div>
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              <RankedCard label="Solo/Duo" queue="soloDuo" summary={soloDuo} />
              <RankedCard label="Flex" queue="flex" summary={flex} />
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function ChampionCard({ champion, imageUrl }: { champion: RecentChampionSummary; imageUrl: string | undefined }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
      <LeagueImage alt={`${champion.championName} icon`} fallback={initials(champion.championName)} size="small" src={imageUrl} />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-zinc-950">{champion.championName}</p>
        <p className="mt-1 text-xs font-medium text-zinc-500">{champion.games} recent {champion.games === 1 ? "game" : "games"}</p>
      </div>
    </div>
  );
}

function RankedCard({ label, queue, summary }: { label: string; queue: RankedQueue; summary: RankedQueueSummary | undefined }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-zinc-950">{formatRank(summary)}</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Metric label="Wins" value={summary ? String(summary.wins) : "0"} />
        <Metric label="Losses" value={summary ? String(summary.losses) : "0"} />
        <Metric label="Win rate" value={summary ? formatWinRate(summary) : "0%"} />
      </div>
      <p className="mt-4 text-sm text-zinc-500">{queue === "soloDuo" ? "Ranked Solo/Duo" : "Ranked Flex"}</p>
    </div>
  );
}

function LeagueImage({ alt, fallback, size, src }: { alt: string; fallback: string; size: "large" | "small"; src: string | undefined }) {
  const className =
    size === "large"
      ? "h-24 w-24 rounded-lg text-lg"
      : "h-12 w-12 rounded-md text-sm";

  if (src) {
    return <img alt={alt} className={`${className} shrink-0 border border-zinc-200 object-cover`} src={src} />;
  }

  return (
    <div className={`${className} flex shrink-0 items-center justify-center border border-zinc-200 bg-zinc-100 font-semibold text-zinc-500`}>
      {fallback}
    </div>
  );
}

function KdaBadge({ tag, value }: { tag: KdaTag; value: number | null }) {
  const tone =
    tag === "high"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tag === "standard"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-zinc-200 bg-white text-zinc-600";
  const label = value === null ? "KDA unavailable" : `Avg KDA ${value.toFixed(1)}`;

  return <span className={["rounded-md border px-2.5 py-1 text-xs font-semibold", tone].join(" ")}>{label}</span>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-zinc-950">{value}</p>
    </div>
  );
}

function StatePanel({ title, body }: { title: string; body: string }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-950">{title}</h2>
      <p className="mt-2 text-sm text-zinc-500">{body}</p>
    </section>
  );
}

function RefreshIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path
        d="M20 12a8 8 0 0 1-13.6 5.7M4 12A8 8 0 0 1 17.6 6.3M18 3v4h-4M6 21v-4h4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function WindowIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path
        d="M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm2 4h10M7 13h5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function formatRank(summary: RankedQueueSummary | undefined) {
  if (!summary || !summary.isRanked || !summary.tier) {
    return "Unranked";
  }

  const division = summary.division ? ` ${summary.division}` : "";
  const lp = summary.leaguePoints === null ? "" : ` - ${summary.leaguePoints} LP`;

  return `${summary.tier}${division}${lp}`;
}

function formatWinRate(summary: RankedQueueSummary) {
  const total = summary.wins + summary.losses;

  if (total === 0) {
    return "0%";
  }

  return `${Math.round((summary.wins / total) * 100)}%`;
}

function profileStateTitle(phase: string) {
  if (phase === "notLoggedIn") {
    return "Login required";
  }

  if (phase === "notRunning") {
    return "League Client not running";
  }

  return "Profile unavailable";
}

function performanceLabel(matchCount: number) {
  if (matchCount === 0) {
    return "No recent matches included";
  }

  return `${matchCount} recent ${matchCount === 1 ? "match" : "matches"} included`;
}

function formatLeaguePhase(phase: string) {
  switch (phase) {
    case "connected":
      return "Connected";
    case "partialData":
      return "Partial data";
    case "notLoggedIn":
      return "Not logged in";
    case "patching":
      return "Preparing";
    case "notRunning":
      return "Not running";
    default:
      return "Unavailable";
  }
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) {
    return "Pending";
  }

  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric > 10_000_000_000 ? numeric : numeric * 1_000)
    : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
