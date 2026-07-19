import {
  CONFIG,
  EQUIPMENT_SLOT_IDS,
  RARITY_IDS,
  createSeededRng,
  hashSeed,
} from "./config.js";
import { sanitizeItem } from "./hero.js";

/** Read-only rarity metadata used by loot cards and inventory sorting. */
export const RARITIES = CONFIG.rarities;
export const RARITY_ORDER = CONFIG.rarityOrder;

export function getRarityMeta(rarity) {
  const raw = rarity && typeof rarity === "object" ? rarity.id ?? rarity.key : rarity;
  const normalized = { normal: "common", excellent: "uncommon" }[raw] ?? raw;
  return RARITIES[normalized] ?? RARITIES.common;
}

/**
 * Generates one deterministic item. `floor` can be a number or a floor object;
 * `hero` is optional; it biases empty equipment slots and class-compatible
 * affix selection without mutating the hero.
 *
 * The fourth argument is intentionally optional so the first-batch call sites
 * remain valid. `forcedSlot` is used by deterministic shop rotations and
 * `idPrefix` gives generated listings a namespace distinct from dungeon drops.
 */
export function generateLoot(floor = 1, seed = 0, hero = null, options = {}) {
  const floorId = resolveFloorId(floor);
  const rng = createSeededRng(`${String(seed ?? "0")}|loot|${floorId}`);
  const rarity = rollRarity(floorId, rng);
  const forcedSlot = EQUIPMENT_SLOT_IDS.includes(options?.forcedSlot)
    ? options.forcedSlot
    : null;
  const classId = typeof options?.classId === "string"
    ? options.classId
    : typeof hero?.classId === "string" ? hero.classId : null;
  const slot = rollSlot(rng, hero, forcedSlot);
  const rarityMeta = getRarityMeta(rarity);
  const itemLevel = Math.max(
    1,
    floorId + rng.int(-CONFIG.loot.itemLevelVariance, CONFIG.loot.itemLevelVariance),
  );
  const baseStats = rollBaseStats(slot, floorId, rarityMeta.multiplier, rng);
  const affixes = rollAffixes(slot, floorId, rarity, rarityMeta, rng, classId);
  const effect = rarity === "legendary" && CONFIG.loot.enableLegendaryEffects
    ? rollLegendaryEffect(rng)
    : null;
  const baseName = rng.pick(CONFIG.loot.namesBySlot[slot])
    ?? CONFIG.equipmentSlots[slot].name;
  const name = `${rarityMeta.name}${baseName}`;
  const stableSeed = typeof seed === "number" && Number.isFinite(seed)
    ? seed
    : String(seed ?? "0").slice(0, 100);
  const idPrefix = typeof options?.idPrefix === "string" && options.idPrefix.length > 0
    ? options.idPrefix.slice(0, 24)
    : "loot";
  const id = `${idPrefix}-${hashSeed(JSON.stringify([
    stableSeed,
    floorId,
    slot,
    rarity,
    itemLevel,
    baseStats,
    affixes,
    effect?.id ?? null,
  ])).toString(16)}`;

  return sanitizeItem({
    id,
    name,
    emoji: CONFIG.equipmentSlots[slot].emoji,
    slot,
    rarity,
    level: itemLevel,
    baseStats,
    affixes,
    effect,
    power: calculateItemPower({ baseStats, affixes, effect, rarity }),
    seed: stableSeed,
  });
}

/** Deterministic rarity roll exposed for tests and preview UIs. */
export function rollRarity(floor = 1, rng = createSeededRng(floor)) {
  const floorId = resolveFloorId(floor);
  const configured = CONFIG.loot.rarityWeightsByFloor[floorId]
    ?? CONFIG.loot.rarityWeightsByFloor[1];
  const weights = RARITY_IDS.map((id) => Math.max(0, finite(configured[id], 0)));
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return "common";
  let cursor = rng() * total;
  for (let index = 0; index < RARITY_IDS.length; index += 1) {
    cursor -= weights[index];
    if (cursor < 0) return RARITY_IDS[index];
  }
  return RARITY_IDS.at(-1);
}

export function calculateItemPower(item) {
  const source = item && typeof item === "object" ? item : {};
  const rarity = getRarityMeta(source.rarity);
  const baseStats = source.baseStats && typeof source.baseStats === "object"
    ? source.baseStats
    : {};
  const affixes = Array.isArray(source.affixes) ? source.affixes : [];
  let power = 0;
  power += finite(baseStats.maxHp, 0) * CONFIG.stats.powerWeights.maxHp * 0.35;
  power += finite(baseStats.attack, 0) * CONFIG.stats.powerWeights.attack;
  power += finite(baseStats.defense, 0) * CONFIG.stats.powerWeights.defense;
  power += finite(baseStats.speed, 0) * CONFIG.stats.powerWeights.speed;
  power += finite(baseStats.critChance, 0) * CONFIG.stats.powerWeights.critChance;
  power += finite(baseStats.critDamage, 0) * CONFIG.stats.powerWeights.critDamage;
  power += finite(baseStats.damageReduction, 0) * CONFIG.stats.powerWeights.damageReduction;
  for (const affix of affixes) {
    const stat = affix?.stat;
    const value = finite(affix?.value, 0);
    if (stat === "maxHp") power += value * CONFIG.stats.powerWeights.maxHp * 0.35;
    else if (stat === "attack") power += value * CONFIG.stats.powerWeights.attack;
    else if (stat === "defense") power += value * CONFIG.stats.powerWeights.defense;
    else if (stat === "speed") power += value * CONFIG.stats.powerWeights.speed;
    else if (stat === "critChance") power += value * CONFIG.stats.powerWeights.critChance;
    else if (stat === "critDamage") power += value * CONFIG.stats.powerWeights.critDamage;
    else if (stat === "damageReduction") power += value * CONFIG.stats.powerWeights.damageReduction;
    else if (["damagePercent", "physicalDamagePercent", "magicDamagePercent"].includes(stat)) {
      const weight = finite(
        CONFIG.stats.powerWeights[stat],
        finite(CONFIG.stats.powerWeights.damagePercent, CONFIG.stats.powerWeights.damageReduction),
      );
      power += value * weight;
    }
    else if (["strength", "agility", "intelligence", "vitality"].includes(stat)) {
      power += value * 4;
    }
  }
  if (source.effect) power += finite(source.effect.value, 0) * 100;
  // Rarity is already reflected in rolled bases, but a tiny floor makes an
  // empty-stat legendary visibly more valuable in sorting UIs.
  power += (rarity.multiplier - 1) * 8;
  return Math.max(0, Math.round(power));
}

/** Alias useful to callers that prefer an explicit item-naming verb. */
export const getItemPower = calculateItemPower;

/**
 * Re-rolls only an item's random affixes. Base stats, rarity, identity and
 * legendary effect are deliberately copied unchanged. The caller supplies a
 * seed so previews and reducers never depend on ambient randomness.
 */
export function rerollItemAffixes(item, seed = 0, options = {}) {
  const current = sanitizeItem(item);
  if (!current) return null;
  const rarityMeta = getRarityMeta(current.rarity);
  const rng = createSeededRng(`${String(seed ?? "0")}|reforge|${current.id}`);
  const affixes = rollAffixes(
    current.slot,
    current.level,
    current.rarity,
    rarityMeta,
    rng,
    options?.classId,
  );
  const candidate = {
    ...current,
    affixes,
    // `power` is derived from the complete item, never copied from a stale
    // save field. This also keeps shop/re-forge pricing consistent.
    power: calculateItemPower({ ...current, affixes }),
  };
  return sanitizeItem(candidate);
}

/** Explicit aliases make the operation discoverable to economy/UI callers. */
export const reforgeItem = rerollItemAffixes;
export const rerollAffixes = rerollItemAffixes;

function rollSlot(rng, hero, forcedSlot = null) {
  if (EQUIPMENT_SLOT_IDS.includes(forcedSlot)) return forcedSlot;
  const slots = [...EQUIPMENT_SLOT_IDS];
  const empty = slots.filter((slot) => !hero?.equipment?.[slot]);
  if (empty.length > 0 && rng() < CONFIG.loot.emptySlotBias) return rng.pick(empty);
  return rng.pick(slots) ?? "weapon";
}

function rollBaseStats(slot, floor, rarityMultiplier, rng) {
  const definitions = CONFIG.loot.baseStatsBySlot[slot] ?? {};
  const floorScale = 1 + (floor - 1) * CONFIG.loot.baseGrowthPerFloor;
  const result = {};
  for (const [stat, range] of Object.entries(definitions)) {
    if (!Array.isArray(range) || range.length < 2) continue;
    const min = finite(range[0], 0) * floorScale * rarityMultiplier;
    const max = finite(range[1], min) * floorScale * rarityMultiplier;
    result[stat] = Math.max(0, Math.round(rng.range(min, max)));
  }
  return result;
}

export function rollAffixes(slot, floor, rarity, rarityMeta, rng, classId = null) {
  if (rarityMeta.maxAffixes <= 0) return [];
  const count = rng.int(rarityMeta.minAffixes, rarityMeta.maxAffixes);
  const rarityIndex = RARITY_ORDER.indexOf(rarity);
  const candidates = Object.values(CONFIG.affixes).filter((definition) => {
    const minimum = RARITY_ORDER.indexOf(definition.minimumRarity ?? "common");
    const allowedClasses = definition.classIds
      ?? definition.classes
      ?? definition.allowedClasses;
    const classAllowed = !classId
      || !Array.isArray(allowedClasses)
      || allowedClasses.includes(classId);
    return minimum <= rarityIndex
      && (!definition.slots || definition.slots.includes(slot))
      && classAllowed;
  });
  const result = [];
  const pool = [...candidates];
  for (let index = 0; index < count && pool.length > 0; index += 1) {
    const definition = pool.splice(rng.int(0, pool.length - 1), 1)[0];
    const floorBonus = (floor - 1) * finite(definition.perFloor, 0);
    const min = finite(definition.min, 0) + floorBonus;
    const max = finite(definition.max, min) + floorBonus;
    let value = rng.range(min, max);
    const decimals = Number.isInteger(definition.decimals) ? definition.decimals : 0;
    const factor = 10 ** decimals;
    value = decimals > 0 ? Math.round(value * factor) / factor : Math.round(value);
    result.push({
      id: definition.id,
      name: definition.name,
      stat: definition.stat,
      value: Math.max(0, value),
      format: definition.format ?? "number",
    });
  }
  return result;
}

function rollLegendaryEffect(rng) {
  const definitions = Object.values(CONFIG.legendaryEffects);
  const definition = rng.pick(definitions);
  return definition
    ? {
      id: definition.id,
      name: definition.name,
      description: definition.description,
      type: definition.type,
      value: definition.value,
    }
    : null;
}

function resolveFloorId(floor) {
  const raw = typeof floor === "object" && floor !== null ? floor.id : floor;
  const numeric = Number.isFinite(raw) ? Math.floor(raw) : Number.parseInt(raw, 10);
  return Math.min(CONFIG.dungeon.maxFloor, Math.max(CONFIG.dungeon.minFloor, Number.isFinite(numeric) ? numeric : 1));
}

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

export { createSeededRng, hashSeed };
