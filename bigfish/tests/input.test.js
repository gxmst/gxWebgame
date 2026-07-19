import { getWorldTargetDelta } from "../js/input.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

export const tests = [
  {
    name: "absolute input aims across a world seam by the shortest route",
    run() {
      const camera = { wrap: true, worldWidth: 1000, worldHeight: 600 };
      const delta = getWorldTargetDelta(camera, { x: 980, y: 590 }, { x: 20, y: 10 });
      assert(delta.x === 40);
      assert(delta.y === 20);
    },
  },
];
