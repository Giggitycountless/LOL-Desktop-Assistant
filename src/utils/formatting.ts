import type { TranslationKey } from "../i18n";
import type { MatchResult } from "../backend/types";

export type T = (key: TranslationKey) => string;

export function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function formatTimestamp(value: string | null | undefined, t: T): string {
  if (!value) {
    return t("common.pending");
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

export function formatResult(result: MatchResult, t: T): string {
  switch (result) {
    case "win":
      return t("common.win");
    case "loss":
      return t("common.loss");
    default:
      return t("common.unknown");
  }
}
