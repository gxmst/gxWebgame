import { CONFIG } from "../js/config.js";
import {
  createEnvironment,
  getMineTrackingTarget,
  getSeaweedSlowScale,
} from "../js/environment.js";
import { createSeededRng } from "../js/math.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

export const tests = [
  {
    name: "environment generation is bounded and shells carry configured values",
    run() {
      const items = createEnvironment(CONFIG.world, createSeededRng("environment"));
      assert(items.filter((item) => item.type === "seaweed").length === CONFIG.environment.seaweedCount);
      assert(items.filter((item) => item.type === "trash").length === CONFIG.environment.trashCount);
      const shells = items.filter((item) => item.type === "shell");
      assert(shells.length === CONFIG.environment.shellCount);
      assert(shells.every((item) => [CONFIG.environment.shellCommonPearls, CONFIG.environment.shellRarePearls].includes(item.value)));
    },
  },
  {
    name: "seaweed slowing and mine tracking use wrapped distance",
    run() {
      const seaweed = [{ type: "seaweed", active: true, x: 5, y: 100, radius: 20 }];
      const scale = getSeaweedSlowScale(
        { x: CONFIG.world.width - 5, y: 100, radius: 10 },
        seaweed,
        CONFIG.world,
        0.72,
      );
      assert(scale === 0.72);

      const mine = { x: CONFIG.world.width - 10, y: 200, armTime: 0, triggered: false };
      const target = getMineTrackingTarget(mine, { x: 10, y: 200, tier: CONFIG.environment.mineTrackingTier }, CONFIG.world);
      assert(target.tracking && target.vx > 0);
      assert(Math.hypot(target.vx, target.vy) <= CONFIG.environment.mineTrackingSpeed + 1e-9);
      const gated = getMineTrackingTarget(mine, { x: 10, y: 200, tier: 1 }, CONFIG.world);
      assert(!gated.tracking && gated.vx === 0);
    },
  },
];
