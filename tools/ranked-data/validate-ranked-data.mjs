import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const VALID_LANES = new Map([
  ["top", "top"],
  ["jungle", "jungle"],
  ["jug", "jungle"],
  ["middle", "middle"],
  ["mid", "middle"],
  ["bottom", "bottom"],
  ["bot", "bottom"],
  ["adc", "bottom"],
  ["support", "support"],
  ["sup", "support"],
]);
const REQUIRED_CANONICAL_LANES = ["top", "jungle", "middle", "bottom", "support"];

const filePath = resolve(process.argv[2] ?? "data/ranked-champions/latest.json");
const errors = [];

const json = await readFile(filePath, "utf8");
const data = parseJson(json);

if (data) {
  validateDocument(data);
}

if (errors.length > 0) {
  console.error(`Ranked champion data is invalid: ${filePath}`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

const laneCounts = countLanes(data.champions);
console.log(
  `Ranked champion data OK: ${data.champions.length} champions, ` +
    REQUIRED_CANONICAL_LANES.map((lane) => `${lane}=${laneCounts.get(lane) ?? 0}`).join(", "),
);

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch (error) {
    errors.push(`JSON parse failed: ${error.message}`);
    return null;
  }
}

function validateDocument(value) {
  if (!isObject(value)) {
    errors.push("Root value must be an object");
    return;
  }

  if (value.formatVersion !== 1) {
    errors.push("formatVersion must be 1");
  }

  for (const key of ["source", "patch", "region", "queue", "tier", "generatedAt"]) {
    if (key in value && !isNonEmptyString(value[key])) {
      errors.push(`${key} must be a non-empty string when present`);
    }
  }

  if (!Array.isArray(value.champions) || value.champions.length === 0) {
    errors.push("champions must be a non-empty array");
    return;
  }

  const seen = new Set();
  const lanes = new Set();

  value.champions.forEach((entry, index) => {
    validateChampion(entry, index, seen, lanes);
  });

  for (const lane of REQUIRED_CANONICAL_LANES) {
    if (!lanes.has(lane)) {
      errors.push(`champions must include at least one ${lane} entry`);
    }
  }
}

function validateChampion(entry, index, seen, lanes) {
  const prefix = `champions[${index}]`;

  if (!isObject(entry)) {
    errors.push(`${prefix} must be an object`);
    return;
  }

  if (!Number.isInteger(entry.championId) || entry.championId <= 0) {
    errors.push(`${prefix}.championId must be a positive integer`);
  }

  if (!isNonEmptyString(entry.championName)) {
    errors.push(`${prefix}.championName must be a non-empty string`);
  }

  if ("championAlias" in entry && !isNonEmptyString(entry.championAlias)) {
    errors.push(`${prefix}.championAlias must be a non-empty string when present`);
  }

  const lane = isNonEmptyString(entry.lane) ? VALID_LANES.get(entry.lane.trim().toLowerCase()) : null;
  if (!lane) {
    errors.push(`${prefix}.lane is invalid`);
  } else {
    lanes.add(lane);
  }

  const duplicateKey = `${entry.championId}:${lane ?? entry.lane}`;
  if (seen.has(duplicateKey)) {
    errors.push(`${prefix} duplicates championId/lane ${duplicateKey}`);
  }
  seen.add(duplicateKey);

  for (const key of ["games", "wins", "picks", "bans"]) {
    if (key in entry && (!Number.isInteger(entry[key]) || entry[key] < 0)) {
      errors.push(`${prefix}.${key} must be a non-negative integer`);
    }
  }

  if (Number.isInteger(entry.games) && Number.isInteger(entry.wins) && entry.wins > entry.games) {
    errors.push(`${prefix}.wins must not exceed games`);
  }

  for (const key of ["winRate", "pickRate", "banRate"]) {
    if (!isRate(entry[key])) {
      errors.push(`${prefix}.${key} must be a finite number from 0 to 100`);
    }
  }

  if ("overallScore" in entry && !isRate(entry.overallScore)) {
    errors.push(`${prefix}.overallScore must be a finite number from 0 to 100 when present`);
  }
}

function countLanes(champions) {
  const counts = new Map();
  for (const champion of champions) {
    const lane = isNonEmptyString(champion.lane) ? VALID_LANES.get(champion.lane.trim().toLowerCase()) : null;
    if (lane) {
      counts.set(lane, (counts.get(lane) ?? 0) + 1);
    }
  }
  return counts;
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isRate(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}
