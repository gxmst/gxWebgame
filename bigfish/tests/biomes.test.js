import {
  applyBiomeSpawnMultipliers,
  getBiomeAtPosition,
  getBiomeAtY,
  getBiomeBlendAtY,
  getWrappedDepth,
  getWrappedYDelta,
  isYInBiome,
  isYWithinWrappedBand,
} from "../js/biomes.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

const near = (actual, expected, tolerance = 1e-8) => {
  assert(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

const tuning = {
  transitionDepth: 0.1,
  zones: [
    {
      id: "coral",
      name: "珊瑚浅海",
      maxDepth: 0.3,
      riskMultiplier: 0.8,
      rewardMultiplier: 0.9,
      spawnMultipliers: { prey: 1.2, predator: 0.7 },
    },
    {
      id: "current",
      name: "开阔洋流",
      maxDepth: 0.68,
      riskMultiplier: 1,
      rewardMultiplier: 1,
      spawnMultipliers: { prey: 1, predator: 1 },
    },
    {
      id: "abyss",
      name: "深海暗区",
      maxDepth: 1,
      riskMultiplier: 1.3,
      rewardMultiplier: 1.4,
      spawnMultipliers: { prey: 0.8, predator: 1.25 },
    },
  ],
};

function yForDepth(depth, height) {
  return Math.acos(1 - depth * 2) / (Math.PI * 2) * height;
}

export const tests = [
  {
    name: "wrapped biome depth is continuous and symmetric across the Y seam",
    run() {
      const height = 1000;
      near(getWrappedDepth(0, height), 0);
      near(getWrappedDepth(height, height), 0);
      near(getWrappedDepth(height / 2, height), 1);
      near(getWrappedDepth(3, height), getWrappedDepth(height - 3, height));
      near(getWrappedDepth(-3, height), getWrappedDepth(height - 3, height));
    },
  },
  {
    name: "three biomes resolve stably by wrapped world depth",
    run() {
      const height = 1000;
      assert(getBiomeAtY(0, height, tuning).id === "coral");
      assert(getBiomeAtY(height / 4, height, tuning).id === "current");
      assert(getBiomeAtY(height / 2, height, tuning).id === "abyss");
      assert(getBiomeAtY(height + height / 4, height, tuning).id === "current");
      assert(isYInBiome(-1, height, "coral", tuning));
      assert(getBiomeAtPosition({ y: 500 }, { height }, tuning).name === "深海暗区");
    },
  },
  {
    name: "risk reward and spawn modifiers blend smoothly at biome boundaries",
    run() {
      const height = 1000;
      const y = yForDepth(0.3, height);
      const blend = getBiomeBlendAtY(y, height, tuning);
      const biome = getBiomeAtY(y, height, tuning);
      assert(blend.entries.length === 2);
      near(blend.entries[0].weight, 0.5);
      near(blend.entries[1].weight, 0.5);
      near(biome.riskMultiplier, 0.9);
      near(biome.rewardMultiplier, 0.95);
      near(biome.spawnMultipliers.prey, 1.1);
      near(Object.values(biome.weights).reduce((sum, weight) => sum + weight, 0), 1);

      const before = getBiomeAtY(yForDepth(0.299, height), height, tuning);
      const after = getBiomeAtY(yForDepth(0.301, height), height, tuning);
      assert(Math.abs(before.riskMultiplier - after.riskMultiplier) < 0.02);
    },
  },
  {
    name: "wrapped band and delta helpers handle positions on opposite seam sides",
    run() {
      near(getWrappedYDelta(995, 5, 1000), 10);
      assert(isYWithinWrappedBand(995, 5, 12, 1000));
      assert(!isYWithinWrappedBand(950, 5, 12, 1000));
    },
  },
  {
    name: "biome spawn pressure renormalizes relation weights without changing keys",
    run() {
      const entries = applyBiomeSpawnMultipliers(
        [["prey", 0.5], ["neutral", 0.3], ["predator", 0.2]],
        { spawnMultipliers: { prey: 1.4, neutral: 1, predator: 0.5 } },
      );
      const weights = Object.fromEntries(entries);
      near(Object.values(weights).reduce((sum, weight) => sum + weight, 0), 1);
      assert(weights.prey > 0.5);
      assert(weights.predator < 0.2);
      assert(entries.map(([key]) => key).join() === "prey,neutral,predator");

      const fallback = applyBiomeSpawnMultipliers(
        [["prey", 0.5], ["predator", 0.5]],
        { spawnMultipliers: { prey: 0, predator: 0 } },
      );
      assert(fallback[0][1] === 1 && fallback[1][1] === 0);
    },
  },
];
