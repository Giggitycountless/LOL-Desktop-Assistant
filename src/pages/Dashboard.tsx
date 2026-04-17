import { useAppState } from "../state/AppStateProvider";

export function Dashboard() {
  const { snapshot, isLoading } = useAppState();
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
