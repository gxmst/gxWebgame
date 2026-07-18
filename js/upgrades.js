import { clamp } from "./math.js";
import { CONFIG } from "./config.js";

export const UPGRADE_TYPES = Object.freeze({
  SPEED: "speed",
  STAMINA: "stamina",
  MOUTH: "mouth",
});

export const MAX_UPGRADE_LEVEL = 5;

export const COIN_RULES = Object.freeze({
  scorePerCoin: 100,
  victoryBonus: 25,
});

export const UPGRADE_DEFINITIONS = Object.freeze({
  [UPGRADE_TYPES.SPEED]: Object.freeze({
    costs: Object.freeze([20, 35, 55, 80, 115]),
    multiplierPerLevel: 0.04,
  }),
  [UPGRADE_TYPES.STAMINA]: Object.freeze({
    costs: Object.freeze([18, 32, 50, 72, 100]),
    bonusPerLevel: 10,
    recoveryPerLevel: 0.04,
  }),
  [UPGRADE_TYPES.MOUTH]: Object.freeze({
    costs: Object.freeze([25, 42, 65, 92, 125]),
    multiplierPerLevel: 0.035,
  }),
});

export function createDefaultUpgradeState(coins = 0) {
  return {
    coins: nonNegativeInteger(coins),
    levels: {
      [UPGRADE_TYPES.SPEED]: 0,
      [UPGRADE_TYPES.STAMINA]: 0,
      [UPGRADE_TYPES.MOUTH]: 0,
    },
  };
}

/** Converts score and victory status into whole coins earned for one run. */
export function getCoinsForResult(resultOrScore = 0, victory = false) {
  const result = typeof resultOrScore === "object" && resultOrScore !== null
    ? resultOrScore
    : { score: resultOrScore, victory };
  const score = nonNegativeInteger(result.score);
  const won = result.victory === true || result.won === true;
  return Math.floor(score / COIN_RULES.scorePerCoin)
    + (won ? COIN_RULES.victoryBonus : 0);
}

export function normalizeUpgradeState(state) {
  const source = state && typeof state === "object" ? state : {};
  const levels = source.levels && typeof source.levels === "object"
    ? source.levels
    : source;
  return {
    coins: nonNegativeInteger(source.coins),
    levels: {
      [UPGRADE_TYPES.SPEED]: normalizeLevel(levels[UPGRADE_TYPES.SPEED]),
      [UPGRADE_TYPES.STAMINA]: normalizeLevel(levels[UPGRADE_TYPES.STAMINA]),
      [UPGRADE_TYPES.MOUTH]: normalizeLevel(levels[UPGRADE_TYPES.MOUTH]),
    },
  };
}

export function getUpgradeLevel(state, type) {
  assertUpgradeType(type);
  return normalizeUpgradeState(state).levels[type];
}

/** Returns null when the upgrade is already at the maximum level. */
export function getNextUpgradePrice(state, type) {
  const level = getUpgradeLevel(state, type);
  return level >= MAX_UPGRADE_LEVEL
    ? null
    : UPGRADE_DEFINITIONS[type].costs[level];
}

/**
 * Attempts an immutable purchase. No storage is read or written.
 * Result is { success, reason, state, spent, level, nextPrice }.
 */
export function purchaseUpgrade(state, type) {
  assertUpgradeType(type);
  const current = normalizeUpgradeState(state);
  const level = current.levels[type];
  const price = getNextUpgradePrice(current, type);

  if (price === null) {
    return purchaseResult(false, "max-level", current, type, 0);
  }
  if (current.coins < price) {
    return purchaseResult(false, "insufficient-coins", current, type, 0);
  }

  const next = {
    coins: current.coins - price,
    levels: { ...current.levels, [type]: level + 1 },
  };
  return purchaseResult(true, null, next, type, price);
}

export function getSpeedMultiplier(stateOrLevel) {
  const level = readEffectLevel(stateOrLevel, UPGRADE_TYPES.SPEED);
  return 1 + level * UPGRADE_DEFINITIONS.speed.multiplierPerLevel;
}

export function getStaminaBonus(stateOrLevel) {
  const level = readEffectLevel(stateOrLevel, UPGRADE_TYPES.STAMINA);
  return level * UPGRADE_DEFINITIONS.stamina.bonusPerLevel;
}

export function getStaminaRecoveryMultiplier(stateOrLevel) {
  const level = readEffectLevel(stateOrLevel, UPGRADE_TYPES.STAMINA);
  return 1 + level * UPGRADE_DEFINITIONS.stamina.recoveryPerLevel;
}

export function getMouthMultiplier(stateOrLevel) {
  const level = readEffectLevel(stateOrLevel, UPGRADE_TYPES.MOUTH);
  return 1 + level * UPGRADE_DEFINITIONS.mouth.multiplierPerLevel;
}

export function getUpgradeEffects(state, accessory = "none") {
  const base = CONFIG.cosmeticBonus[accessory] || CONFIG.cosmeticBonus.none;
  return {
    speedMultiplier: getSpeedMultiplier(state) * (1 + base.speedPercent),
    staminaBonus: getStaminaBonus(state) + CONFIG.dash.maxStamina * base.staminaPercent,
    staminaRecoveryMultiplier: getStaminaRecoveryMultiplier(state) * (1 + base.staminaRecoveryPercent),
    mouthMultiplier: getMouthMultiplier(state) * (1 + base.mouthPercent),
    accessory,
  };
}

function purchaseResult(success, reason, state, type, spent) {
  return {
    success,
    reason,
    state,
    spent,
    level: state.levels[type],
    nextPrice: getNextUpgradePrice(state, type),
  };
}

function readEffectLevel(stateOrLevel, type) {
  return typeof stateOrLevel === "number"
    ? normalizeLevel(stateOrLevel)
    : getUpgradeLevel(stateOrLevel, type);
}

function normalizeLevel(value) {
  const integer = Number.isFinite(value) ? Math.floor(value) : 0;
  return clamp(integer, 0, MAX_UPGRADE_LEVEL);
}

function nonNegativeInteger(value) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function assertUpgradeType(type) {
  if (!Object.hasOwn(UPGRADE_DEFINITIONS, type)) {
    throw new RangeError(`Unknown upgrade type: ${String(type)}`);
  }
}
