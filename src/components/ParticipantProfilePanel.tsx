import { useEffect, useState } from "react";

import { PostMatchAnalysis } from "./PostMatchAnalysis";
import { ChampionImage, StatePanel, ResultBadge } from "./common";
import { useAppCore, useLeagueAssets, type LeagueGameAssetView } from "../state/AppStateProvider";
import type { PostMatchDetail, RecentMatchSummary } from "../backend/types";
import { emitParticipantProfileChanged, openParticipantProfileWindow } from "../windows/participantProfileWindow";
import { formatResult, formatTimestamp, initials, type T } from "../utils/formatting";

export type SelectedParticipant = {
  gameId: number;
  participantId: number;
};

export function ParticipantProfilePanel({
  className = "",
  selection,
  sticky = false,
}: {
  className?: string;
  selection: SelectedParticipant | null;
  sticky?: boolean;
}) {
  const {
    loadParticipantProfile,
    participantProfiles,
    savePlayerNote,
    clearPlayerNote,
    t,
  } = useAppCore();
  const { leagueImages, loadLeagueChampionIcon, loadLeagueProfileIcon } = useLeagueAssets();
  const profile = selection ? participantProfiles[participantProfileKey(selection.gameId, selection.participantId)] : undefined;
  const [noteDraft, setNoteDraft] = useState("");
  const [tagsDraft, setTagsDraft] = useState("");

  useEffect(() => {
    if (selection) {
      void loadParticipantProfile({ ...selection, recentLimit: 6 });
    }
  }, [loadParticipantProfile, selection]);

  useEffect(() => {
    void loadLeagueProfileIcon(profile?.profileIconId);
  }, [loadLeagueProfileIcon, profile?.profileIconId]);

  useEffect(() => {
    const championIds = new Set<number>();
    for (const match of profile?.recentStats?.recentMatches ?? []) {
      if (match.championId) {
        championIds.add(match.championId);
      }
    }

    for (const championId of championIds) {
      void loadLeagueChampionIcon(championId);
    }
  }, [loadLeagueChampionIcon, profile?.recentStats?.recentMatches]);

  useEffect(() => {
    setNoteDraft(profile?.note?.note ?? "");
    setTagsDraft(profile?.note?.tags.join(", ") ?? "");
  }, [profile?.gameId, profile?.participantId, profile?.note?.note, profile?.note?.tags]);

  const containerClass = [
    "rounded-lg border border-zinc-200 bg-white p-5 shadow-sm",
    sticky ? "xl:sticky xl:top-7 xl:self-start" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (!selection) {
    return (
      <aside className={containerClass}>
        <h2 className="text-base font-semibold text-zinc-950">{t("participant.profile")}</h2>
        <p className="mt-2 text-sm text-zinc-500">{t("participant.empty")}</p>
      </aside>
    );
  }

  if (!profile) {
    return (
      <aside className={containerClass}>
        <h2 className="text-base font-semibold text-zinc-950">{t("participant.loading")}</h2>
        <p className="mt-2 text-sm text-zinc-500">{t("participant.reading")}</p>
      </aside>
    );
  }

  const activeSelection = selection;
  const activeProfile = profile;
  const tags = tagsDraft
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const profileImageUrl = activeProfile.profileIconId ? leagueImages.profileIcons[activeProfile.profileIconId] : undefined;

  async function handleSaveNote() {
    const saved = await savePlayerNote({ gameId: activeProfile.gameId, participantId: activeProfile.participantId, note: noteDraft, tags });

    if (saved) {
      await emitParticipantProfileChanged(activeSelection);
    }
  }

  async function handleClearNote() {
    const cleared = await clearPlayerNote(activeProfile.gameId, activeProfile.participantId);

    if (cleared) {
      await emitParticipantProfileChanged(activeSelection);
    }
  }

  return (
    <aside className={containerClass}>
      <div className="flex items-center gap-3">
        <ProfileImage displayName={activeProfile.displayName} imageUrl={profileImageUrl} />
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-zinc-950">{activeProfile.displayName}</h2>
          <p className="mt-1 text-xs text-zinc-500">{t("participant.completed")}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        <Detail label={t("dashboard.recentKda")} value={formatAverageKda(activeProfile.recentStats?.averageKda, t)} />
        <Detail label={t("participant.recentMatches")} value={activeProfile.recentStats ? String(activeProfile.recentStats.matchCount) : t("common.unavailable")} />
        <Detail label={t("participant.recentChampions")} value={activeProfile.recentStats?.recentChampions.join(", ") || t("common.unavailable")} />
      </div>

      <RecentMatchesList matches={activeProfile.recentStats?.recentMatches ?? []} />

      {activeProfile.warnings.length > 0 && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {activeProfile.warnings.map((warning) => (
            <p key={`${warning.section}-${warning.message}`}>{warning.message}</p>
          ))}
        </div>
      )}

      <div className="mt-5 grid gap-3">
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          {t("participant.note")}
          <textarea
            className="min-h-28 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none transition focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
            maxLength={1000}
            onChange={(event) => setNoteDraft(event.target.value)}
            value={noteDraft}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          {t("participant.tags")}
          <input
            className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
            onChange={(event) => setTagsDraft(event.target.value)}
            placeholder="support, calm"
            value={tagsDraft}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            className="h-10 rounded-md bg-rose-700 px-3 text-sm font-semibold text-white transition hover:bg-rose-800"
            onClick={() => void handleSaveNote()}
            type="button"
          >
            {t("participant.saveNote")}
          </button>
          <button
            className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
            onClick={() => void handleClearNote()}
            type="button"
          >
            {t("common.clear")}
          </button>
        </div>
      </div>
    </aside>
  );
}

function RecentMatchesList({ matches }: { matches: RecentMatchSummary[] }) {
  const {
    loadPostMatchDetail,
    postMatchDetails,
    t,
  } = useAppCore();
  const { leagueImages, loadLeagueChampionIcon, loadLeagueGameAsset } = useLeagueAssets();
  const [expandedGameId, setExpandedGameId] = useState<number | null>(null);
  const expandedDetail = expandedGameId ? postMatchDetails[expandedGameId] : undefined;

  useEffect(() => {
    if (!expandedDetail) {
      return;
    }

    const championIds = new Set<number>();
    const itemIds = new Set<number>();
    const runeIds = new Set<number>();
    const spellIds = new Set<number>();

    for (const team of expandedDetail.teams) {
      for (const participant of team.participants) {
        if (participant.championId) {
          championIds.add(participant.championId);
        }
        for (const itemId of participant.items) {
          itemIds.add(itemId);
        }
        for (const runeId of participant.runes) {
          runeIds.add(runeId);
        }
        for (const spellId of participant.spells) {
          spellIds.add(spellId);
        }
      }
    }

    for (const championId of championIds) {
      void loadLeagueChampionIcon(championId);
    }
    for (const itemId of itemIds) {
      void loadLeagueGameAsset("item", itemId);
    }
    for (const runeId of runeIds) {
      void loadLeagueGameAsset("rune", runeId);
    }
    for (const spellId of spellIds) {
      void loadLeagueGameAsset("spell", spellId);
    }
  }, [expandedDetail, loadLeagueChampionIcon, loadLeagueGameAsset]);

  function toggleMatch(gameId: number) {
    const nextGameId = expandedGameId === gameId ? null : gameId;
    setExpandedGameId(nextGameId);

    if (nextGameId && !postMatchDetails[nextGameId]) {
      void loadPostMatchDetail(nextGameId);
    }
  }

  function selectParticipant(gameId: number, participantId: number) {
    void openParticipantProfileWindow({ gameId, participantId });
  }

  return (
    <section className="mt-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-zinc-950">{t("participant.recentSix")}</h3>
        <span className="text-xs font-medium text-zinc-500">{matches.length} {t("participant.loaded")}</span>
      </div>
      <div className="mt-3 grid gap-2">
        {matches.length === 0 && (
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-500">{t("participant.publicUnavailable")}</div>
        )}
        {matches.map((match) => (
          <RecentMatchRow
            detail={postMatchDetails[match.gameId]}
            gameAssets={leagueImages.gameAssets}
            isExpanded={expandedGameId === match.gameId}
            imageUrl={match.championId ? leagueImages.championIcons[match.championId] : undefined}
            key={match.gameId}
            match={match}
            onParticipantSelect={(participantId) => selectParticipant(match.gameId, participantId)}
            onToggle={() => toggleMatch(match.gameId)}
            participantImages={leagueImages.championIcons}
            t={t}
          />
        ))}
      </div>
    </section>
  );
}

function RecentMatchRow({
  detail,
  gameAssets,
  imageUrl,
  isExpanded,
  match,
  onParticipantSelect,
  onToggle,
  participantImages,
  t,
}: {
  detail: PostMatchDetail | undefined;
  gameAssets: Record<string, LeagueGameAssetView>;
  imageUrl: string | undefined;
  isExpanded: boolean;
  match: RecentMatchSummary;
  onParticipantSelect: (participantId: number) => void;
  onToggle: () => void;
  participantImages: Record<number, string>;
  t: T;
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50">
      <button
        className="grid w-full grid-cols-[auto_1fr_auto_auto] items-center gap-3 p-2 text-left transition hover:bg-white"
        onClick={onToggle}
        type="button"
      >
        <ChampionImage championName={match.championName} imageUrl={imageUrl} size="sm" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-zinc-950">{match.championName}</p>
            <ResultBadge result={match.result} />
          </div>
          <p className="mt-1 truncate text-xs text-zinc-500">
            {match.queueName ?? t("common.unknown")} - {formatTimestamp(match.playedAt, t)}
          </p>
          <p className="mt-1 text-xs text-zinc-500">{formatDuration(match.gameDurationSeconds, t)}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-zinc-950">
            {match.kills}/{match.deaths}/{match.assists}
          </p>
          <p className="mt-1 text-xs text-zinc-500">{match.kda === null ? "KDA n/a" : `KDA ${match.kda.toFixed(1)}`}</p>
        </div>
        <ChevronIcon expanded={isExpanded} />
      </button>

      {isExpanded && (
        <div className="grid gap-4 border-t border-zinc-200 bg-white p-3">
          <div className="grid gap-2">
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

function ProfileImage({ displayName, imageUrl }: { displayName: string; imageUrl: string | undefined }) {
  if (imageUrl) {
    return <img alt={`${displayName} profile icon`} className="h-14 w-14 shrink-0 rounded-md border border-zinc-200 object-cover" src={imageUrl} />;
  }

  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-100 text-sm font-semibold text-zinc-500">
      {initials(displayName)}
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

function formatAverageKda(value: number | null | undefined, t: T) {
  return value === null || value === undefined ? t("common.unavailable") : value.toFixed(1);
}

function formatDuration(value: number | null, t: T) {
  if (!value || value < 0) {
    return t("common.unavailable");
  }

  const minutes = Math.floor(value / 60);
  const seconds = value % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function participantProfileKey(gameId: number, participantId: number) {
  return `${gameId}:${participantId}`;
}

