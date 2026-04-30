import { describe, expect, it } from "vitest";
import type { TranslationKey } from "../../i18n";
import { formatResult, formatTimestamp, initials, type T } from "../formatting";

const t: T = (key: TranslationKey) => {
  const map: Record<string, string> = {
    "common.pending": "n/a",
    "common.win": "Win",
    "common.loss": "Loss",
    "common.unknown": "Unknown",
  };
  return map[key] ?? key;
};

describe("initials", () => {
  it("returns first letters of two words", () => {
    expect(initials("John Doe")).toBe("JD");
  });

  it("returns first letter of single word", () => {
    expect(initials("Alice")).toBe("A");
  });

  it("returns ? for empty string", () => {
    expect(initials("")).toBe("?");
  });

  it("returns ? for whitespace-only string", () => {
    expect(initials("  ")).toBe("?");
  });
});

describe("formatTimestamp", () => {
  it("returns n/a for null", () => {
    expect(formatTimestamp(null, t)).toBe("n/a");
  });

  it("returns n/a for undefined", () => {
    expect(formatTimestamp(undefined, t)).toBe("n/a");
  });

  it("formats ISO date string", () => {
    const result = formatTimestamp("2024-01-15T10:30:00Z", t);
    const expected = new Date("2024-01-15T10:30:00Z").toLocaleString();
    expect(result).toBe(expected);
  });
});

describe("formatResult", () => {
  it("returns translated win text", () => {
    expect(formatResult("win", t)).toBe("Win");
  });

  it("returns translated loss text", () => {
    expect(formatResult("loss", t)).toBe("Loss");
  });
});
