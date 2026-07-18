import { CONFIG } from "../js/config.js";
import {
  getBaitSchoolTuning,
  getMaxChasers,
  getPredatorRatioRange,
  getRelationWeights,
  getSovereignHazardTuning,
  isSovereignTier,
} from "../js/difficulty.js";
import { Director } from "../js/director.js";
import { RELATION, getRelation } from "../js/rules.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

const near = (actual, expected, tolerance = 1e-9) => {
  assert(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

function createTierSixGame() {
  return {
    player: { x: 3200, y: 1900, mass: 110, displayMass: 110, tier: 6 },
    camera: {
      viewportWidth: 1280,
      isWorldPointVisible: () => false,
      getVisibleWorldBounds: () => ({ left: 2500, right: 3900, top: 1450, bottom: 2350 }),
    },
    fish: [],
    specials: [],
    elapsed: 120,
    dayNight: { nightStrength: 0 },
  };
}

export const tests = [
  {
    name: "difficulty weights grow threats monotonically from T1 through T5",
    run() {
      const tiers = [1, 2, 3, 4, 5].map(getRelationWeights);
      for (const weights of tiers) {
        near(Object.values(weights).reduce((sum, value) => sum + value, 0), 1);
        assert(weights.prey >= CONFIG.difficulty.preyWeightFloor);
        assert(weights.fringe >= CONFIG.difficulty.fringeWeightFloor);
      }
      for (let index = 1; index < tiers.length; index += 1) {
        assert(tiers[index].predator > tiers[index - 1].predator);
        assert(tiers[index].prey < tiers[index - 1].prey);
      }
      near(tiers[0].predator, 0.1);
      near(tiers[4].predator, 0.3);
    },
  },
  {
    name: "T6 sovereign ecology cannot generate a fish that can eat the player",
    run() {
      const weights = getRelationWeights(6);
      assert(isSovereignTier(6));
      assert(weights.predator === 0);
      const director = new Director(CONFIG.world, 1);
      const game = createTierSixGame();
      for (let index = 0; index < 80; index += 1) {
        const fish = director.makeFish(game, "predator", false);
        assert(fish && getRelation(game.player, fish) !== RELATION.THREAT);
      }
    },
  },
  {
    name: "later tiers thin bait schools and smoothly raise predator size",
    run() {
      const early = getBaitSchoolTuning(1);
      const late = getBaitSchoolTuning(5);
      const sovereign = getBaitSchoolTuning(6);
      assert(late.intervalScale > early.intervalScale);
      assert(late.sizeScale < early.sizeScale);
      assert(sovereign.intervalScale >= late.intervalScale);
      assert(sovereign.sizeScale <= late.sizeScale);
      assert(getPredatorRatioRange(5)[1] > getPredatorRatioRange(1)[1]);
      assert(getMaxChasers(5) >= getMaxChasers(1));
    },
  },
  {
    name: "sovereign net pressure ramps without crossing survivable bounds",
    run() {
      const start = getSovereignHazardTuning(0);
      const middle = getSovereignHazardTuning(120);
      const late = getSovereignHazardTuning(9999);
      assert(start.netIntervalSeconds > middle.netIntervalSeconds);
      assert(middle.netIntervalSeconds > late.netIntervalSeconds);
      assert(late.netIntervalSeconds === CONFIG.difficulty.sovereignHazards.netIntervalMinSeconds);
      assert(start.maxActiveNets <= middle.maxActiveNets);
      assert(middle.maxActiveNets <= late.maxActiveNets);
      assert(late.maxActiveNets === CONFIG.difficulty.sovereignHazards.maxActiveNetsEnd);
    },
  },
  {
    name: "sovereign mode has no completion countdown",
    run() {
      assert(!Object.hasOwn(CONFIG.hazards, "apexDurationSeconds"));
      assert(!Object.hasOwn(CONFIG.difficulty.sovereignHazards, "durationSeconds"));
      assert(getSovereignHazardTuning(3600).netIntervalSeconds > 0);
    },
  },
];
