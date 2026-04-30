export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-semibold capitalize text-zinc-950">{value}</p>
    </div>
  );
}
