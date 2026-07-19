export const TELEMETRY_VERSION = 1;
export const TELEMETRY_STORAGE_KEY = "bigfish.telemetry.v1";
export const TELEMETRY_MAX_RUNS = 50;

/** Sanitizes one completed-run record into the local telemetry schema. */
export function sanitizeTelemetryEntry(candidate = {}) {
  const source = isRecord(candidate) ? candidate : {};
  const sovereignDuration = nonNegativeNumber(
    source.sovereignDuration ?? source.sovereignSeconds ?? source.sovereignDurationSeconds,
  );

  return {
    seed: sanitizeSeed(source.seed),
    recordedAt: limitedString(source.recordedAt ?? source.date, 40),
    score: nonNegativeInteger(source.score),
    reachedTier: limitedString(source.reachedTier ?? source.tier, 16),
    tierTimes: sanitizeTierTimes(source.tierTimes),
    deathReason: limitedString(source.deathReason, 120),
    extracted: source.extracted === true,
    duration: nonNegativeNumber(
      source.duration ?? source.durationSeconds ?? secondsFromMs(source.durationMs),
    ),
    sovereign: source.sovereign === true || source.sovereignReached === true
      || sovereignDuration > 0,
    sovereignDuration,
    sovereignReachedAt: nullableNonNegativeNumber(source.sovereignReachedAt),
    eaten: nonNegativeInteger(source.eaten ?? source.fishEaten),
    edgeEaten: nonNegativeInteger(source.edgeEaten ?? source.riskyEaten),
    noPrey: nonNegativeNumber(
      source.noPrey ?? source.noPreySeconds ?? source.longestNoPrey,
    ),
    netCaptured: nonNegativeInteger(
      source.netCaptured ?? source.netFishCaught ?? source.net?.captured,
    ),
    netReplenished: nonNegativeInteger(
      source.netReplenished ?? source.netFishReplenished ?? source.net?.replenished,
    ),
    netsDodged: nonNegativeInteger(source.netsDodged ?? source.net?.dodged),
    averageFps: positiveNumberOrZero(source.averageFps ?? source.fps?.average),
    minimumFps: positiveNumberOrZero(
      source.minimumFps ?? source.minFps ?? source.fps?.minimum,
    ),
    quality: sanitizeQuality(source.quality),
    biomeSeconds: sanitizeNumberMap(source.biomeSeconds, 32),
    buildChoices: sanitizeBuildChoices(source.buildChoices),
    contractStages: nonNegativeInteger(source.contractStages),
    viewport: sanitizeViewport(source.viewport),
  };
}

/** Keeps only the newest 50 valid-looking run records. */
export function sanitizeTelemetry(records, limit = TELEMETRY_MAX_RUNS) {
  if (!Array.isArray(records)) return [];
  const safeLimit = Math.max(0, Math.min(TELEMETRY_MAX_RUNS, nonNegativeInteger(limit)));
  if (safeLimit === 0) return [];
  return records
    .filter(isRecord)
    .slice(-safeLimit)
    .map(sanitizeTelemetryEntry);
}

/** Loads local telemetry. Missing, corrupt, or blocked storage returns []. */
export function loadTelemetry(
  storage = getDefaultStorage(),
  key = TELEMETRY_STORAGE_KEY,
) {
  try {
    const serialized = storage?.getItem?.(key);
    if (!serialized) return [];
    const parsed = JSON.parse(serialized);
    return sanitizeTelemetry(Array.isArray(parsed) ? parsed : parsed?.records);
  } catch {
    return [];
  }
}

/** Saves sanitized local telemetry. It never throws or sends network requests. */
export function saveTelemetry(
  records,
  storage = getDefaultStorage(),
  key = TELEMETRY_STORAGE_KEY,
) {
  try {
    if (!storage?.setItem) return false;
    storage.setItem(key, JSON.stringify({
      version: TELEMETRY_VERSION,
      records: sanitizeTelemetry(records),
    }));
    return true;
  } catch {
    return false;
  }
}

/** Pure append helper; call saveTelemetry explicitly after updating the list. */
export function appendTelemetry(records, entry) {
  return sanitizeTelemetry([
    ...(Array.isArray(records) ? records : []),
    sanitizeTelemetryEntry(entry),
  ]);
}

/** Aggregates balance and performance signals without exposing raw storage. */
export function summarizeTelemetry(records) {
  const clean = sanitizeTelemetry(records);
  const runCount = clean.length;
  const sovereignRuns = clean.filter((entry) => entry.sovereign).length;
  const extractedRuns = clean.filter((entry) => entry.extracted).length;
  const deathReasons = {};
  const tierReached = {};

  for (const entry of clean) {
    if (entry.deathReason) {
      deathReasons[entry.deathReason] = (deathReasons[entry.deathReason] ?? 0) + 1;
    }
    for (const tier of Object.keys(entry.tierTimes)) {
      tierReached[tier] = (tierReached[tier] ?? 0) + 1;
    }
  }

  return {
    runCount,
    averageDuration: average(clean.map((entry) => entry.duration)),
    sovereignRuns,
    extractedRuns,
    sovereignRate: runCount > 0 ? sovereignRuns / runCount : 0,
    averageSovereignDuration: average(
      clean.filter((entry) => entry.sovereign).map((entry) => entry.sovereignDuration),
    ),
    averageNoPrey: average(clean.map((entry) => entry.noPrey)),
    averageEaten: average(clean.map((entry) => entry.eaten)),
    totalNetCaptured: sum(clean.map((entry) => entry.netCaptured)),
    totalNetReplenished: sum(clean.map((entry) => entry.netReplenished)),
    totalNetsDodged: sum(clean.map((entry) => entry.netsDodged)),
    averageFps: average(clean.map((entry) => entry.averageFps).filter((fps) => fps > 0)),
    lowestFps: minimum(clean.map((entry) => entry.minimumFps).filter((fps) => fps > 0)),
    deathReasons: sortCountMap(deathReasons),
    tierReached: sortCountMap(tierReached),
  };
}

function sanitizeQuality(value) {
  const source = isRecord(value) ? value : { final: value };
  return {
    selected: limitedString(source.selected ?? source.mode, 24),
    final: limitedString(source.final ?? source.mode, 40),
    changes: nonNegativeInteger(source.changes),
  };
}

function sanitizeNumberMap(value, maxEntries) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, amount]) => /^[A-Za-z0-9_-]{1,32}$/.test(key)
        && Number.isFinite(amount) && amount >= 0)
      .slice(0, maxEntries)
      .map(([key, amount]) => [key, nonNegativeNumber(amount)]),
  );
}

function sanitizeBuildChoices(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).filter(isRecord).map((choice) => ({
    tier: limitedString(choice.tier, 16),
    id: limitedString(choice.id, 64),
    time: nonNegativeNumber(choice.time),
  })).filter((choice) => choice.tier && choice.id);
}

/** Produces a portable JSON string; exporting remains an entirely local action. */
export function exportTelemetry(records) {
  const clean = sanitizeTelemetry(records);
  return JSON.stringify({
    version: TELEMETRY_VERSION,
    summary: summarizeTelemetry(clean),
    records: clean,
  }, null, 2);
}

function sanitizeTierTimes(value) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([tier, seconds]) => /^[A-Za-z0-9_-]{1,16}$/.test(tier)
        && Number.isFinite(seconds) && seconds >= 0)
      .map(([tier, seconds]) => [tier, nonNegativeNumber(seconds)])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function sanitizeViewport(value) {
  const source = isRecord(value) ? value : {};
  return {
    width: nonNegativeInteger(source.width),
    height: nonNegativeInteger(source.height),
    dpr: positiveNumberOrZero(source.dpr),
  };
}

function sanitizeSeed(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return limitedString(value, 128);
}

function getDefaultStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function limitedString(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function nonNegativeNumber(value) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function nullableNonNegativeNumber(value) {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function positiveNumberOrZero(value) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function nonNegativeInteger(value) {
  return Math.floor(nonNegativeNumber(value));
}

function secondsFromMs(value) {
  return Number.isFinite(value) ? value / 1000 : undefined;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function average(values) {
  return values.length > 0 ? sum(values) / values.length : 0;
}

function minimum(values) {
  return values.length > 0 ? Math.min(...values) : 0;
}

function sortCountMap(counts) {
  return Object.fromEntries(
    Object.entries(counts).sort(([leftKey, leftCount], [rightKey, rightCount]) =>
      rightCount - leftCount || leftKey.localeCompare(rightKey)),
  );
}
