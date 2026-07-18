import { CONFIG } from "./config.js";
import { clamp } from "./math.js";

export const RELATION = Object.freeze({
  PREY: "prey",
  NEUTRAL: "neutral",
  THREAT: "threat",
});

/** Exact 0.82 boundary is edible. Invalid or inactive entities are not. */
export function canEat(predator, prey) {
  const predatorMass = readMass(predator);
  const preyMass = readMass(prey);
  if (!isValidMass(predatorMass) || !isValidMass(preyMass)) return false;
  if (!isActive(predator) || !isEdible(prey)) return false;
  return preyMass <= predatorMass * CONFIG.mass.edibleRatio;
}

/** Relation of other to observer, including the intentional neutral band. */
export function getRelation(observer, other) {
  if (canEat(observer, other)) return RELATION.PREY;
  if (canEat(other, observer)) return RELATION.THREAT;
  return RELATION.NEUTRAL;
}

/** Returns an immutable tier descriptor. Mass below T1 remains in T1. */
export function getTier(entityOrMass) {
  const mass = readMass(entityOrMass);
  let result = CONFIG.tiers[0];
  if (!Number.isFinite(mass)) return result;
  for (const tier of CONFIG.tiers) {
    if (mass < tier.threshold) break;
    result = tier;
  }
  return result;
}

export function getVisualRadius(entityOrMass) {
  const mass = Math.max(0, finiteMass(entityOrMass, CONFIG.mass.start));
  return CONFIG.mass.baseRadius
    * Math.pow(mass / CONFIG.mass.start, CONFIG.mass.radiusExponent);
}

export function getMoveSpeed(entityOrMass) {
  const mass = Math.max(Number.EPSILON, finiteMass(entityOrMass, CONFIG.mass.start));
  const scale = Math.pow(mass / CONFIG.mass.start, CONFIG.movement.speedMassExponent);
  return CONFIG.movement.baseSpeed * clamp(
    scale,
    CONFIG.movement.minSpeedScale,
    CONFIG.movement.maxSpeedScale,
  );
}

export function getMassGain(prey, nutrition = undefined) {
  const preyMass = readMass(prey);
  if (!isValidMass(preyMass)) return 0;
  const nutritionValue = finitePositive(
    nutrition ?? prey?.nutrition ?? prey?.speciesNutrition,
    1,
  );
  return preyMass * CONFIG.mass.gainFactor * nutritionValue;
}

/** Risk reward rises linearly from easy-prey ratio 0.25 to the edible limit. */
export function getRiskMultiplier(predator, prey) {
  const predatorMass = readMass(predator);
  const preyMass = readMass(prey);
  if (!isValidMass(predatorMass) || !isValidMass(preyMass)) {
    return CONFIG.scoring.minRiskMultiplier;
  }
  const ratio = preyMass / predatorMass;
  const riskProgress = clamp(
    (ratio - CONFIG.director.massRanges.easyPrey[0])
      / (CONFIG.mass.edibleRatio - CONFIG.director.massRanges.easyPrey[0]),
    0,
    1,
  );
  return CONFIG.scoring.minRiskMultiplier
    + riskProgress
      * (CONFIG.scoring.maxRiskMultiplier - CONFIG.scoring.minRiskMultiplier);
}

/**
 * Final integer score for an eat event. Options can override comboMultiplier
 * and speciesScore without coupling score to growth.
 */
export function getEatScore(predator, prey, options = {}) {
  const preyMass = readMass(prey);
  if (!isValidMass(preyMass)) return 0;
  if (typeof options === "number") options = { comboMultiplier: options };

  const comboMultiplier = finitePositive(options.comboMultiplier, 1);
  const speciesScore = finitePositive(
    options.speciesScore ?? prey?.speciesScore ?? prey?.scoreMultiplier,
    CONFIG.scoring.defaultSpeciesScore,
  );
  const baseScore = Math.round(
    preyMass * speciesScore * CONFIG.scoring.pointsPerMass,
  );
  return Math.round(
    baseScore * comboMultiplier * getRiskMultiplier(predator, prey),
  );
}

export function createComboState() {
  return { count: 0, multiplier: 1, timeRemaining: 0 };
}

/**
 * Advances an immutable combo state. event is { ate, preyRatio }; for
 * convenience a boolean may be supplied as the third argument.
 */
export function updateCombo(state, dt, event = {}) {
  const previous = normalizeComboState(state);
  const elapsed = Math.max(0, Number.isFinite(dt) ? dt : 0);
  let count = previous.count;
  let timeRemaining = Math.max(0, previous.timeRemaining - elapsed);

  if (timeRemaining <= 0) count = 0;

  const normalizedEvent = typeof event === "boolean" ? { ate: event } : event;
  if (normalizedEvent?.ate) {
    count = count > 0 ? count + 1 : 1;
    const preyRatio = Number.isFinite(normalizedEvent.preyRatio)
      ? normalizedEvent.preyRatio
      : 0;
    timeRemaining = CONFIG.combo.windowSeconds
      + (preyRatio >= CONFIG.combo.edgePreyRatio
        ? CONFIG.combo.edgePreyBonusSeconds
        : 0);
  }

  const multiplier = count > 0
    ? Math.min(
      CONFIG.combo.maxMultiplier,
      1 + (count - 1) * CONFIG.combo.multiplierPerExtraEat,
    )
    : 1;

  return { count, multiplier, timeRemaining };
}

function normalizeComboState(state) {
  return {
    count: Math.max(0, Math.floor(Number.isFinite(state?.count) ? state.count : 0)),
    multiplier: finitePositive(state?.multiplier, 1),
    timeRemaining: Math.max(
      0,
      Number.isFinite(state?.timeRemaining) ? state.timeRemaining : 0,
    ),
  };
}

function readMass(value) {
  return typeof value === "number" ? value : value?.mass;
}

function finiteMass(value, fallback) {
  const mass = readMass(value);
  return Number.isFinite(mass) ? mass : fallback;
}

function isValidMass(value) {
  return Number.isFinite(value) && value > 0;
}

function finitePositive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function isActive(value) {
  if (!value || typeof value === "number") return true;
  return value.alive !== false
    && value.active !== false
    && value.interactive !== false;
}

function isEdible(value) {
  if (!isActive(value) || !value || typeof value === "number") return isActive(value);
  return value.invulnerable !== true
    && value.spawnProtected !== true
    && !(Number.isFinite(value.spawnGrace) && value.spawnGrace > 0);
}
