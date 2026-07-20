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
  // 稀有度保底(Boss 掉落等场景):掷出更低档时直接抬升,不消耗额外随机数。
  const minimumRarity = RARITY_IDS.includes(options?.minimumRarity)
    ? options.minimumRarity
    : null;
  let rarity = rollRarity(floorId, rng);
  if (minimumRarity
    && RARITY_IDS.indexOf(rarity) < RARITY_IDS.indexOf(minimumRarity)) {
    rarity = minimumRarity;
  }
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
  const affixes = rollAffixes(slot, itemLevel, rarity, rarityMeta, rng, classId);
  const effect = rarity === "legendary" && CONFIG.loot.enableLegendaryEffects
    ? rollLegendaryEffect(rng)
    : null;
  const baseName = rng.pick(CONFIG.loot.namesBySlot[slot])
    ?? CONFIG.equipmentSlots[slot].name;
  const name = generateEquipmentName(baseName, {
    level: itemLevel,
    affixes,
    effect,
  });
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
  power += finite(baseStats.dodgeChance, 0) * finite(CONFIG.stats.powerWeights.dodgeChance, 0);
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
    else if (stat === "dodgeChance") power += value * finite(CONFIG.stats.powerWeights.dodgeChance, 0);
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
  const baseName = extractEquipmentBaseName(current.name);
  const candidate = {
    ...current,
    name: generateEquipmentName(baseName, {
      ...current,
      affixes,
    }),
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

/**
 * Returns the mapped affix that best represents an item. Rarer affix families
 * win first; rolls within one family are compared by their level-normalized
 * percentile. The final id comparison makes ties independent of array order.
 */
export function getMostSignificantAffix(item, inputConfig = CONFIG) {
  const source = item && typeof item === "object" ? item : {};
  const affixes = Array.isArray(source.affixes) ? source.affixes : [];
  const naming = getNamingConfig(inputConfig);
  const definitions = inputConfig?.affixes ?? CONFIG.affixes;
  const level = Math.max(1, Math.floor(finite(source.level, 1)));
  const scored = affixes.map((affix) => {
    const definition = definitions?.[affix?.id]
      ?? Object.values(definitions ?? {}).find((entry) => entry?.stat === affix?.stat);
    const mapping = readPrefixMapping(
      naming.affixPrefixes,
      affix?.id,
      affix?.stat,
    );
    if (!definition || !mapping.prefix) return null;
    const floorBonus = (level - 1) * finite(definition.perFloor, 0);
    const minimum = finite(definition.min, 0) + floorBonus;
    const maximum = finite(definition.max, minimum) + floorBonus;
    const span = Math.max(Number.EPSILON, maximum - minimum);
    const percentile = Math.max(0, Math.min(
      1,
      (finite(affix?.value, minimum) - minimum) / span,
    ));
    const rarityRank = Math.max(
      0,
      RARITY_ORDER.indexOf(definition.minimumRarity ?? "common"),
    );
    return {
      affix,
      prefix: mapping.prefix,
      priority: mapping.priority,
      rarityRank,
      percentile,
      id: String(definition.id ?? affix?.id ?? affix?.stat ?? ""),
    };
  }).filter(Boolean);

  scored.sort((left, right) =>
    right.priority - left.priority
      || right.rarityRank - left.rarityRank
      || right.percentile - left.percentile
      || compareStableText(left.id, right.id));
  return scored[0]?.affix ?? null;
}

/**
 * Returns how well one affix rolled within its possible range at the item's
 * level: { ratio: 0..1, percent: 0..100, minimum, maximum }, or null for an
 * unknown affix. Pure and deterministic — used by roll-quality badges.
 */
export function getAffixRollQuality(affix, level = 1) {
  const definition = CONFIG.affixes[affix?.id]
    ?? Object.values(CONFIG.affixes).find((entry) => entry.stat === affix?.stat);
  if (!definition) return null;
  const safeLevel = Math.max(1, Math.floor(finite(level, 1)));
  const floorBonus = (safeLevel - 1) * finite(definition.perFloor, 0);
  const minimum = finite(definition.min, 0) + floorBonus;
  const maximum = finite(definition.max, minimum) + floorBonus;
  const span = Math.max(Number.EPSILON, maximum - minimum);
  const ratio = Math.max(0, Math.min(1, (finite(affix?.value, minimum) - minimum) / span));
  return { ratio, percent: Math.round(ratio * 100), minimum, maximum };
}

/** Legendary effects take naming priority over ordinary affixes. */
export function getEquipmentPrefix(item, inputConfig = CONFIG) {
  const source = item && typeof item === "object" ? item : {};
  const naming = getNamingConfig(inputConfig);
  if (source.effect) {
    const effect = typeof source.effect === "string"
      ? { id: source.effect, type: source.effect }
      : source.effect;
    const effectPrefix = readPrefixMapping(
      naming.effectPrefixes,
      effect?.id,
      effect?.type,
    ).prefix;
    if (effectPrefix) return effectPrefix;
  }
  const affix = getMostSignificantAffix(source, inputConfig);
  if (!affix) return "";
  return readPrefixMapping(naming.affixPrefixes, affix.id, affix.stat).prefix;
}

/** Builds a stable display name without consuming or creating random values. */
export function generateEquipmentName(baseName, item = {}, inputConfig = CONFIG) {
  const cleanBaseName = extractEquipmentBaseName(baseName, inputConfig)
    || "装备";
  return `${getEquipmentPrefix(item, inputConfig)}${cleanBaseName}`.slice(0, 50);
}

/** Removes known generated prefixes (and legacy rarity labels) from a name. */
export function extractEquipmentBaseName(name, inputConfig = CONFIG) {
  let result = typeof name === "string" ? name.trim() : "";
  if (!result) return "";
  const naming = getNamingConfig(inputConfig);
  const generatedPrefixes = [
    ...Object.values(naming.effectPrefixes),
    ...Object.values(naming.affixPrefixes),
  ].map((entry) => normalizePrefixEntry(entry).prefix)
    .filter(Boolean)
    .sort((left, right) => right.length - left.length || compareStableText(left, right));
  const rarityNames = Object.values(inputConfig?.rarities ?? CONFIG.rarities)
    .map((rarity) => typeof rarity?.name === "string" ? rarity.name : "")
    .filter(Boolean)
    .sort((left, right) => right.length - left.length || compareStableText(left, right));
  const removable = [...generatedPrefixes, ...rarityNames];

  let changed = true;
  while (changed && result) {
    changed = false;
    for (const prefix of removable) {
      if (!result.startsWith(prefix)) continue;
      result = result.slice(prefix.length).trim();
      changed = true;
      break;
    }
  }
  return result;
}

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
    const selectedIndex = selectAffixIndex(pool, rng, classId);
    const definition = pool.splice(selectedIndex, 1)[0];
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

/**
 * Selects a candidate with class-specific weights while keeping the draw seeded.
 * A missing weight means neutral weight 1, so existing warrior/mage rolls stay
 * uniform unless a class explicitly opts into a preference table.
 */
function selectAffixIndex(pool, rng, classId) {
  const weights = CONFIG.classes?.[classId]?.affixWeights ?? {};
  const values = pool.map((definition) => Math.max(
    0,
    finite(weights[definition.id], 1),
  ));
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return Math.max(0, Math.min(pool.length - 1, rng.int(0, pool.length - 1)));
  const roll = typeof rng === "function" ? rng() : rng.int(0, 1);
  let cursor = Math.max(0, Math.min(1 - Number.EPSILON, roll)) * total;
  for (let index = 0; index < values.length; index += 1) {
    cursor -= values[index];
    if (cursor < 0) return index;
  }
  return values.length - 1;
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

function getNamingConfig(inputConfig) {
  const root = inputConfig && typeof inputConfig === "object" ? inputConfig : {};
  const source = root.equipmentNaming && typeof root.equipmentNaming === "object"
    ? root.equipmentNaming
    : {};
  return {
    affixPrefixes: source.affixPrefixes && typeof source.affixPrefixes === "object"
      ? source.affixPrefixes
      : root.affixPrefixes && typeof root.affixPrefixes === "object"
        ? root.affixPrefixes
        : {},
    effectPrefixes: source.effectPrefixes && typeof source.effectPrefixes === "object"
      ? source.effectPrefixes
      : root.effectPrefixes && typeof root.effectPrefixes === "object"
        ? root.effectPrefixes
        : {},
  };
}

function readPrefixMapping(mapping, ...keys) {
  for (const key of keys) {
    if (typeof key !== "string" || !key) continue;
    const normalized = normalizePrefixEntry(mapping?.[key]);
    if (normalized.prefix) return normalized;
  }
  return { prefix: "", priority: 0 };
}

function normalizePrefixEntry(entry) {
  if (typeof entry === "string") {
    return { prefix: entry.trim().slice(0, 24), priority: 0 };
  }
  if (!entry || typeof entry !== "object") return { prefix: "", priority: 0 };
  const rawPrefix = entry.prefix ?? entry.name ?? entry.label;
  return {
    prefix: typeof rawPrefix === "string" ? rawPrefix.trim().slice(0, 24) : "",
    priority: finite(entry.priority, 0),
  };
}

function compareStableText(left, right) {
  const a = String(left ?? "");
  const b = String(right ?? "");
  return a < b ? -1 : a > b ? 1 : 0;
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
