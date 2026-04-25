import { leagueGameAssetKey, useAppState, type LeagueGameAssetView } from "../state/AppStateProvider";
import type {
  LeagueGameAssetKind,
  MatchResult,
  ParticipantMetricLeader,
  PostMatchDetail,
  PostMatchParticipant,
  PostMatchTeam,
} from "../backend/types";
import type { TranslationKey } from "../i18n";

type T = (key: TranslationKey) => string;

export function PostMatchAnalysis({
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
  const { t } = useAppState();
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
            t={t}
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
  t,
}: {
  gameAssets: Record<string, LeagueGameAssetView>;
  maxDamage: number;
  onParticipantSelect: (participantId: number) => void;
  participantImages: Record<number, string>;
  team: PostMatchTeam;
  t: T;
}) {
  return (
    <div className="overflow-visible rounded-md border border-zinc-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-zinc-50 px-3 py-2">
        <div>
          <p className="text-sm font-semibold text-zinc-950">{t("analysis.team")} {team.teamId}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {team.totals.kills}/{team.totals.deaths}/{team.totals.assists} - {formatCompact(team.totals.goldEarned)} {t("analysis.gold")}
          </p>
        </div>
        <ResultBadge result={team.result} t={t} />
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="grid min-w-[58rem] grid-cols-[minmax(15rem,1.6fr)_4.25rem_5.5rem_minmax(8rem,0.8fr)_4rem_4rem_4.5rem_minmax(14rem,1.2fr)] gap-3 border-b border-zinc-200 bg-zinc-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          <span>{t("analysis.player")}</span>
          <span>{t("analysis.score")}</span>
          <span>KDA</span>
          <span>{t("analysis.damage")}</span>
          <span>VS</span>
          <span>CS</span>
          <span>{t("analysis.gold")}</span>
          <span>{t("analysis.build")}</span>
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
              t={t}
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
  t,
}: {
  gameAssets: Record<string, LeagueGameAssetView>;
  imageUrl: string | undefined;
  maxDamage: number;
  onSelect: () => void;
  participant: PostMatchParticipant;
  t: T;
}) {
  return (
    <button
      className="grid min-w-[58rem] grid-cols-[minmax(15rem,1.6fr)_4.25rem_5.5rem_minmax(8rem,0.8fr)_4rem_4rem_4.5rem_minmax(14rem,1.2fr)] items-center gap-3 border-b border-zinc-100 px-3 py-2 text-left transition last:border-b-0 hover:bg-rose-50"
      onClick={onSelect}
      type="button"
    >
      <div className="flex min-w-0 items-center gap-2">
        <ChampionImage championName={participant.championName} imageUrl={imageUrl} />
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
      <BuildCell assets={gameAssets} participant={participant} t={t} />
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
  t,
}: {
  assets: Record<string, LeagueGameAssetView>;
  participant: PostMatchParticipant;
  t: T;
}) {
  return (
    <div className="grid gap-1">
      <AssetStrip assetIds={participant.items} assets={assets} iconSize="md" kind="item" t={t} />
      <div className="flex flex-wrap gap-1">
        <AssetStrip assetIds={participant.runes} assets={assets} iconSize="sm" kind="rune" t={t} />
        <AssetStrip assetIds={participant.spells} assets={assets} iconSize="sm" kind="spell" t={t} />
      </div>
    </div>
  );
}

function AssetStrip({
  assetIds,
  assets,
  iconSize,
  kind,
  t,
}: {
  assetIds: number[];
  assets: Record<string, LeagueGameAssetView>;
  iconSize: "sm" | "md";
  kind: LeagueGameAssetKind;
  t: T;
}) {
  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {assetIds.length === 0 && kind === "item" && <span className="text-xs text-zinc-400">{t("analysis.noItems")}</span>}
      {assetIds.map((assetId, index) => (
        <AssetIcon
          asset={assets[leagueGameAssetKey(kind, assetId)]}
          assetId={assetId}
          iconSize={iconSize}
          key={`${kind}-${assetId}-${index}`}
          kind={kind}
          t={t}
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
  t,
}: {
  asset: LeagueGameAssetView | undefined;
  assetId: number;
  iconSize: "sm" | "md";
  kind: LeagueGameAssetKind;
  t: T;
}) {
  const label = asset?.name ?? `${assetLabel(kind, t)} ${assetId}`;
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
        <span className="mt-1 block text-zinc-300">{asset?.description ?? `${assetLabel(kind, t)} ${t("analysis.detailsLoading")}`}</span>
      </span>
    </span>
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

function ChampionImage({ championName, imageUrl }: { championName: string; imageUrl: string | undefined }) {
  if (imageUrl) {
    return <img alt={`${championName} icon`} className="h-9 w-9 shrink-0 rounded-md border border-zinc-200 object-cover" src={imageUrl} />;
  }

  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-100 text-sm font-semibold text-zinc-500">
      {initials(championName)}
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

function formatCompact(value: number) {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }

  return String(value);
}

function formatLeaderValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function assetLabel(kind: LeagueGameAssetKind, t: T) {
  switch (kind) {
    case "item":
      return t("analysis.item");
    case "rune":
      return t("analysis.rune");
    case "spell":
      return t("analysis.spell");
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
