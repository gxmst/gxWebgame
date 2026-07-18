import {
  COIN_RULES,
  MAX_UPGRADE_LEVEL,
  UPGRADE_DEFINITIONS,
  UPGRADE_TYPES,
  createDefaultUpgradeState,
  getCoinsForResult,
  getMouthMultiplier,
  getNextUpgradePrice,
  getSpeedMultiplier,
  getStaminaBonus,
  getStaminaRecoveryMultiplier,
  getUpgradeEffects,
  getUpgradeLevel,
  normalizeUpgradeState,
  purchaseUpgrade,
} from "../js/upgrades.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};
const near = (actual, expected, tolerance = 1e-9) => {
  assert(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

export const tests = [
  {
    name: "coins settle from score with a victory bonus",
    run() {
      assert(getCoinsForResult(99) === 0);
      assert(getCoinsForResult(250) === 2);
      assert(getCoinsForResult({ score: 250, victory: true }) === 2 + COIN_RULES.victoryBonus);
      assert(getCoinsForResult({ score: -100, won: true }) === COIN_RULES.victoryBonus);
    },
  },
  {
    name: "upgrade state is independent, sanitized, and capped",
    run() {
      const first = createDefaultUpgradeState(12);
      const second = createDefaultUpgradeState();
      first.levels.speed = 3;
      assert(second.levels.speed === 0);
      const normalized = normalizeUpgradeState({ coins: 4.9, levels: { speed: 99, stamina: -2, mouth: 2.8 } });
      assert(normalized.coins === 4);
      assert(normalized.levels.speed === MAX_UPGRADE_LEVEL);
      assert(normalized.levels.stamina === 0);
      assert(normalized.levels.mouth === 2);
    },
  },
  {
    name: "next prices increase and disappear at maximum level",
    run() {
      for (const type of Object.values(UPGRADE_TYPES)) {
        const costs = UPGRADE_DEFINITIONS[type].costs;
        assert(costs.length === MAX_UPGRADE_LEVEL);
        assert(costs.every((cost, index) => index === 0 || cost > costs[index - 1]));
        assert(getNextUpgradePrice(createDefaultUpgradeState(), type) === costs[0]);
        assert(getNextUpgradePrice({ levels: { [type]: MAX_UPGRADE_LEVEL } }, type) === null);
      }
    },
  },
  {
    name: "purchase is immutable and reports insufficient funds",
    run() {
      const original = createDefaultUpgradeState(10);
      const result = purchaseUpgrade(original, UPGRADE_TYPES.SPEED);
      assert(!result.success && result.reason === "insufficient-coins");
      assert(result.state !== original);
      assert(original.coins === 10 && original.levels.speed === 0);
      assert(result.state.coins === 10 && result.level === 0);
    },
  },
  {
    name: "successful purchases spend coins and advance one level",
    run() {
      const price = UPGRADE_DEFINITIONS.stamina.costs[0];
      const original = createDefaultUpgradeState(price + 7);
      const result = purchaseUpgrade(original, UPGRADE_TYPES.STAMINA);
      assert(result.success && result.reason === null);
      assert(result.spent === price && result.state.coins === 7);
      assert(result.level === 1 && getUpgradeLevel(result.state, UPGRADE_TYPES.STAMINA) === 1);
      assert(original.levels.stamina === 0, "input state must not be mutated");
    },
  },
  {
    name: "maximum-level purchases are rejected without charging coins",
    run() {
      const state = { coins: 9999, levels: { speed: MAX_UPGRADE_LEVEL } };
      const result = purchaseUpgrade(state, UPGRADE_TYPES.SPEED);
      assert(!result.success && result.reason === "max-level");
      assert(result.state.coins === 9999 && result.spent === 0);
      assert(result.nextPrice === null);
    },
  },
  {
    name: "speed, stamina, and mouth effects scale by level",
    run() {
      const state = { levels: { speed: 3, stamina: 4, mouth: 5 } };
      near(getSpeedMultiplier(state), 1.12);
      assert(getStaminaBonus(state) === 40);
      near(getStaminaRecoveryMultiplier(state), 1.16);
      near(getMouthMultiplier(state), 1.175);
      const effects = getUpgradeEffects(state);
      near(effects.speedMultiplier, 1.12);
      assert(effects.staminaBonus === 40);
      near(effects.staminaRecoveryMultiplier, 1.16);
      near(effects.mouthMultiplier, 1.175);
    },
  },
  {
    name: "unknown upgrade types fail explicitly",
    run() {
      let threw = false;
      try {
        getUpgradeLevel(createDefaultUpgradeState(), "armor");
      } catch (error) {
        threw = error instanceof RangeError;
      }
      assert(threw);
    },
  },
];
