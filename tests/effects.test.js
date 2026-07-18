import { CONFIG } from "../js/config.js";
import { Effects } from "../js/effects.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

export const tests = [
  {
    name: "low quality scales particle emissions and caps their budget",
    run() {
      const effects = new Effects();
      effects.burst(0, 0, "#fff", 10);
      assert(effects.particles.length === 10);

      effects.clear();
      effects.setQuality("low");
      effects.burst(0, 0, "#fff", 10);
      assert(effects.particles.length === Math.round(10 * CONFIG.effects.lowQualityParticleScale));

      effects.burst(0, 0, "#fff", 1000);
      assert(effects.particles.length === CONFIG.effects.particleBudgetLow);
    },
  },
];
