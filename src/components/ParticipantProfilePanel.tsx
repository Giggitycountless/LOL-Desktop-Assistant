import { useEffect, useState } from "react";

import { PostMatchAnalysis } from "./PostMatchAnalysis";
import { useAppState, type LeagueGameAssetView } from "../state/AppStateProvider";
import type { MatchResult, PostMatchDetail, RecentMatchSummary } from "../backend/types";
import { emitParticipantProfileChanged, openParticipantProfileWindow } from "../windows/participantProfileWindow";

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
    leagueImages,
    loadLeagueChampionIcon,
    loadLeagueProfileIcon,
    loadParticipantProfile,
    participantProfiles,
    savePlayerNote,
    clearPlayerNote,
  } = useAppState();
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
    for (const match of profile?.recentStats?.recentMatches ?? []) {
      void loadLeagueChampionIcon(match.championId);
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
        <h2 className="text-base font-semibold text-zinc-950">Participant Profile</h2>
        <p className="mt-2 text-sm text-zinc-500">Select a completed-match participant to view public profile details and local notes.</p>
      </aside>
    );
  }

  if (!profile) {
    return (
      <aside className={containerClass}>
        <h2 className="text-base font-semibold text-zinc-950">Loading profile</h2>
        <p className="mt-2 text-sm text-zinc-500">Reading completed-match-visible participant data.</p>
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
          <p className="mt-1 text-xs text-zinc-500">Completed match participant</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        <Detail label="Recent KDA" value={formatAverageKda(activeProfile.recentStats?.averageKda)} />
        <Detail label="Recent matches" value={activeProfile.recentStats ? String(activeProfile.recentStats.matchCount) : "Unavailable"} />
        <Detail label="Recent champions" value={activeProfile.recentStats?.recentChampions.join(", ") || "Unavailable"} />
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
          Note
          <textarea
            className="min-h-28 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none transition focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
            maxLength={1000}
            onChange={(event) => setNoteDraft(event.target.value)}
            value={noteDraft}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Tags
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
            Save note
          </button>
          <button
            className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
            onClick={() => void handleClearNote()}
            type="button"
          >
            Clear
          </button>
        </div>
      </div>
    </aside>
  );
}

function RecentMatchesList({ matches }: { matches: RecentMatchSummary[] }) {
  const {
    leagueImages,
    loadLeagueChampionIcon,
    loadLeagueGameAsset,
    loadPostMatchDetail,
    postMatchDetails,
  } = useAppState();
  const [expandedGameId, setExpandedGameId] = useState<number | null>(null);
  const expandedDetail = expandedGameId ? postMatchDetails[expandedGameId] : undefined;

  useEffect(() => {
    if (!expandedDetail) {
      return;
    }

    for (const team of expandedDetail.teams) {
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
  }, [expandedDetail, loadLeagueChampionIcon, loadLeagueGameAsset]);

  function toggleMatch(gameId: number) {
    const nextGameId = expandedGameId === gameId ? null : gameId;
    setExpandedGameId(nextGameId);

    if (nextGameId) {
      void loadPostMatchDetail(nextGameId);
    }
  }

  function selectParticipant(gameId: number, participantId: number) {
    void openParticipantProfileWindow({ gameId, participantId });
  }

  return (
    <section className="mt-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-zinc-950">Recent 6 matches</h3>
        <span className="text-xs font-medium text-zinc-500">{matches.length} loaded</span>
      </div>
      <div className="mt-3 grid gap-2">
        {matches.length === 0 && (
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-500">Recent public match data is unavailable.</div>
        )}
        {matches.map((match) => (
          <RecentMatchRow
            detail={postMatchDetails[match.gameId]}
            gameAssets={leagueImages.gameAssets}
            isExpanded={expandedGameId === match.gameId}
            key={match.gameId}
            match={match}
            onParticipantSelect={(participantId) => selectParticipant(match.gameId, participantId)}
            onToggle={() => toggleMatch(match.gameId)}
            participantImages={leagueImages.championIcons}
          />
        ))}
      </div>
    </section>
  );
}

function RecentMatchRow({
  detail,
  gameAssets,
  isExpanded,
  match,
  onParticipantSelect,
  onToggle,
  participantImages,
}: {
  detail: PostMatchDetail | undefined;
  gameAssets: Record<string, LeagueGameAssetView>;
  isExpanded: boolean;
  match: RecentMatchSummary;
  onParticipantSelect: (participantId: number) => void;
  onToggle: () => void;
  participantImages: Record<number, string>;
}) {
  const { leagueImages } = useAppState();
  const imageUrl = match.championId ? leagueImages.championIcons[match.championId] : undefined;

  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50">
      <button
        className="grid w-full grid-cols-[auto_1fr_auto_auto] items-center gap-3 p-2 text-left transition hover:bg-white"
        onClick={onToggle}
        type="button"
      >
        <ChampionImage championName={match.championName} imageUrl={imageUrl} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-zinc-950">{match.championName}</p>
            <ResultBadge result={match.result} />
          </div>
          <p className="mt-1 truncate text-xs text-zinc-500">
            {match.queueName ?? "Unknown queue"} - {formatTimestamp(match.playedAt)}
          </p>
          <p className="mt-1 text-xs text-zinc-500">{formatDuration(match.gameDurationSeconds)}</p>
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
            <Detail label="Result" value={formatResult(match.result)} />
            <Detail label="Duration" value={formatDuration(match.gameDurationSeconds)} />
            <Detail label="Played" value={formatTimestamp(match.playedAt)} />
            <Detail label="Match ID" value={String(match.gameId)} />
          </div>
          {!detail && <StatePanel title="Loading analysis" body="Reading completed match details from local history" />}
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

function ChampionImage({ championName, imageUrl }: { championName: string; imageUrl: string | undefined }) {
  if (imageUrl) {
    return <img alt={`${championName} icon`} className="h-10 w-10 shrink-0 rounded-md border border-zinc-200 object-cover" src={imageUrl} />;
  }

  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-100 text-xs font-semibold text-zinc-500">
      {initials(championName)}
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

function ResultBadge({ result }: { result: MatchResult }) {
  const tone =
    result === "win"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : result === "loss"
        ? "border-rose-200 bg-rose-50 text-rose-800"
        : "border-zinc-200 bg-white text-zinc-600";

  return <span className={["rounded-md border px-2 py-0.5 text-xs font-semibold", tone].join(" ")}>{formatResult(result)}</span>;
}

function StatePanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
      <p className="text-sm font-semibold text-zinc-950">{title}</p>
      <p className="mt-1 text-sm text-zinc-500">{body}</p>
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

function formatAverageKda(value: number | null | undefined) {
  return value === null || value === undefined ? "Unavailable" : value.toFixed(1);
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

function formatTimestamp(value: string | null | undefined) {
  if (!value) {
    return "Pending";
  }

  const numeric = Number(value);
  const date = Number.isFinite(numeric) ? new Date(numeric > 10_000_000_000 ? numeric : numeric * 1_000) : new Date(value);

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

function participantProfileKey(gameId: number, participantId: number) {
  return `${gameId}:${participantId}`;
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
