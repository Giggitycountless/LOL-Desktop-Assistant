import { useAppState } from "../state/AppStateProvider";
import type {
  KdaTag,
  LeagueClientStatus,
  LeagueSelfSnapshot,
  RankedQueue,
  RankedQueueSummary,
  RecentMatchSummary,
} from "../backend/types";

export function Dashboard() {
  const { snapshot, isLoading, leagueSelfSnapshot, isLeagueClientLoading, refreshLeagueClient } = useAppState();
  const health = snapshot?.health;
  const recentActivity = snapshot?.recentActivity ?? [];

  return (
    <main className="min-h-0 flex-1 overflow-auto px-8 py-7">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-7">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-rose-700">Dashboard</p>
            <h1 className="mt-2 text-3xl font-semibold text-zinc-950">LoL Desktop Assistant</h1>
          </div>
          <HealthBadge status={health?.status ?? (isLoading ? "loading" : "degraded")} />
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <StatusTile label="Application" value={health?.status ?? "loading"} tone={health?.status === "ok" ? "good" : "warn"} />
          <StatusTile
            label="Database"
            value={health?.databaseStatus ?? "pending"}
            tone={health?.databaseStatus === "ok" ? "good" : "warn"}
          />
          <StatusTile
            label="Schema"
            value={health ? String(health.schemaVersion ?? "none") : "pending"}
            tone={health?.schemaVersion ? "good" : "warn"}
          />
        </section>

        <LeagueClientPanel
          league={leagueSelfSnapshot}
          isLoading={isLeagueClientLoading}
          onRefresh={() => refreshLeagueClient({ matchLimit: 6 })}
        />

        <section className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-zinc-950">Current State</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Metric label="Startup" value={snapshot?.settings.startupPage ?? "Loading"} />
              <Metric label="Density" value={snapshot?.settings.compactMode ? "Compact" : "Standard"} />
              <Metric label="Activity limit" value={snapshot ? String(snapshot.settings.activityLimit) : "Loading"} />
              <Metric label="Activity entries" value={String(recentActivity.length)} />
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-zinc-950">Recent Activity</h2>
            <div className="mt-5 min-h-24 rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
              {isLoading && "Loading activity"}
              {!isLoading && recentActivity.length === 0 && "No activity recorded"}
              {!isLoading && recentActivity.length > 0 && (
                <div className="grid gap-3">
                  {recentActivity.slice(0, 3).map((entry) => (
                    <div key={entry.id} className="min-w-0">
                      <p className="truncate font-semibold text-zinc-950">{entry.title}</p>
                      <p className="mt-1 text-xs capitalize text-zinc-500">{entry.kind}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function LeagueClientPanel({
  league,
  isLoading,
  onRefresh,
}: {
  league: LeagueSelfSnapshot | null;
  isLoading: boolean;
  onRefresh: () => void;
}) {
  const status = league?.status;
  const isConnected = status?.connection === "connected";
  const soloDuo = league?.rankedQueues.find((queue) => queue.queue === "soloDuo");
  const flex = league?.rankedQueues.find((queue) => queue.queue === "flex");
  const performance = league?.recentPerformance;

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-950">League Client</h2>
          <p className="mt-1 text-sm text-zinc-500">{status?.message ?? (isConnected ? "Local read-only connection ready" : "Checking local client")}</p>
        </div>
        <div className="flex items-center gap-2">
          <LeagueStatusBadge status={status} isLoading={isLoading} />
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 transition hover:border-zinc-400 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isLoading}
            onClick={onRefresh}
            type="button"
          >
            <RefreshIcon />
            Refresh
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Summoner" value={league?.summoner?.displayName ?? (isConnected ? "Unavailable" : "Not connected")} />
            <Metric label="Level" value={league?.summoner ? String(league.summoner.summonerLevel) : "Pending"} />
            <Metric label="Updated" value={formatTimestamp(league?.refreshedAt)} />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <RankedQueueTile queue="soloDuo" summary={soloDuo} />
            <RankedQueueTile queue="flex" summary={flex} />
          </div>

          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-zinc-950">Recent 6 Performance</p>
                <p className="mt-1 text-xs text-zinc-500">{performance?.matchCount ?? 0} matches included</p>
              </div>
              <KdaBadge tag={performance?.kdaTag ?? "unavailable"} value={performance?.averageKda ?? null} />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {(performance?.recentChampions.length ?? 0) > 0 ? (
                performance?.recentChampions.map((champion, index) => (
                  <span key={`${champion}-${index}`} className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700">
                    {champion}
                  </span>
                ))
              ) : (
                <p className="text-sm text-zinc-500">No recent champions available</p>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-zinc-950">Recent Matches</h3>
            <p className="text-xs text-zinc-500">{league?.recentMatches.length ?? 0} shown</p>
          </div>

          <div className="mt-4 grid gap-3">
            {isLoading && !league && <p className="text-sm text-zinc-500">Loading League Client data</p>}
            {!isLoading && (league?.recentMatches.length ?? 0) === 0 && <p className="text-sm text-zinc-500">No recent matches available</p>}
            {league?.recentMatches.map((match) => (
              <MatchRow key={match.gameId} match={match} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function LeagueStatusBadge({ status, isLoading }: { status: LeagueClientStatus | undefined; isLoading: boolean }) {
  const isReady = status?.connection === "connected";
  const label = isLoading ? "Checking" : isReady ? "Connected" : formatLeaguePhase(status?.phase);

  return (
    <div
      className={[
        "inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium",
        isReady ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800",
      ].join(" ")}
    >
      <span className={["h-2.5 w-2.5 rounded-full", isReady ? "bg-emerald-600" : "bg-amber-500"].join(" ")} />
      {label}
    </div>
  );
}

function RankedQueueTile({ queue, summary }: { queue: RankedQueue; summary: RankedQueueSummary | undefined }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{queue === "soloDuo" ? "Solo/Duo" : "Flex"}</p>
      <p className="mt-2 text-lg font-semibold text-zinc-950">{formatRank(summary)}</p>
      <p className="mt-1 text-sm text-zinc-500">
        {summary ? `${summary.wins}W ${summary.losses}L · ${formatWinRate(summary)}` : "No queue data"}
      </p>
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

function MatchRow({ match }: { match: RecentMatchSummary }) {
  const resultTone =
    match.result === "win"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : match.result === "loss"
        ? "border-rose-200 bg-rose-50 text-rose-800"
        : "border-zinc-200 bg-white text-zinc-600";

  return (
    <div className="grid gap-3 rounded-md border border-zinc-200 bg-white p-3 sm:grid-cols-[1fr_auto]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-zinc-950">{match.championName}</p>
          <span className={["rounded-md border px-2 py-0.5 text-xs font-semibold capitalize", resultTone].join(" ")}>{match.result}</span>
        </div>
        <p className="mt-1 truncate text-xs text-zinc-500">
          {match.queueName ?? "Unknown queue"} · {formatTimestamp(match.playedAt)}
        </p>
      </div>
      <div className="text-left sm:text-right">
        <p className="text-sm font-semibold text-zinc-950">
          {match.kills}/{match.deaths}/{match.assists}
        </p>
        <p className="mt-1 text-xs text-zinc-500">KDA {match.kda === null ? "n/a" : match.kda.toFixed(1)}</p>
      </div>
    </div>
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

function HealthBadge({ status }: { status: "ok" | "degraded" | "loading" }) {
  const isReady = status === "ok";

  return (
    <div
      className={[
        "inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium",
        isReady ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800",
      ].join(" ")}
    >
      <span className={["h-2.5 w-2.5 rounded-full", isReady ? "bg-emerald-600" : "bg-amber-500"].join(" ")} />
      {isReady ? "Ready" : "Pending"}
    </div>
  );
}

function StatusTile({ label, value, tone }: { label: string; value: string; tone: "good" | "warn" }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-zinc-500">{label}</p>
      <p className={["mt-3 text-2xl font-semibold capitalize", tone === "good" ? "text-emerald-700" : "text-amber-700"].join(" ")}>
        {value}
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-semibold capitalize text-zinc-950">{value}</p>
    </div>
  );
}

function formatLeaguePhase(phase: LeagueClientStatus["phase"] | undefined) {
  switch (phase) {
    case "notRunning":
      return "Not running";
    case "lockfileMissing":
      return "No lockfile";
    case "unauthorized":
      return "Unauthorized";
    case "unavailable":
      return "Unavailable";
    case "connecting":
      return "Connecting";
    case "connected":
      return "Connected";
    default:
      return "Pending";
  }
}

function formatRank(summary: RankedQueueSummary | undefined) {
  if (!summary || !summary.isRanked || !summary.tier) {
    return "Unranked";
  }

  const division = summary.division ? ` ${summary.division}` : "";
  const lp = summary.leaguePoints === null ? "" : ` · ${summary.leaguePoints} LP`;

  return `${summary.tier}${division}${lp}`;
}

function formatWinRate(summary: RankedQueueSummary) {
  const total = summary.wins + summary.losses;

  if (total === 0) {
    return "0%";
  }

  return `${Math.round((summary.wins / total) * 100)}%`;
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
