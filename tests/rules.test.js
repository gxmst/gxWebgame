import { CONFIG } from "../js/config.js";
import {
  RELATION,
  canEat,
  createComboState,
  getEatScore,
  getMassGain,
  getMoveSpeed,
  getRelation,
  getTier,
  getVisualRadius,
  updateCombo,
} from "../js/rules.js";
import { circlesIntersect, createSeededRng } from "../js/math.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};
const near = (actual, expected, tolerance = 1e-9) => {
  assert(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

export const tests = [
  {
    name: "0.82 edible boundary is exact and inclusive",
    run() {
      assert(canEat(100, 82));
      assert(!canEat(100, 82.000001));
      assert(!canEat({ mass: 100 }, { mass: 70, spawnProtected: true }));
      assert(!canEat({ mass: 100 }, { mass: 70, spawnGrace: 0.1 }));
    },
  },
  {
    name: "relation includes a two-sided neutral band",
    run() {
      assert(getRelation(100, 60) === RELATION.PREY);
      assert(getRelation(100, 100) === RELATION.NEUTRAL);
      assert(getRelation(100, 123) === RELATION.THREAT);
      assert(getRelation(
        { mass: 100, displayMass: 10 },
        { mass: 70, displayMass: 200 },
      ) === RELATION.PREY, "logical mass must be authoritative");
    },
  },
  {
    name: "tier boundaries and mass-derived values remain coherent",
    run() {
      assert(getTier(15.999).id === "T1");
      assert(getTier(16).id === "T2");
      assert(getTier(110).id === "T6");
      near(getVisualRadius(CONFIG.mass.start), CONFIG.mass.baseRadius);
      near(getMassGain({ mass: 10 }, 1.35), 2.97);
      assert(getMoveSpeed(10) === CONFIG.movement.baseSpeed);
      assert(getMoveSpeed(100000) >= CONFIG.movement.baseSpeed * 0.82);
    },
  },
  {
    name: "circle contact includes tangency but not a gap",
    run() {
      assert(circlesIntersect({ x: 0, y: 0, radius: 4 }, { x: 7, y: 0, radius: 3 }));
      assert(!circlesIntersect(0, 0, 4, 7.001, 0, 3));
    },
  },
  {
    name: "combo refreshes, expires, and caps multiplier",
    run() {
      let combo = createComboState();
      combo = updateCombo(combo, 0, { ate: true });
      assert(combo.count === 1 && combo.multiplier === 1);
      for (let index = 0; index < 30; index += 1) {
        combo = updateCombo(combo, 0.05, { ate: true, preyRatio: 0.7 });
      }
      assert(combo.multiplier === CONFIG.combo.maxMultiplier);
      assert(combo.timeRemaining > CONFIG.combo.windowSeconds);
      combo = updateCombo(combo, 10);
      assert(combo.count === 0 && combo.multiplier === 1);
    },
  },
  {
    name: "score rewards risky prey without changing mass gain",
    run() {
      const safe = getEatScore(100, 25);
      const risky = getEatScore(100, 82);
      assert(risky > safe);
      assert(getEatScore(100, 25, { environmentMultiplier: 1.15 }) > safe);
      near(getMassGain(20), 4.4);
    },
  },
  {
    name: "seeded RNG sequences are reproducible",
    run() {
      const first = createSeededRng("reef-17");
      const second = createSeededRng("reef-17");
      const a = Array.from({ length: 8 }, () => first());
      const b = Array.from({ length: 8 }, () => second());
      assert(JSON.stringify(a) === JSON.stringify(b));
      assert(a.every((value) => value >= 0 && value < 1));
    },
  },
];
