import { useAppCore } from "../../state/AppStateProvider";
import type { MatchResult } from "../../backend/types";
import { formatResult } from "../../utils/formatting";

export function ResultBadge({ result }: { result: MatchResult }) {
  const { t } = useAppCore();
  const tone =
    result === "win"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : result === "loss"
        ? "border-rose-200 bg-rose-50 text-rose-800"
        : "border-zinc-200 bg-white text-zinc-600";

  return <span className={["rounded-md border px-2 py-0.5 text-xs font-semibold", tone].join(" ")}>{formatResult(result, t)}</span>;
}
