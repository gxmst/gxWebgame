import { CONFIG } from "../js/config.js";
import { getDayNightState } from "../js/day-night.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

export const tests = [
  {
    name: "day-night state is periodic and exposes smooth gameplay multipliers",
    run() {
      const first = getDayNightState(12);
      const nextCycle = getDayNightState(12 + CONFIG.dayNight.periodSeconds);
      assert(Math.abs(first.phase - nextCycle.phase) < 1e-9);
      assert(Math.abs(first.nightStrength - nextCycle.nightStrength) < 1e-9);

      const nightTime = (0.75 - CONFIG.dayNight.startPhase) * CONFIG.dayNight.periodSeconds;
      const night = getDayNightState(nightTime);
      assert(night.segment === "night");
      assert(night.scoreMultiplier > 1.14);
      assert(night.hintDistanceScale < 0.8);

      const before = getDayNightState(nightTime - 0.05);
      assert(Math.abs(night.nightStrength - before.nightStrength) < 0.01);
    },
  },
];
