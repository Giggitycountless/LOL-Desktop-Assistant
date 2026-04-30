export function StatePanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
      <p className="text-sm font-semibold text-zinc-950">{title}</p>
      <p className="mt-1 text-sm text-zinc-500">{body}</p>
    </div>
  );
}
