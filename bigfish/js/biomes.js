import { CONFIG } from "./config.js";
import { clamp, wrap, wrapDelta } from "./math.js";

const FALLBACK_ZONE = Object.freeze({
  id: "current",
  name: "开阔洋流",
  maxDepth: 1,
  riskMultiplier: 1,
  rewardMultiplier: 1,
  spawnMultipliers: Object.freeze({}),
});

/**
 * Converts a wrapped world Y coordinate into continuous depth: 0 at the
 * surface seam and 1 at the point opposite it. y=0 and y=height are identical.
 */
export function getWrappedDepth(y, worldHeight) {
  if (!(worldHeight > 0)) return 0;
  const phase = wrap(Number.isFinite(y) ? y : 0, worldHeight) / worldHeight * Math.PI * 2;
  return clamp((1 - Math.cos(phase)) * 0.5, 0, 1);
}

/** Shortest signed vertical offset from fromY to toY in a wrapped world. */
export function getWrappedYDelta(fromY, toY, worldHeight) {
  return wrapDelta(toY, fromY, worldHeight);
}

/** Tests a horizontal world band, including bands that cross the Y seam. */
export function isYWithinWrappedBand(y, centerY, halfHeight, worldHeight) {
  if (!(worldHeight > 0) || !(halfHeight >= 0)) return false;
  return Math.abs(getWrappedYDelta(centerY, y, worldHeight)) <= halfHeight;
}

/**
 * Returns the one or two biome weights active at a world Y coordinate.
 * Zones are ordered by maxDepth and transitions are smooth in depth space.
 */
export function getBiomeBlendAtY(y, worldHeight, tuning = CONFIG.biomes) {
  const depth = getWrappedDepth(y, worldHeight);
  const zones = getOrderedZones(tuning);
  const transitionDepth = clamp(finiteOr(tuning?.transitionDepth, 0), 0, 1);

  if (zones.length === 1) {
    return { depth, entries: [{ zone: zones[0], index: 0, weight: 1 }] };
  }

  const transitionHalf = transitionDepth * 0.5;
  if (transitionHalf > 0) {
    for (let index = 0; index < zones.length - 1; index += 1) {
      const boundary = zones[index].maxDepth;
      if (depth < boundary - transitionHalf || depth > boundary + transitionHalf) continue;
      const nextWeight = smoothstep(
        boundary - transitionHalf,
        boundary + transitionHalf,
        depth,
      );
      return {
        depth,
        entries: [
          { zone: zones[index], index, weight: 1 - nextWeight },
          { zone: zones[index + 1], index: index + 1, weight: nextWeight },
        ],
      };
    }
  }

  const index = Math.max(0, zones.findIndex((zone) => depth <= zone.maxDepth));
  const resolvedIndex = index < zones.length ? index : zones.length - 1;
  return {
    depth,
    entries: [{ zone: zones[resolvedIndex], index: resolvedIndex, weight: 1 }],
  };
}

/**
 * Resolves the dominant biome plus continuously blended risk, reward, and
 * spawn modifiers. Additional zone presentation fields are preserved.
 */
export function getBiomeAtY(y, worldHeight, tuning = CONFIG.biomes) {
  const blend = getBiomeBlendAtY(y, worldHeight, tuning);
  const dominant = blend.entries.reduce((best, entry) =>
    entry.weight > best.weight ? entry : best, blend.entries[0]);
  const spawnKeys = new Set();

  for (const { zone } of blend.entries) {
    for (const key of Object.keys(zone.spawnMultipliers ?? {})) spawnKeys.add(key);
  }

  const spawnMultipliers = {};
  for (const key of spawnKeys) {
    spawnMultipliers[key] = weightedValue(
      blend.entries,
      (zone) => finiteOr(zone.spawnMultipliers?.[key], 1),
    );
  }

  return {
    ...dominant.zone,
    index: dominant.index,
    depth: blend.depth,
    transition: blend.entries.length > 1,
    weights: Object.fromEntries(blend.entries.map(({ zone, weight }) => [zone.id, weight])),
    tintLayers: blend.entries
      .filter(({ zone }) => zone.tintColor && zone.tintAlpha > 0)
      .map(({ zone, weight }) => ({
        id: zone.id,
        color: zone.tintColor,
        alpha: zone.tintAlpha * weight,
      })),
    riskMultiplier: weightedValue(
      blend.entries,
      (zone) => finiteOr(zone.riskMultiplier, 1),
    ),
    rewardMultiplier: weightedValue(
      blend.entries,
      (zone) => finiteOr(zone.rewardMultiplier, 1),
    ),
    spawnMultipliers,
  };
}

export function getBiomeAtPosition(
  position,
  world = CONFIG.world,
  tuning = CONFIG.biomes,
) {
  return getBiomeAtY(position?.y, world?.height, tuning);
}

/**
 * Applies the active biome's relative spawn pressure while preserving a
 * normalized weighted-choice list. Entries may be tuples or plain records.
 */
export function applyBiomeSpawnMultipliers(entries, biome, keyMap = null) {
  if (!Array.isArray(entries) || entries.length === 0) return [];
  const multipliers = biome?.spawnMultipliers ?? {};
  const weighted = entries.map((entry) => {
    const value = Array.isArray(entry) ? entry[0] : entry?.value;
    const weight = Array.isArray(entry) ? entry[1] : entry?.weight;
    const key = keyMap?.[value] ?? value;
    const multiplier = Number.isFinite(multipliers[key]) ? multipliers[key] : 1;
    return { value, weight: Math.max(0, Number(weight) || 0) * Math.max(0, multiplier) };
  });
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0) {
    return weighted.map(({ value }, index) => [value, index === 0 ? 1 : 0]);
  }
  return weighted.map(({ value, weight }) => [value, weight / total]);
}

/** Dominant-biome membership helper for spawn placement and UI changes. */
export function isYInBiome(y, worldHeight, biomeId, tuning = CONFIG.biomes) {
  return getBiomeAtY(y, worldHeight, tuning).id === biomeId;
}

function getOrderedZones(tuning) {
  if (!Array.isArray(tuning?.zones) || tuning.zones.length === 0) {
    return [FALLBACK_ZONE];
  }

  return tuning.zones
    .filter((zone) => zone && typeof zone === "object")
    .map((zone, index) => ({
      ...zone,
      id: typeof zone.id === "string" && zone.id ? zone.id : `biome-${index}`,
      name: typeof zone.name === "string" && zone.name ? zone.name : `生态区 ${index + 1}`,
      maxDepth: clamp(finiteOr(zone.maxDepth, 1), 0, 1),
    }))
    .sort((a, b) => a.maxDepth - b.maxDepth);
}

function weightedValue(entries, read) {
  return entries.reduce((sum, entry) => sum + read(entry.zone) * entry.weight, 0);
}

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const amount = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return amount * amount * (3 - 2 * amount);
}
