import { CONFIG } from "./config.js";
import { clamp } from "./math.js";

export function isSovereignTier(tier) {
  return normalizeTier(tier) >= CONFIG.tiers.length;
}

export function getDifficultyProgress(tier) {
  const current = normalizeTier(tier);
  const start = CONFIG.difficulty.curveStartTier;
  const end = Math.max(start + 1, CONFIG.difficulty.curveEndTier);
  return clamp((current - start) / (end - start), 0, 1);
}

export function getRelationWeights(tier) {
  const source = isSovereignTier(tier)
    ? CONFIG.difficulty.relationWeights.sovereign
    : interpolateWeights(
      CONFIG.difficulty.relationWeights.tier1,
      CONFIG.difficulty.relationWeights.tier5,
      getDifficultyProgress(tier),
    );
  const weights = {
    prey: Math.max(CONFIG.difficulty.preyWeightFloor, source.prey),
    fringe: Math.max(CONFIG.difficulty.fringeWeightFloor, source.fringe),
    neutral: Math.max(0, source.neutral),
    predator: isSovereignTier(tier) ? 0 : Math.max(0, source.predator),
  };
  return normalizeWeights(weights);
}

export function getRelationWeightEntries(tier) {
  return Object.entries(getRelationWeights(tier));
}

export function getPredatorRatioRange(tier) {
  const progress = getDifficultyProgress(tier);
  return [
    CONFIG.difficulty.predatorRatioMin,
    lerp(
      CONFIG.difficulty.predatorRatioMaxTier1,
      CONFIG.difficulty.predatorRatioMaxTier5,
      progress,
    ),
  ];
}

export function getMaxChasers(tier) {
  const values = CONFIG.difficulty.maxChasersByTier;
  const index = clamp(normalizeTier(tier) - 1, 0, values.length - 1);
  return Math.max(0, Math.floor(values[index] ?? 0));
}

export function getBaitSchoolTuning(tier) {
  const settings = CONFIG.difficulty.baitSchool;
  if (isSovereignTier(tier)) {
    return {
      intervalScale: settings.sovereignIntervalScale,
      sizeScale: settings.sovereignSizeScale,
    };
  }
  const progress = getDifficultyProgress(tier);
  return {
    intervalScale: lerp(settings.tier1IntervalScale, settings.tier5IntervalScale, progress),
    sizeScale: lerp(settings.tier1SizeScale, settings.tier5SizeScale, progress),
  };
}

export function getSovereignHazardTuning(elapsedSeconds) {
  const settings = CONFIG.difficulty.sovereignHazards;
  const elapsed = Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0);
  const intervalProgress = clamp(elapsed / Math.max(1, settings.netIntervalRampSeconds), 0, 1);
  const countProgress = clamp(elapsed / Math.max(1, settings.maxActiveNetsRampSeconds), 0, 1);
  return {
    netIntervalSeconds: lerp(
      settings.netIntervalStartSeconds,
      settings.netIntervalMinSeconds,
      intervalProgress,
    ),
    maxActiveNets: Math.floor(lerp(
      settings.maxActiveNetsStart,
      settings.maxActiveNetsEnd,
      countProgress,
    )),
  };
}

function interpolateWeights(start, end, progress) {
  return Object.fromEntries(
    Object.keys(start).map((key) => [key, lerp(start[key], end[key], progress)]),
  );
}

function normalizeWeights(weights) {
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  if (total <= 0) return { prey: 1, fringe: 0, neutral: 0, predator: 0 };
  return Object.fromEntries(
    Object.entries(weights).map(([key, value]) => [key, value / total]),
  );
}

function normalizeTier(value) {
  const number = Number.isFinite(value) ? Math.floor(value) : 1;
  return clamp(number, 1, CONFIG.tiers.length);
}

function lerp(start, end, progress) {
  return start + (end - start) * progress;
}
