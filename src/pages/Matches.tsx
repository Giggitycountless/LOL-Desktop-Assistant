import { useEffect, useState } from "react";

import { leagueGameAssetKey, useAppState, type LeagueGameAssetView } from "../state/AppStateProvider";
import type {
  LeagueGameAssetKind,
  MatchResult,
  ParticipantMetricLeader,
  ParticipantPublicProfile,
  PostMatchDetail,
  PostMatchParticipant,
  PostMatchTeam,
  RecentMatchSummary,
} from "../backend/types";

type SelectedParticipant = {
  gameId: number;
  participantId: number;
};

export function Matches() {
  const {
    leagueSelfSnapshot,
    leagueImages,
    postMatchDetails,
    participantProfiles,
    isLeagueClientLoading,
    loadLeagueGameAsset,
    loadLeagueChampionIcon,
    loadLeagueProfileIcon,
    loadParticipantProfile,
    loadPostMatchDetail,
    refreshLeagueClient,
    savePlayerNote,
    clearPlayerNote,
  } = useAppState();
  const [expandedGameId, setExpandedGameId] = useState<number | null>(null);
  const [selectedParticipant, setSelectedParticipant] = useState<SelectedParticipant | null>(null);
  const matches = leagueSelfSnapshot?.recentMatches ?? [];
  const selectedProfile = selectedParticipant
    ? participantProfiles[participantProfileKey(selectedParticipant.gameId, selectedParticipant.participantId)]
    : undefined;

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
    if (selectedParticipant) {
      void loadParticipantProfile({ ...selectedParticipant, recentLimit: 6 });
    }
  }, [loadParticipantProfile, selectedParticipant]);

  useEffect(() => {
    void loadLeagueProfileIcon(selectedProfile?.profileIconId);
  }, [loadLeagueProfileIcon, selectedProfile?.profileIconId]);

  return (
    <main className="min-h-0 flex-1 overflow-auto px-8 py-7">
      <div className="mx-auto grid w-full max-w-7xl gap-7 xl:grid-cols-[1fr_22rem]">
        <div className="flex min-w-0 flex-col gap-7">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-wide text-rose-700">Matches</p>
              <h1 className="mt-2 text-3xl font-semibold text-zinc-950">Post-Match Analysis</h1>
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
                <h2 className="text-base font-semibold text-zinc-950">Completed Matches</h2>
                <p className="mt-1 text-sm text-zinc-500">{matchCountLabel(matches.length, isLeagueClientLoading)}</p>
              </div>
              <StatusBadge result={matches[0]?.result ?? "unknown"} />
            </div>

            <div className="mt-5 grid gap-3">
              {!leagueSelfSnapshot && isLeagueClientLoading && <StatePanel title="Loading matches" body="Reading local League Client data" />}
              {leagueSelfSnapshot && matches.length === 0 && (
                <StatePanel title="No matches available" body={emptyMatchesBody(leagueSelfSnapshot.status.phase)} />
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
                    onParticipantSelect={(participantId) => setSelectedParticipant({ gameId: match.gameId, participantId })}
                    onToggle={() => setExpandedGameId(expandedGameId === match.gameId ? null : match.gameId)}
                    gameAssets={leagueImages.gameAssets}
                    participantImages={leagueImages.championIcons}
                  />
                );
              })}
            </div>
          </section>
        </div>

        <ParticipantProfilePanel
          clearPlayerNote={clearPlayerNote}
          imageUrl={selectedProfile?.profileIconId ? leagueImages.profileIcons[selectedProfile.profileIconId] : undefined}
          profile={selectedProfile}
          savePlayerNote={savePlayerNote}
          selection={selectedParticipant}
        />
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
}: {
  detail: PostMatchDetail | undefined;
  imageUrl: string | undefined;
  isExpanded: boolean;
  match: RecentMatchSummary;
  onParticipantSelect: (participantId: number) => void;
  onToggle: () => void;
  gameAssets: Record<string, LeagueGameAssetView>;
  participantImages: Record<number, string>;
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
        <div className="grid gap-4 border-t border-zinc-200 bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-4">
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

function PostMatchAnalysis({
  detail,
  gameAssets,
  onParticipantSelect,
  participantImages,
}: {
  detail: PostMatchDetail;
  gameAssets: Record<string, LeagueGameAssetView>;
  onParticipantSelect: (participantId: number) => void;
  participantImages: Record<number, string>;
}) {
  const maxDamage = Math.max(
    1,
    ...detail.teams.flatMap((team) => team.participants.map((participant) => participant.damageToChampions)),
  );

  return (
    <div className="grid gap-4">
      <ComparisonStrip comparison={detail.comparison} />
      <div className="grid gap-4">
        {detail.teams.map((team) => (
          <TeamBlock
            gameAssets={gameAssets}
            key={team.teamId}
            maxDamage={maxDamage}
            onParticipantSelect={onParticipantSelect}
            participantImages={participantImages}
            team={team}
          />
        ))}
      </div>
      {detail.warnings.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {detail.warnings.map((warning) => (
            <p key={`${warning.section}-${warning.message}`}>{warning.message}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function TeamBlock({
  gameAssets,
  maxDamage,
  onParticipantSelect,
  participantImages,
  team,
}: {
  gameAssets: Record<string, LeagueGameAssetView>;
  maxDamage: number;
  onParticipantSelect: (participantId: number) => void;
  participantImages: Record<number, string>;
  team: PostMatchTeam;
}) {
  return (
    <div className="overflow-visible rounded-md border border-zinc-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-zinc-50 px-3 py-2">
        <div>
          <p className="text-sm font-semibold text-zinc-950">Team {team.teamId}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {team.totals.kills}/{team.totals.deaths}/{team.totals.assists} - {formatCompact(team.totals.goldEarned)} gold
          </p>
        </div>
        <ResultBadge result={team.result} />
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="grid min-w-[58rem] grid-cols-[minmax(15rem,1.6fr)_4.25rem_5.5rem_minmax(8rem,0.8fr)_4rem_4rem_4.5rem_minmax(14rem,1.2fr)] gap-3 border-b border-zinc-200 bg-zinc-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          <span>Player</span>
          <span>Score</span>
          <span>KDA</span>
          <span>Damage</span>
          <span>VS</span>
          <span>CS</span>
          <span>Gold</span>
          <span>Build</span>
        </div>

        <div>
          {team.participants.map((participant) => (
            <ParticipantRow
              gameAssets={gameAssets}
              imageUrl={participant.championId ? participantImages[participant.championId] : undefined}
              key={participant.participantId}
              maxDamage={maxDamage}
              onSelect={() => onParticipantSelect(participant.participantId)}
              participant={participant}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ParticipantRow({
  gameAssets,
  imageUrl,
  maxDamage,
  onSelect,
  participant,
}: {
  gameAssets: Record<string, LeagueGameAssetView>;
  imageUrl: string | undefined;
  maxDamage: number;
  onSelect: () => void;
  participant: PostMatchParticipant;
}) {
  return (
    <button
      className="grid min-w-[58rem] grid-cols-[minmax(15rem,1.6fr)_4.25rem_5.5rem_minmax(8rem,0.8fr)_4rem_4rem_4.5rem_minmax(14rem,1.2fr)] items-center gap-3 border-b border-zinc-100 px-3 py-2 text-left transition last:border-b-0 hover:bg-rose-50"
      onClick={onSelect}
      type="button"
    >
      <div className="flex min-w-0 items-center gap-2">
        <ChampionImage championName={participant.championName} imageUrl={imageUrl} size="sm" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-zinc-950">{participant.displayName}</p>
            {participant.noteSummary.tags.map((tag) => (
              <span key={tag} className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                {tag}
              </span>
            ))}
          </div>
          <p className="mt-1 truncate text-xs text-zinc-500">
            {participant.championName} - {participant.lane ?? participant.role ?? "Unknown role"}
          </p>
        </div>
      </div>
      <ScoreBadge score={participant.performanceScore} />
      <KdaCell participant={participant} />
      <DamageCell damage={participant.damageToChampions} maxDamage={maxDamage} />
      <span className="text-sm font-semibold text-zinc-700">{participant.visionScore}</span>
      <span className="text-sm font-semibold text-zinc-700">{participant.cs}</span>
      <span className="text-sm font-semibold text-zinc-700">{formatCompact(participant.goldEarned)}</span>
      <BuildCell assets={gameAssets} participant={participant} />
    </button>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const tone =
    score >= 8
      ? "bg-sky-100 text-sky-800"
      : score >= 6.5
        ? "bg-emerald-100 text-emerald-800"
        : score >= 4.5
          ? "bg-zinc-100 text-zinc-700"
          : "bg-rose-100 text-rose-800";

  return <span className={["w-fit rounded-md px-2 py-1 text-sm font-bold", tone].join(" ")}>{score.toFixed(1)}</span>;
}

function KdaCell({ participant }: { participant: PostMatchParticipant }) {
  return (
    <div className="min-w-0">
      <p className="text-sm font-semibold text-zinc-950">
        {participant.kills}/{participant.deaths}/{participant.assists}
      </p>
      <p className="mt-0.5 text-xs text-zinc-500">{participant.kda === null ? "n/a" : `${participant.kda.toFixed(2)}:1`}</p>
    </div>
  );
}

function DamageCell({ damage, maxDamage }: { damage: number; maxDamage: number }) {
  const width = Math.max(4, Math.round((damage / maxDamage) * 100));

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-zinc-950">{formatCompact(damage)}</span>
        <span className="text-[11px] text-zinc-500">{width}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-200">
        <div className="h-full rounded-full bg-rose-500" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function BuildCell({
  assets,
  participant,
}: {
  assets: Record<string, LeagueGameAssetView>;
  participant: PostMatchParticipant;
}) {
  return (
    <div className="grid gap-1">
      <AssetStrip assetIds={participant.items} assets={assets} iconSize="md" kind="item" />
      <div className="flex flex-wrap gap-1">
        <AssetStrip assetIds={participant.runes} assets={assets} iconSize="sm" kind="rune" />
        <AssetStrip assetIds={participant.spells} assets={assets} iconSize="sm" kind="spell" />
      </div>
    </div>
  );
}

function AssetStrip({
  assetIds,
  assets,
  iconSize,
  kind,
}: {
  assetIds: number[];
  assets: Record<string, LeagueGameAssetView>;
  iconSize: "sm" | "md";
  kind: LeagueGameAssetKind;
}) {
  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {assetIds.length === 0 && kind === "item" && <span className="text-xs text-zinc-400">No items</span>}
      {assetIds.map((assetId, index) => (
        <AssetIcon
          asset={assets[leagueGameAssetKey(kind, assetId)]}
          assetId={assetId}
          iconSize={iconSize}
          key={`${kind}-${assetId}-${index}`}
          kind={kind}
        />
      ))}
    </div>
  );
}

function AssetIcon({
  asset,
  assetId,
  iconSize,
  kind,
}: {
  asset: LeagueGameAssetView | undefined;
  assetId: number;
  iconSize: "sm" | "md";
  kind: LeagueGameAssetKind;
}) {
  const label = asset?.name ?? `${assetLabel(kind)} ${assetId}`;
  const title = asset?.description ? `${label}\n${asset.description}` : label;
  const sizeClass = iconSize === "md" ? "h-7 w-7" : "h-5 w-5";

  return (
    <span
      className={["group relative inline-flex shrink-0 items-center justify-center rounded border border-zinc-200 bg-zinc-100", sizeClass].join(" ")}
      title={title}
    >
      {asset ? (
        <img alt={label} className="h-full w-full rounded object-cover" src={asset.imageUrl} />
      ) : (
        <span className="text-[9px] font-semibold text-zinc-500">{assetId}</span>
      )}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-72 -translate-x-1/2 rounded-md border border-zinc-800 bg-zinc-950 p-3 text-left text-xs text-white shadow-xl group-hover:block">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="mt-1 block text-zinc-300">{asset?.description ?? `${assetLabel(kind)} details are loading from local game data.`}</span>
      </span>
    </span>
  );
}

function ParticipantProfilePanel({
  clearPlayerNote,
  imageUrl,
  profile,
  savePlayerNote,
  selection,
}: {
  clearPlayerNote: (gameId: number, participantId: number) => Promise<boolean>;
  imageUrl: string | undefined;
  profile: ParticipantPublicProfile | undefined;
  savePlayerNote: (input: { gameId: number; participantId: number; note: string | null; tags: string[] }) => Promise<unknown>;
  selection: SelectedParticipant | null;
}) {
  const [noteDraft, setNoteDraft] = useState("");
  const [tagsDraft, setTagsDraft] = useState("");

  useEffect(() => {
    setNoteDraft(profile?.note?.note ?? "");
    setTagsDraft(profile?.note?.tags.join(", ") ?? "");
  }, [profile?.gameId, profile?.participantId, profile?.note?.note, profile?.note?.tags]);

  if (!selection) {
    return (
      <aside className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm xl:sticky xl:top-7 xl:self-start">
        <h2 className="text-base font-semibold text-zinc-950">Participant Profile</h2>
        <p className="mt-2 text-sm text-zinc-500">Select a completed-match participant to view public profile details and local notes.</p>
      </aside>
    );
  }

  if (!profile) {
    return (
      <aside className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm xl:sticky xl:top-7 xl:self-start">
        <h2 className="text-base font-semibold text-zinc-950">Loading profile</h2>
        <p className="mt-2 text-sm text-zinc-500">Reading completed-match-visible participant data.</p>
      </aside>
    );
  }

  const tags = tagsDraft
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  return (
    <aside className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm xl:sticky xl:top-7 xl:self-start">
      <div className="flex items-center gap-3">
        <ProfileImage displayName={profile.displayName} imageUrl={imageUrl} />
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-zinc-950">{profile.displayName}</h2>
          <p className="mt-1 text-xs text-zinc-500">Completed match participant</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        <Detail label="Recent KDA" value={profile.recentStats?.averageKda === null || !profile.recentStats ? "Unavailable" : profile.recentStats.averageKda.toFixed(1)} />
        <Detail label="Recent matches" value={profile.recentStats ? String(profile.recentStats.matchCount) : "Unavailable"} />
        <Detail label="Recent champions" value={profile.recentStats?.recentChampions.join(", ") || "Unavailable"} />
      </div>

      {profile.warnings.length > 0 && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {profile.warnings.map((warning) => (
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
            onClick={() => savePlayerNote({ gameId: profile.gameId, participantId: profile.participantId, note: noteDraft, tags })}
            type="button"
          >
            Save note
          </button>
          <button
            className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
            onClick={() => clearPlayerNote(profile.gameId, profile.participantId)}
            type="button"
          >
            Clear
          </button>
        </div>
      </div>
    </aside>
  );
}

function ComparisonStrip({ comparison }: { comparison: PostMatchDetail["comparison"] }) {
  return (
    <div className="grid gap-2 md:grid-cols-5">
      <Leader label="KDA" leader={comparison.highestKda} />
      <Leader label="CS" leader={comparison.mostCs} />
      <Leader label="Gold" leader={comparison.mostGold} />
      <Leader label="Damage" leader={comparison.mostDamage} />
      <Leader label="Vision" leader={comparison.highestVision} />
    </div>
  );
}

function Leader({ label, leader }: { label: string; leader: ParticipantMetricLeader | null }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-zinc-950">{leader?.displayName ?? "Unavailable"}</p>
      <p className="mt-1 text-xs text-zinc-500">{leader ? formatLeaderValue(leader.value) : "No data"}</p>
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

function formatCompact(value: number) {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }

  return String(value);
}

function formatLeaderValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function participantProfileKey(gameId: number, participantId: number) {
  return `${gameId}:${participantId}`;
}

function assetLabel(kind: LeagueGameAssetKind) {
  switch (kind) {
    case "item":
      return "Item";
    case "rune":
      return "Rune";
    case "spell":
      return "Spell";
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
