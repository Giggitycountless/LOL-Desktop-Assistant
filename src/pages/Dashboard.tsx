import { useEffect, useState } from "react";

import { fetchHealthcheck, type HealthcheckResult } from "../backend/healthcheck";

type HealthState =
  | { kind: "loading" }
  | { kind: "ready"; value: HealthcheckResult }
  | { kind: "failed"; message: string };

export function Dashboard() {
  const [health, setHealth] = useState<HealthState>({ kind: "loading" });

  useEffect(() => {
    let isMounted = true;

    fetchHealthcheck()
      .then((value) => {
        if (isMounted) {
          setHealth({ kind: "ready", value });
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setHealth({
            kind: "failed",
            message: error instanceof Error ? error.message : "Healthcheck failed",
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main className="min-h-0 flex-1 overflow-auto px-8 py-7">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-7">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-rose-700">Dashboard</p>
            <h1 className="mt-2 text-3xl font-semibold text-zinc-950">LoL Desktop Assistant</h1>
          </div>
          <HealthBadge health={health} />
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <StatusTile
            label="Application"
            value={health.kind === "ready" ? health.value.status : health.kind}
            tone={health.kind === "ready" && health.value.status === "ok" ? "good" : "warn"}
          />
          <StatusTile
            label="Database"
            value={health.kind === "ready" ? health.value.databaseStatus : "pending"}
            tone={health.kind === "ready" && health.value.databaseStatus === "ok" ? "good" : "warn"}
          />
          <StatusTile
            label="Schema"
            value={health.kind === "ready" ? String(health.value.schemaVersion ?? "none") : "pending"}
            tone={health.kind === "ready" && health.value.schemaVersion !== null ? "good" : "warn"}
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-zinc-950">Current Session</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Metric label="Mode" value="Local" />
              <Metric label="Storage" value={health.kind === "ready" ? "Ready" : "Pending"} />
              <Metric label="Build" value="Milestone 1" />
              <Metric label="Platform" value="Windows" />
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-zinc-950">Healthcheck</h2>
            <div className="mt-5 min-h-24 rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
              {health.kind === "loading" && "Checking"}
              {health.kind === "failed" && health.message}
              {health.kind === "ready" && `Status ${health.value.status}`}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function HealthBadge({ health }: { health: HealthState }) {
  const isReady = health.kind === "ready" && health.value.status === "ok";

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
      <p className="mt-1 text-sm font-semibold text-zinc-950">{value}</p>
    </div>
  );
}
