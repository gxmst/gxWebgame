import { CONFIG } from "../js/config.js";
import {
  circleIntersectsNetSweep,
  getMineGeometry,
  getMinimumVisibleWorldExtent,
  getNetGeometry,
  getNetTravelLimit,
  isPointInNetColumn,
} from "../js/hazards.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

export const tests = [
  {
    name: "lethal hazards preserve configured minimum screen size",
    run() {
      const extent = getMinimumVisibleWorldExtent(23, 0.3, 12);
      assert(extent === 40);
      const mine = getMineGeometry(23, 0.3);
      assert(mine.screenRadius === CONFIG.hazards.mineMinScreenRadius);
      assert(mine.triggerRadius < mine.visualRadius);

      const net = getNetGeometry({ width: 100, height: 42 }, 0.1);
      assert(net.screenWidth === CONFIG.net.minScreenWidth);
      assert(net.screenHeight === CONFIG.net.minScreenHeight);
      assert(net.collisionWidth < net.visualWidth);
    },
  },
  {
    name: "net sweep catches only circles crossed inside its horizontal band",
    run() {
      const world = { width: 1000, height: 600, wrap: false };
      const net = {
        active: true,
        x: 200,
        y: 120,
        previousY: 20,
        width: 100,
        height: 42,
      };
      assert(circleIntersectsNetSweep({ x: 210, y: 80, radius: 8 }, net, 1, world));
      assert(!circleIntersectsNetSweep({ x: 270, y: 80, radius: 8 }, net, 1, world));
      assert(!circleIntersectsNetSweep({ x: 210, y: 220, radius: 8 }, net, 1, world));
    },
  },
  {
    name: "net columns and sweep geometry respect the wrapped world seam",
    run() {
      const world = { width: 1000, height: 600, wrap: true };
      const net = {
        active: true,
        x: 5,
        y: 120,
        previousY: 60,
        width: 90,
        height: 42,
      };
      assert(circleIntersectsNetSweep({ x: 990, y: 100, radius: 6 }, net, 1, world));
      assert(isPointInNetColumn(990, 5, net, 1, world, 0));
      assert(!isPointInNetColumn(800, 5, net, 1, world, 0));
    },
  },
  {
    name: "net travel lifetime is independent of wrapped camera coordinates",
    run() {
      const limit = getNetTravelLimit(900);
      assert(limit === 900 + CONFIG.net.spawnTopOffset + CONFIG.net.despawnPadding);
      assert(getNetTravelLimit(900) === limit);
    },
  },
];
