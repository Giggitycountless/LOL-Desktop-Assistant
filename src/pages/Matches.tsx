import { useEffect, useState } from "react";

import { useAppState } from "../state/AppStateProvider";
import type { MatchResult, RecentMatchSummary } from "../backend/types";

export function Matches() {
  const {
    leagueSelfSnapshot,
    leagueImages,
    isLeagueClientLoading,
    loadLeagueChampionIcon,
    refreshLeagueClient,
  } = useAppState();
  const [expandedGameId, setExpandedGameId] = useState<number | null>(null);
  const matches = leagueSelfSnapshot?.recentMatches ?? [];

  useEffect(() => {
    for (const match of matches) {
      void loadLeagueChampionIcon(match.championId);
    }
  }, [loadLeagueChampionIcon, matches]);

  return (
    <main className="min-h-0 flex-1 overflow-auto px-8 py-7">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-7">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-rose-700">Matches</p>
            <h1 className="mt-2 text-3xl font-semibold text-zinc-950">Recent Matches</h1>
          </div>
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 transition hover:border-zinc-400 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isLeagueClientLoading}
            onClick={() => refreshLeagueClient({ matchLimit: 12 })}
            type="button"
          >
            <RefreshIcon />
            {isLeagueClientLoading ? "Refreshing" : "Refresh"}
          </button>
        </header>

        <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-zinc-950">Match List</h2>
              <p className="mt-1 text-sm text-zinc-500">{matchCountLabel(matches.length, isLeagueClientLoading)}</p>
            </div>
            <StatusBadge result={matches[0]?.result ?? "unknown"} />
          </div>

          <div className="mt-5 grid gap-3">
            {!leagueSelfSnapshot && isLeagueClientLoading && <StatePanel title="Loading matches" body="Reading local League Client data" />}
            {leagueSelfSnapshot && matches.length === 0 && (
              <StatePanel title="No matches available" body={emptyMatchesBody(leagueSelfSnapshot.status.phase)} />
            )}
            {matches.map((match) => (
              <MatchCard
                imageUrl={match.championId ? leagueImages.championIcons[match.championId] : undefined}
                isExpanded={expandedGameId === match.gameId}
                key={match.gameId}
                match={match}
                onToggle={() => setExpandedGameId(expandedGameId === match.gameId ? null : match.gameId)}
              />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function MatchCard({
  imageUrl,
  isExpanded,
  match,
  onToggle,
}: {
  imageUrl: string | undefined;
  isExpanded: boolean;
  match: RecentMatchSummary;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50">
      <button
        className="grid w-full gap-3 p-3 text-left transition hover:bg-white sm:grid-cols-[1fr_auto]"
        onClick={onToggle}
        type="button"
      >
        <div className="flex min-w-0 items-center gap-3">
          <ChampionImage championName={match.championName} imageUrl={imageUrl} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold text-zinc-950">{match.championName}</p>
              <ResultBadge result={match.result} />
            </div>
            <p className="mt-1 truncate text-xs text-zinc-500">
              {match.queueName ?? "Unknown queue"} - {formatTimestamp(match.playedAt)}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-5 sm:justify-end">
          <div className="text-left sm:text-right">
            <p className="text-sm font-semibold text-zinc-950">
              {match.kills}/{match.deaths}/{match.assists}
            </p>
            <p className="mt-1 text-xs text-zinc-500">KDA {match.kda === null ? "n/a" : match.kda.toFixed(1)}</p>
          </div>
          <ChevronIcon expanded={isExpanded} />
        </div>
      </button>

      {isExpanded && (
        <div className="grid gap-3 border-t border-zinc-200 bg-white p-4 sm:grid-cols-4">
          <Detail label="Result" value={formatResult(match.result)} />
          <Detail label="Duration" value={formatDuration(match.gameDurationSeconds)} />
          <Detail label="Played" value={formatTimestamp(match.playedAt)} />
          <Detail label="Match ID" value={String(match.gameId)} />
        </div>
      )}
    </div>
  );
}

function ChampionImage({ championName, imageUrl }: { championName: string; imageUrl: string | undefined }) {
  if (imageUrl) {
    return <img alt={`${championName} icon`} className="h-12 w-12 shrink-0 rounded-md border border-zinc-200 object-cover" src={imageUrl} />;
  }

  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-100 text-sm font-semibold text-zinc-500">
      {initials(championName)}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-zinc-950">{value}</p>
    </div>
  );
}

function StatePanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
      <p className="text-sm font-semibold text-zinc-950">{title}</p>
      <p className="mt-1 text-sm text-zinc-500">{body}</p>
    </div>
  );
}

function ResultBadge({ result }: { result: MatchResult }) {
  const tone =
    result === "win"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : result === "loss"
        ? "border-rose-200 bg-rose-50 text-rose-800"
        : "border-zinc-200 bg-white text-zinc-600";

  return <span className={["rounded-md border px-2 py-0.5 text-xs font-semibold", tone].join(" ")}>{formatResult(result)}</span>;
}

function StatusBadge({ result }: { result: MatchResult }) {
  const label = result === "unknown" ? "Pending" : "Loaded";

  return (
    <span className="inline-flex h-10 items-center rounded-md border border-zinc-200 bg-zinc-50 px-3 text-sm font-medium text-zinc-700">
      {label}
    </span>
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

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg aria-hidden="true" className="h-5 w-5 text-zinc-500" fill="none" viewBox="0 0 24 24">
      <path
        d={expanded ? "m6 15 6-6 6 6" : "m6 9 6 6 6-6"}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function formatResult(result: MatchResult) {
  switch (result) {
    case "win":
      return "Win";
    case "loss":
      return "Loss";
    default:
      return "Unknown";
  }
}

function matchCountLabel(count: number, isLoading: boolean) {
  if (isLoading && count === 0) {
    return "Loading local match data";
  }

  return `${count} recent ${count === 1 ? "match" : "matches"}`;
}

function emptyMatchesBody(phase: string) {
  if (phase === "notLoggedIn") {
    return "Login to the League Client to read recent matches";
  }

  if (phase === "notRunning") {
    return "Start the League Client to read recent matches";
  }

  return "Recent match data is unavailable";
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

function formatDuration(value: number | null) {
  if (!value || value < 0) {
    return "Unavailable";
  }

  const minutes = Math.floor(value / 60);
  const seconds = value % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
