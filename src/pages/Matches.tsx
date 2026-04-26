import { useEffect, useState } from "react";

import { PostMatchAnalysis } from "../components/PostMatchAnalysis";
import { useAppCore, useLeagueAssets, type LeagueGameAssetView } from "../state/AppStateProvider";
import { listenWithCleanup } from "../backend/events";
import {
  isSelectedParticipant,
  openParticipantProfileWindow,
  PARTICIPANT_PROFILE_CHANGED_EVENT,
} from "../windows/participantProfileWindow";
import type {
  MatchResult,
  PostMatchDetail,
  RecentMatchSummary,
} from "../backend/types";
import type { TranslationKey } from "../i18n";

type T = (key: TranslationKey) => string;

type SelectedParticipant = {
  gameId: number;
  participantId: number;
};

export function Matches() {
  const {
    leagueSelfSnapshot,
    postMatchDetails,
    isLeagueClientLoading,
    loadPostMatchDetail,
    refreshLeagueClient,
    t,
  } = useAppCore();
  const { leagueImages, loadLeagueGameAsset, loadLeagueChampionIcon } = useLeagueAssets();
  const [expandedGameId, setExpandedGameId] = useState<number | null>(null);
  const matches = leagueSelfSnapshot?.recentMatches ?? [];

  useEffect(() => {
    for (const match of matches) {
      void loadLeagueChampionIcon(match.championId);
    }
  }, [loadLeagueChampionIcon, matches]);

  useEffect(() => {
    if (expandedGameId) {
      void loadPostMatchDetail(expandedGameId);
    }
  }, [expandedGameId, loadPostMatchDetail]);

  useEffect(() => {
    for (const detail of Object.values(postMatchDetails)) {
      for (const team of detail.teams) {
        for (const participant of team.participants) {
          void loadLeagueChampionIcon(participant.championId);
          for (const itemId of participant.items) {
            void loadLeagueGameAsset("item", itemId);
          }
          for (const runeId of participant.runes) {
            void loadLeagueGameAsset("rune", runeId);
          }
          for (const spellId of participant.spells) {
            void loadLeagueGameAsset("spell", spellId);
          }
        }
      }
    }
  }, [loadLeagueChampionIcon, loadLeagueGameAsset, postMatchDetails]);

  useEffect(() => {
    return listenWithCleanup<unknown>(PARTICIPANT_PROFILE_CHANGED_EVENT, (event) => {
      if (!isSelectedParticipant(event.payload) || !postMatchDetails[event.payload.gameId]) {
        return;
      }

      void loadPostMatchDetail(event.payload.gameId);
    });
  }, [loadPostMatchDetail, postMatchDetails]);

  function selectParticipant(selection: SelectedParticipant) {
    void openParticipantProfileWindow(selection);
  }

  return (
    <main className="min-h-0 flex-1 overflow-auto px-8 py-7">
      <div className="mx-auto w-full max-w-7xl">
        <div className="flex min-w-0 flex-col gap-7">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-wide text-rose-700">{t("matches.eyebrow")}</p>
              <h1 className="mt-2 text-3xl font-semibold text-zinc-950">{t("matches.title")}</h1>
            </div>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 transition hover:border-zinc-400 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isLeagueClientLoading}
              onClick={() => refreshLeagueClient({ matchLimit: 12 })}
              type="button"
            >
              <RefreshIcon />
              {isLeagueClientLoading ? t("common.refreshing") : t("common.refresh")}
            </button>
          </header>

          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-zinc-950">{t("matches.completed")}</h2>
                <p className="mt-1 text-sm text-zinc-500">{matchCountLabel(matches.length, isLeagueClientLoading, t)}</p>
              </div>
              <StatusBadge result={matches[0]?.result ?? "unknown"} t={t} />
            </div>

            <div className="mt-5 grid gap-3">
              {!leagueSelfSnapshot && isLeagueClientLoading && <StatePanel title={t("matches.loading")} body={t("matches.readingClient")} />}
              {leagueSelfSnapshot && matches.length === 0 && (
                <StatePanel title={t("matches.none")} body={emptyMatchesBody(leagueSelfSnapshot.status.phase, t)} />
              )}
              {matches.map((match) => {
                const detail = postMatchDetails[match.gameId];

                return (
                  <MatchCard
                    detail={detail}
                    imageUrl={match.championId ? leagueImages.championIcons[match.championId] : undefined}
                    isExpanded={expandedGameId === match.gameId}
                    key={match.gameId}
                    match={match}
                    onParticipantSelect={(participantId) => selectParticipant({ gameId: match.gameId, participantId })}
                    onToggle={() => setExpandedGameId(expandedGameId === match.gameId ? null : match.gameId)}
                    gameAssets={leagueImages.gameAssets}
                    participantImages={leagueImages.championIcons}
                    t={t}
                  />
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function MatchCard({
  detail,
  imageUrl,
  isExpanded,
  match,
  onParticipantSelect,
  onToggle,
  gameAssets,
  participantImages,
  t,
}: {
  detail: PostMatchDetail | undefined;
  imageUrl: string | undefined;
  isExpanded: boolean;
  match: RecentMatchSummary;
  onParticipantSelect: (participantId: number) => void;
  onToggle: () => void;
  gameAssets: Record<string, LeagueGameAssetView>;
  participantImages: Record<number, string>;
  t: T;
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
              <ResultBadge result={match.result} t={t} />
            </div>
            <p className="mt-1 truncate text-xs text-zinc-500">
              {match.queueName ?? "Unknown queue"} - {formatTimestamp(match.playedAt, t)}
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
        <div className="grid gap-4 border-t border-zinc-200 bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <Detail label={t("matches.result")} value={formatResult(match.result, t)} />
            <Detail label={t("matches.duration")} value={formatDuration(match.gameDurationSeconds, t)} />
            <Detail label={t("matches.played")} value={formatTimestamp(match.playedAt, t)} />
            <Detail label={t("matches.matchId")} value={String(match.gameId)} />
          </div>
          {!detail && <StatePanel title={t("matches.loadingAnalysis")} body={t("matches.readingAnalysis")} />}
          {detail && (
            <PostMatchAnalysis
              detail={detail}
              gameAssets={gameAssets}
              onParticipantSelect={onParticipantSelect}
              participantImages={participantImages}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ChampionImage({
  championName,
  imageUrl,
  size = "md",
}: {
  championName: string;
  imageUrl: string | undefined;
  size?: "sm" | "md";
}) {
  const sizeClass = size === "sm" ? "h-9 w-9" : "h-12 w-12";

  if (imageUrl) {
    return <img alt={`${championName} icon`} className={`${sizeClass} shrink-0 rounded-md border border-zinc-200 object-cover`} src={imageUrl} />;
  }

  return (
    <div className={`${sizeClass} flex shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-100 text-sm font-semibold text-zinc-500`}>
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

function ResultBadge({ result, t }: { result: MatchResult; t: T }) {
  const tone =
    result === "win"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : result === "loss"
        ? "border-rose-200 bg-rose-50 text-rose-800"
        : "border-zinc-200 bg-white text-zinc-600";

  return <span className={["rounded-md border px-2 py-0.5 text-xs font-semibold", tone].join(" ")}>{formatResult(result, t)}</span>;
}

function StatusBadge({ result, t }: { result: MatchResult; t: T }) {
  const label = result === "unknown" ? t("common.pending") : t("matches.loaded");

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

function formatResult(result: MatchResult, t: T) {
  switch (result) {
    case "win":
      return t("common.win");
    case "loss":
      return t("common.loss");
    default:
      return t("common.unknown");
  }
}

function matchCountLabel(count: number, isLoading: boolean, t: T) {
  if (isLoading && count === 0) {
    return t("matches.loading");
  }

  return `${count} ${t("participant.recentMatches")}`;
}

function emptyMatchesBody(phase: string, t: T) {
  if (phase === "notLoggedIn") {
    return t("matches.loginHint");
  }

  if (phase === "notRunning") {
    return t("matches.startHint");
  }

  return t("matches.unavailableHint");
}

function formatTimestamp(value: string | null | undefined, t: T) {
  if (!value) {
    return t("common.pending");
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

function formatDuration(value: number | null, t: T) {
  if (!value || value < 0) {
    return t("common.unavailable");
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
