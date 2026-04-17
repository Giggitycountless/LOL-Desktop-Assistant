export function Settings() {
  return (
    <main className="min-h-0 flex-1 overflow-auto px-8 py-7">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header>
          <p className="text-sm font-medium uppercase tracking-wide text-rose-700">Settings</p>
          <h1 className="mt-2 text-3xl font-semibold text-zinc-950">Preferences</h1>
        </header>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-zinc-950">Local Profile</h2>
            <dl className="mt-5 grid gap-4">
              <SettingRow label="Install channel" value="Local" />
              <SettingRow label="Data store" value="SQLite" />
              <SettingRow label="Packaging" value="Windows" />
            </dl>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-zinc-950">Application</h2>
            <dl className="mt-5 grid gap-4">
              <SettingRow label="Version" value="0.1.0" />
              <SettingRow label="Runtime" value="Tauri 2" />
              <SettingRow label="Interface" value="React 19" />
            </dl>
          </div>
        </section>
      </div>
    </main>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3">
      <dt className="text-sm font-medium text-zinc-600">{label}</dt>
      <dd className="text-sm font-semibold text-zinc-950">{value}</dd>
    </div>
  );
}
