import { AutoQualityController } from "../js/quality.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

export const tests = [
  {
    name: "auto quality degrades only after sustained low frame rate",
    run() {
      const quality = new AutoQualityController();
      let change = null;
      for (let index = 0; index < 3 * 60; index += 1) {
        change = quality.update(1 / 60, 42, true) || change;
      }
      assert(change === null);
      for (let index = 0; index < 2 * 60; index += 1) {
        change = quality.update(1 / 60, 42, true) || change;
      }
      assert(change?.direction === "down");
      assert(quality.dprCap === 1.75);
    },
  },
  {
    name: "auto quality can recover after a stable high frame rate window",
    run() {
      const quality = new AutoQualityController();
      for (let index = 0; index < 5 * 60; index += 1) quality.update(1 / 60, 42, true);
      let change = null;
      for (let index = 0; index < 30 * 60; index += 1) {
        change = quality.update(1 / 60, 60, true) || change;
      }
      assert(change?.direction === "up");
      assert(quality.dprCap === 2);
    },
  },
];
