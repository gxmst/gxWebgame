import { Camera } from "../js/camera.js";
import { CONFIG } from "../js/config.js";
import { wrap, wrapDelta } from "../js/math.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};
const near = (actual, expected, tolerance = 1e-8) => {
  assert(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

export const tests = [
  {
    name: "camera world/screen conversion round-trips",
    run() {
      const camera = new Camera({ width: 913, height: 577, x: 1800, y: 900, zoom: 0.63, wrap: false });
      const world = { x: 2398.25, y: 128.75 };
      const restored = camera.screenToWorld(camera.worldToScreen(world));
      near(restored.x, world.x);
      near(restored.y, world.y);
    },
  },
  {
    name: "camera resize uses CSS pixels and preserves center mapping",
    run() {
      const camera = new Camera({ width: 800, height: 600, x: 2100, y: 1300, zoom: 1, wrap: false });
      camera.resize(1200, 700);
      const center = camera.worldToScreen(2100, 1300);
      near(center.x, 600);
      near(center.y, 350);
    },
  },
  {
    name: "camera clamps view to world bounds",
    run() {
      const camera = new Camera({
        width: 800,
        height: 600,
        x: -500,
        y: -500,
        zoom: 1,
        wrap: false,
      });
      const bounds = camera.getVisibleWorldBounds();
      assert(bounds.left >= 0);
      assert(bounds.top >= 0);
      camera.setTarget({ x: 99999, y: 99999, mass: 10 }).update(10);
      const endBounds = camera.getVisibleWorldBounds();
      assert(endBounds.right <= camera.worldWidth + 1e-8);
      assert(endBounds.bottom <= camera.worldHeight + 1e-8);
    },
  },
  {
    name: "visibility accepts points and intersecting circles",
    run() {
      const camera = new Camera({ width: 800, height: 600, x: 2100, y: 1300, zoom: 1, wrap: false });
      assert(camera.isWorldPointVisible(2100, 1300));
      assert(!camera.isWorldPointVisible(0, 0));
      const bounds = camera.getVisibleWorldBounds();
      assert(camera.isWorldPointVisible({ x: bounds.left - 5, y: camera.y, radius: 6 }));
    },
  },
  {
    name: "camera zoom follows display mass smoothly",
    run() {
      const target = { x: 2100, y: 1300, mass: 110, displayMass: 10, vx: 100, vy: 0 };
      const camera = new Camera({ width: 800, height: 600, x: target.x, y: target.y, wrap: false });
      camera.setTarget(target);
      near(camera.targetZoom, 1);
      target.displayMass = 110;
      camera.update(1 / 60);
      assert(camera.targetZoom < 1);
      assert(camera.zoom > camera.targetZoom, "zoom should damp instead of snapping");
      assert(camera.x > target.x, "velocity should add look-ahead");
    },
  },
  {
    name: "camera supports distant growth views and a stable sovereign override",
    run() {
      const target = { x: 1000, y: 600, displayMass: 1e9, vx: 0, vy: 0 };
      const camera = new Camera({ width: 800, height: 600, wrap: false });
      camera.setTarget(target);
      assert(camera.targetZoom === CONFIG.camera.minZoom);
      target.displayMass = CONFIG.mass.sovereignSoftCap;
      target.cameraZoomOverride = CONFIG.camera.sovereignZoom;
      camera.update(1 / 60);
      assert(camera.targetZoom === CONFIG.camera.sovereignZoom);
    },
  },
  {
    name: "wrap camera follows across the seam without clamping",
    run() {
      const worldWidth = 2000;
      const worldHeight = 1200;
      const target = { x: 50, y: 600, mass: 10, displayMass: 10, vx: 0, vy: 0 };
      const camera = new Camera({
        width: 800,
        height: 600,
        x: worldWidth - 40,
        y: 600,
        zoom: 1,
        wrap: true,
        worldWidth,
        worldHeight,
      });
      camera.setTarget(target);
      camera.update(1);
      // Should move toward target across wrap, ending near 50 — not stuck at edge.
      const dx = Math.abs(wrapDelta(camera.x, target.x, worldWidth));
      assert(dx < 80, `camera should approach wrapped target, dx=${dx}`);
      assert(camera.x >= 0 && camera.x < worldWidth);
    },
  },
  {
    name: "wrap worldToScreen uses nearest image across the seam",
    run() {
      const camera = new Camera({
        width: 800,
        height: 600,
        x: 50,
        y: 300,
        zoom: 1,
        wrap: true,
        worldWidth: 2000,
        worldHeight: 1200,
      });
      // Point near the right seam; shortest path from x=50 is leftward across 0.
      const screen = camera.worldToScreen(1950, 300);
      // wrapDelta(1950, 50, 2000) = -100 → screen x = 400 - 100 = 300
      near(screen.x, 300, 1e-6);
      near(screen.y, 300, 1e-6);
    },
  },
  {
    name: "wrap helpers keep values in range and pick shortest delta",
    run() {
      near(wrap(-10, 100), 90);
      near(wrap(110, 100), 10);
      near(wrapDelta(10, 90, 100), 20);
      near(wrapDelta(90, 10, 100), -20);
    },
  },
  {
    name: "wide wrapped view enumerates every visible world image",
    run() {
      const camera = new Camera({
        width: 250,
        height: 100,
        x: 0,
        y: 50,
        zoom: 1,
        wrap: true,
        worldWidth: 100,
        worldHeight: 100,
      });
      const screens = camera.getVisibleWrappedScreens(0, 50);
      assert(screens.length === 3);
      assert(screens.map((point) => point.x).join(",") === "25,125,225");
    },
  },
  {
    name: "wrapped depth lighting is continuous across the vertical seam",
    run() {
      const camera = new Camera({ wrap: true, worldWidth: 1000, worldHeight: 600, y: 1 });
      const topDepth = camera.depthT;
      camera.y = 599;
      near(camera.depthT, topDepth, 1e-8);
      camera.y = 300;
      near(camera.depthT, 1, 1e-8);
    },
  },
];
