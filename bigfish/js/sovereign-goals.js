import { CONFIG } from "./config.js";

export const SOVEREIGN_GOAL_STATE_VERSION = 1;
export const SOVEREIGN_GOAL_METRICS = Object.freeze([
  "elapsed",
  "eaten",
  "score",
  "netsDodged",
]);

const ZERO_METRICS = Object.freeze({
  elapsed: 0,
  eaten: 0,
  score: 0,
  netsDodged: 0,
});

export function createSovereignGoalState(settings = CONFIG.sovereignGoals) {
  return {
    version: SOVEREIGN_GOAL_STATE_VERSION,
    stage: 1,
    completedStages: 0,
    canExtract: false,
    extracted: false,
    stats: { ...ZERO_METRICS },
    baseline: { ...ZERO_METRICS },
    target: getSovereignGoalTarget(1, settings),
    lastCompletedStage: null,
  };
}

export function normalizeSovereignGoalState(state, settings = CONFIG.sovereignGoals) {
  if (!isRecord(state)) return createSovereignGoalState(settings);
  const stage = positiveInteger(state.stage, 1);
  const completedStages = stage - 1;
  const stats = normalizeMetrics(state.stats);
  const baseline = normalizeMetrics(state.baseline, stats);
  const extracted = state.extracted === true;
  const extractedAt = extracted
    ? normalizeMetrics(state.extractedAt ?? stats, stats)
    : null;

  const normalized = {
    version: SOVEREIGN_GOAL_STATE_VERSION,
    stage,
    completedStages,
    canExtract: !extracted && completedStages >= getExtractStageRequirement(settings),
    extracted,
    stats,
    baseline,
    target: getSovereignGoalTarget(stage, settings),
    lastCompletedStage: validCompletedStage(state.lastCompletedStage, completedStages),
  };
  if (extractedAt) normalized.extractedAt = extractedAt;
  return normalized;
}

export function getSovereignGoalTarget(stage, settings = CONFIG.sovereignGoals) {
  const index = positiveInteger(stage, 1) - 1;
  const base = normalizeMetrics(settings?.baseTargets);
  const growth = normalizeMetrics(settings?.targetGrowth);
  return Object.fromEntries(SOVEREIGN_GOAL_METRICS.map((key) => [
    key,
    Math.ceil(base[key] + growth[key] * index),
  ]));
}

export function getSovereignGoalProgress(state, settings = CONFIG.sovereignGoals) {
  const current = normalizeSovereignGoalState(state, settings);
  const values = Object.fromEntries(SOVEREIGN_GOAL_METRICS.map((key) => [
    key,
    Math.max(0, current.stats[key] - current.baseline[key]),
  ]));
  const ratios = Object.fromEntries(SOVEREIGN_GOAL_METRICS.map((key) => [
    key,
    current.target[key] <= 0 ? 1 : Math.min(1, values[key] / current.target[key]),
  ]));
  return {
    values,
    target: { ...current.target },
    ratios,
    overallRatio: Math.min(...Object.values(ratios)),
    complete: SOVEREIGN_GOAL_METRICS.every((key) => values[key] >= current.target[key]),
  };
}

/**
 * Updates a contract from cumulative sovereign-run totals. Values are
 * monotonic, so stale frames and repeated event delivery cannot undo progress.
 */
export function updateSovereignGoal(state, metrics, settings = CONFIG.sovereignGoals) {
  const current = normalizeSovereignGoalState(state, settings);
  if (current.extracted) return updateResult(current, false, null, settings);

  const stats = mergeCumulativeMetrics(current.stats, metrics);
  const candidate = { ...current, stats };
  const progress = getSovereignGoalProgress(candidate, settings);
  if (!progress.complete) return updateResult(candidate, false, null, settings);

  const completedStage = current.stage;
  const nextStage = completedStage + 1;
  const next = {
    ...candidate,
    stage: nextStage,
    completedStages: nextStage - 1,
    canExtract: nextStage - 1 >= getExtractStageRequirement(settings),
    baseline: { ...stats },
    target: getSovereignGoalTarget(nextStage, settings),
    lastCompletedStage: completedStage,
  };
  return updateResult(next, true, completedStage, settings);
}

export function tryExtractSovereignGoal(state, settings = CONFIG.sovereignGoals) {
  const current = normalizeSovereignGoalState(state, settings);
  if (current.extracted) {
    return { success: false, reason: "already-extracted", state: current };
  }
  if (!current.canExtract) {
    return { success: false, reason: "not-eligible", state: current };
  }

  return {
    success: true,
    reason: null,
    state: {
      ...current,
      canExtract: false,
      extracted: true,
      extractedAt: { ...current.stats },
    },
  };
}

export function serializeSovereignGoalState(state, settings = CONFIG.sovereignGoals) {
  return JSON.stringify(normalizeSovereignGoalState(state, settings));
}

export function deserializeSovereignGoalState(serialized, settings = CONFIG.sovereignGoals) {
  try {
    return normalizeSovereignGoalState(JSON.parse(serialized), settings);
  } catch {
    return createSovereignGoalState(settings);
  }
}

function updateResult(state, completed, completedStage, settings) {
  return {
    state,
    completed,
    completedStage,
    canExtract: state.canExtract,
    progress: getSovereignGoalProgress(state, settings),
  };
}

function mergeCumulativeMetrics(current, update) {
  const source = isRecord(update) ? update : {};
  return Object.fromEntries(SOVEREIGN_GOAL_METRICS.map((key) => {
    const alias = key === "elapsed" ? source.elapsedSeconds : undefined;
    const value = Number.isFinite(source[key]) ? source[key] : alias;
    return [key, Number.isFinite(value) ? Math.max(current[key], Math.max(0, value)) : current[key]];
  }));
}

function normalizeMetrics(source, ceiling = null) {
  const record = isRecord(source) ? source : {};
  return Object.fromEntries(SOVEREIGN_GOAL_METRICS.map((key) => {
    const alias = key === "elapsed" ? record.elapsedSeconds : undefined;
    const value = Number.isFinite(record[key]) ? record[key] : alias;
    const normalized = Number.isFinite(value) ? Math.max(0, value) : 0;
    return [key, ceiling ? Math.min(normalized, ceiling[key]) : normalized];
  }));
}

function getExtractStageRequirement(settings) {
  return positiveInteger(settings?.extractAfterStages, 1);
}

function validCompletedStage(value, completedStages) {
  if (!Number.isFinite(value)) return null;
  const stage = Math.floor(value);
  return stage >= 1 && stage <= completedStages ? stage : null;
}

function positiveInteger(value, fallback) {
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : fallback;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
