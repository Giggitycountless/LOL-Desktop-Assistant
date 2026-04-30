import { useAppCore } from "../state/AppStateProvider";
import type { LeagueClientStatus } from "../backend/types";
import { Metric, RefreshIcon } from "../components/common";
import { formatTimestamp, type T } from "../utils/formatting";

export function Dashboard() {
  const { snapshot, isLoading, leagueSelfSnapshot, isLeagueClientLoading, refreshLeagueClient, t } = useAppCore();
  const health = snapshot?.health;
  const recentActivity = snapshot?.recentActivity ?? [];

  return (
    <main className="min-h-0 flex-1 overflow-auto px-8 py-7">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-7">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-rose-700">{t("dashboard.eyebrow")}</p>
            <h1 className="mt-2 text-3xl font-semibold text-zinc-950">{t("app.name")}</h1>
          </div>
          <HealthBadge status={health?.status ?? (isLoading ? "loading" : "degraded")} t={t} />
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <StatusTile label={t("dashboard.application")} value={health?.status ?? t("common.loading")} tone={health?.status === "ok" ? "good" : "warn"} />
          <StatusTile
            label={t("dashboard.database")}
            value={health?.databaseStatus ?? t("common.pending")}
            tone={health?.databaseStatus === "ok" ? "good" : "warn"}
          />
          <StatusTile
            label={t("dashboard.schema")}
            value={health ? String(health.schemaVersion ?? t("common.noData")) : t("common.pending")}
            tone={health?.schemaVersion ? "good" : "warn"}
          />
        </section>

        <LeagueOverview
          averageKda={leagueSelfSnapshot?.recentPerformance.averageKda ?? null}
          isLoading={isLeagueClientLoading}
          onRefresh={() => refreshLeagueClient({ matchLimit: 6 })}
          refreshedAt={leagueSelfSnapshot?.refreshedAt ?? null}
          status={leagueSelfSnapshot?.status}
          summonerName={leagueSelfSnapshot?.summoner?.displayName ?? null}
          t={t}
        />

        <section className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-zinc-950">{t("dashboard.currentState")}</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Metric label={t("dashboard.startup")} value={snapshot?.settings.startupPage ?? t("common.loading")} />
              <Metric label={t("dashboard.density")} value={snapshot?.settings.compactMode ? t("dashboard.compact") : t("dashboard.standard")} />
              <Metric label={t("dashboard.activityLimit")} value={snapshot ? String(snapshot.settings.activityLimit) : t("common.loading")} />
              <Metric label={t("dashboard.activityEntries")} value={String(recentActivity.length)} />
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-zinc-950">{t("dashboard.recentActivity")}</h2>
            <div className="mt-5 min-h-24 rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
              {isLoading && t("dashboard.loadingActivity")}
              {!isLoading && recentActivity.length === 0 && t("dashboard.noActivity")}
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

function LeagueOverview({
  averageKda,
  isLoading,
  onRefresh,
  refreshedAt,
  status,
  summonerName,
  t,
}: {
  averageKda: number | null;
  isLoading: boolean;
  onRefresh: () => void;
  refreshedAt: string | null;
  status: LeagueClientStatus | undefined;
  summonerName: string | null;
  t: T;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-950">{t("dashboard.leagueClient")}</h2>
          <p className="mt-1 text-sm text-zinc-500">{leagueStatusMessage(status, isLoading, t)}</p>
        </div>
        <div className="flex items-center gap-2">
          <LeagueStatusBadge isLoading={isLoading} status={status} t={t} />
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 transition hover:border-zinc-400 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isLoading}
            onClick={onRefresh}
            type="button"
          >
            <RefreshIcon />
            {t("common.refresh")}
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <Metric label={t("dashboard.summoner")} value={summonerName ?? (isLoading ? t("common.loading") : t("common.unavailable"))} />
        <Metric label={t("dashboard.recentKda")} value={averageKda === null ? t("common.unavailable") : averageKda.toFixed(1)} />
        <Metric label={t("dashboard.updated")} value={formatTimestamp(refreshedAt, t)} />
      </div>
    </section>
  );
}

function LeagueStatusBadge({ status, isLoading, t }: { status: LeagueClientStatus | undefined; isLoading: boolean; t: T }) {
  const isReady = status?.connection === "connected" && status.phase === "connected";
  const isPartial = status?.phase === "partialData";
  const label = isLoading ? (status ? t("common.refreshing") : t("common.loading")) : isReady ? t("common.connected") : formatLeaguePhase(status?.phase, t);

  return (
    <div
      className={[
        "inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium",
        isReady
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : isPartial
            ? "border-sky-200 bg-sky-50 text-sky-800"
            : "border-amber-200 bg-amber-50 text-amber-800",
      ].join(" ")}
    >
      <span className={["h-2.5 w-2.5 rounded-full", isReady ? "bg-emerald-600" : isPartial ? "bg-sky-600" : "bg-amber-500"].join(" ")} />
      {label}
    </div>
  );
}

function HealthBadge({ status, t }: { status: "ok" | "degraded" | "loading"; t: T }) {
  const isReady = status === "ok";

  return (
    <div
      className={[
        "inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium",
        isReady ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800",
      ].join(" ")}
    >
      <span className={["h-2.5 w-2.5 rounded-full", isReady ? "bg-emerald-600" : "bg-amber-500"].join(" ")} />
      {isReady ? t("common.ready") : t("common.pending")}
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

function formatLeaguePhase(phase: LeagueClientStatus["phase"] | undefined, t: T) {
  switch (phase) {
    case "notRunning":
      return "Not running";
    case "lockfileMissing":
      return "No lockfile";
    case "unauthorized":
      return "Unauthorized";
    case "notLoggedIn":
      return "Not logged in";
    case "patching":
      return "Preparing";
    case "partialData":
      return "Partial data";
    case "unavailable":
      return t("common.unavailable");
    case "connecting":
      return "Connecting";
    case "connected":
      return t("common.connected");
    default:
      return t("common.pending");
  }
}

function leagueStatusMessage(status: LeagueClientStatus | undefined, isLoading: boolean, t: T) {
  if (isLoading && !status) {
    return t("dashboard.checkingClient");
  }

  if (isLoading) {
    return t("dashboard.refreshingClient");
  }

  if (status?.message) {
    return status.message;
  }

  if (status?.connection === "connected") {
    return t("dashboard.clientReady");
  }

  return t("dashboard.clientUnavailable");
}

