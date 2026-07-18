import { CONFIG } from "./config.js";
import { clamp, wrapDelta } from "./math.js";

/** Converts a minimum screen size into world units without shrinking the source extent. */
export function getMinimumVisibleWorldExtent(worldExtent, zoom, minPixels) {
  const extent = Math.max(0, Number.isFinite(worldExtent) ? worldExtent : 0);
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const pixels = Math.max(0, Number.isFinite(minPixels) ? minPixels : 0);
  return Math.max(extent, pixels / safeZoom);
}

export function getMineGeometry(radius, zoom) {
  const visualRadius = getMinimumVisibleWorldExtent(
    radius,
    zoom,
    CONFIG.hazards.mineMinScreenRadius,
  );
  return {
    visualRadius,
    screenRadius: visualRadius * safeZoom(zoom),
    triggerRadius: visualRadius * CONFIG.hazards.mineTriggerVisualScale,
  };
}

export function getNetGeometry(net, zoom) {
  const baseWidth = Math.max(0, Number.isFinite(net?.width) ? net.width : 0);
  const baseHeight = Math.max(0, Number.isFinite(net?.height) ? net.height : CONFIG.net.height);
  const visualWidth = getMinimumVisibleWorldExtent(
    baseWidth,
    zoom,
    CONFIG.net.minScreenWidth,
  );
  const visualHeight = getMinimumVisibleWorldExtent(
    baseHeight,
    zoom,
    CONFIG.net.minScreenHeight,
  );
  const scale = clamp(CONFIG.net.collisionVisualScale, 0, 1);
  return {
    baseWidth,
    baseHeight,
    visualWidth,
    visualHeight,
    screenWidth: visualWidth * safeZoom(zoom),
    screenHeight: visualHeight * safeZoom(zoom),
    collisionWidth: visualWidth * scale,
    collisionHeight: visualHeight * scale,
  };
}

/** World distance a net may travel after spawning above the visible bounds. */
export function getNetTravelLimit(viewHeight) {
  const height = Math.max(0, Number.isFinite(viewHeight) ? viewHeight : 0);
  return height + CONFIG.net.spawnTopOffset + CONFIG.net.despawnPadding;
}

/** Continuous circle-vs-net test across the net's movement since the previous update. */
export function circleIntersectsNetSweep(circle, net, zoom, world = CONFIG.world) {
  if (!circle || !net) return false;
  const geometry = getNetGeometry(net, zoom);
  const radius = Math.max(0, Number.isFinite(circle.radius) ? circle.radius : 0);
  const currentCenterY = net.y + geometry.baseHeight / 2;
  const previousTop = Number.isFinite(net.previousY) ? net.previousY : net.y;
  const previousCenterY = previousTop + geometry.baseHeight / 2;
  const sweepTop = Math.min(previousCenterY, currentCenterY) - geometry.collisionHeight / 2;
  const sweepBottom = Math.max(previousCenterY, currentCenterY) + geometry.collisionHeight / 2;
  const sweepCenterY = (sweepTop + sweepBottom) / 2;

  const dx = world.wrap !== false
    ? wrapDelta(circle.x, net.x, world.width)
    : circle.x - net.x;
  const circleY = world.wrap !== false
    ? sweepCenterY + wrapDelta(circle.y, sweepCenterY, world.height)
    : circle.y;
  const outsideX = Math.max(0, Math.abs(dx) - geometry.collisionWidth / 2);
  const outsideY = circleY < sweepTop
    ? sweepTop - circleY
    : circleY > sweepBottom
      ? circleY - sweepBottom
      : 0;
  return outsideX * outsideX + outsideY * outsideY <= radius * radius;
}

/** True when a spawn point sits inside the full vertical column reserved by an active net. */
export function isPointInNetColumn(x, radius, net, zoom, world = CONFIG.world, margin = 0) {
  if (!net?.active) return false;
  const geometry = getNetGeometry(net, zoom);
  const dx = world.wrap !== false
    ? wrapDelta(x, net.x, world.width)
    : x - net.x;
  const clearance = geometry.visualWidth / 2
    + Math.max(0, Number.isFinite(radius) ? radius : 0)
    + Math.max(0, Number.isFinite(margin) ? margin : 0);
  return Math.abs(dx) <= clearance;
}

function safeZoom(zoom) {
  return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
}
