import {
  CONFIG,
  EQUIPMENT_SLOT_IDS,
  RARITY_IDS,
  hashSeed,
} from "./config.js";
import { sanitizeItem } from "./hero.js";
import {
  calculateItemPower,
  generateLoot,
  rerollItemAffixes,
} from "./loot.js";
import {
  getReforgeMaterialCost,
  spendMaterial,
} from "./materials.js";

const MAX_COUNTER = Number.MAX_SAFE_INTEGER;
const VALID_TARGET_LOCATIONS = new Set(["inventory", "equipment", "any"]);

export function createDefaultEconomy() {
  return {
    reforgeCounter: 0,
    pendingReforge: null,
    shop: {
      initialized: false,
      rotation: 0,
      lastRefreshVictory: 0,
      stock: [],
    },
  };
}

/**
 * Keeps only JSON-safe economy state. Passing the current hero lets the
 * sanitizer reject stale reforge targets and shop items that already belong
 * to the player.
 */
export function sanitizeEconomy(candidate, context = {}) {
  const defaults = createDefaultEconomy();
  const source = isRecord(candidate) ? candidate : {};
  const hero = getContextHero(context);
  const progress = getContextProgress(context);
  const rawShop = isRecord(source.shop) ? source.shop : {};
  const ownedIds = collectOwnedItemIds(hero);
  const stockLimit = getShopStockLimit();
  const seenListings = new Set();
  const seenItems = new Set();
  const rawStock = Array.isArray(rawShop.stock)
    ? rawShop.stock
    : Array.isArray(rawShop.items) ? rawShop.items : [];
  const stock = [];

  for (let index = 0; index < rawStock.length && stock.length < stockLimit; index += 1) {
    const rawListing = rawStock[index];
    const item = sanitizeItem(isRecord(rawListing) && rawListing.item
      ? rawListing.item
      : rawListing);
    if (!item || ownedIds.has(item.id) || seenItems.has(item.id)) continue;
    const fallbackListingId = createListingId(
      nonNegativeInteger(rawShop.rotation),
      index,
      item,
    );
    const listingId = safeString(rawListing?.listingId, fallbackListingId, 100);
    if (seenListings.has(listingId)) continue;
    seenListings.add(listingId);
    seenItems.add(item.id);
    stock.push({ listingId, item: withCanonicalPower(item) });
  }

  const rotation = clampInteger(rawShop.rotation, 0, MAX_COUNTER, 0);
  const initialized = typeof rawShop.initialized === "boolean"
    ? rawShop.initialized
    : rotation > 0 || stock.length > 0;
  const totalVictories = readTotalVictories(progress);
  const shop = {
    initialized,
    rotation,
    lastRefreshVictory: clampInteger(
      rawShop.lastRefreshVictory ?? rawShop.refreshedAtVictory,
      0,
      totalVictories,
      defaults.shop.lastRefreshVictory,
    ),
    stock,
  };

  const pendingReforge = sanitizePendingReforge(
    source.pendingReforge ?? source.reforge?.pending,
    hero,
  );

  return {
    reforgeCounter: clampInteger(
      source.reforgeCounter ?? source.reforge?.counter,
      0,
      MAX_COUNTER,
      defaults.reforgeCounter,
    ),
    pendingReforge,
    shop,
  };
}

export function getSellValue(item) {
  const clean = sanitizeItem(item);
  if (!clean) return 0;
  const tuning = CONFIG.economy?.sell ?? {};
  const value = calculateItemPower(clean) * finite(tuning.powerMultiplier, 0)
    + clean.level * finite(tuning.levelMultiplier, 0);
  return clampPrice(value, positiveInteger(tuning.minimum, 1));
}

export function getShopPrice(item) {
  const clean = sanitizeItem(item);
  if (!clean) return 0;
  const tuning = CONFIG.economy?.shop ?? {};
  const calculated = finite(tuning.basePrice, 0)
    + calculateItemPower(clean) * finite(tuning.powerMultiplier, 0)
    + clean.level * finite(tuning.levelMultiplier, 0);
  const minimumSellMultiplier = Math.max(1, finite(tuning.minimumSellMultiplier, 1));
  return Math.max(
    clampPrice(calculated, 1),
    Math.ceil(getSellValue(clean) * minimumSellMultiplier),
  );
}

export function getReforgeCost(item) {
  const clean = sanitizeItem(item);
  if (!clean) return 0;
  const tuning = CONFIG.economy?.reforge ?? {};
  const rawMultipliers = isRecord(tuning.rarityMultipliers)
    ? tuning.rarityMultipliers
    : {};
  const rarityMultiplier = Math.max(0, finite(rawMultipliers[clean.rarity], 1));
  const calculated = (
    finite(tuning.baseCost, 0)
      + calculateItemPower(clean) * finite(tuning.powerMultiplier, 0)
      + clean.level * finite(tuning.levelMultiplier, 0)
  ) * rarityMultiplier;
  return clampPrice(calculated, 1);
}

/** 重铸材料消耗说明（供 UI）；不改存档。 */
export function getReforgeMaterialRequirement(inputConfig = CONFIG) {
  return getReforgeMaterialCost(null, inputConfig);
}

/** Refreshes only when the configured victory interval has elapsed. */
export function ensureShop(save) {
  if (!hasUsableHero(save)) return failure(save, "invalid-save");
  const economy = sanitizeEconomy(save.economy, save);
  const victories = readTotalVictories(save.progress);
  const refreshEvery = getShopRefreshInterval();
  const due = !economy.shop.initialized
    || victories - economy.shop.lastRefreshVictory >= refreshEvery;
  if (due) return refreshShopWithEconomy(save, economy, victories);
  const nextSave = withEconomy(save, economy);
  return {
    save: nextSave,
    ok: true,
    reason: null,
    refreshed: false,
    shop: nextSave.economy.shop,
  };
}

/** Forces the next deterministic shop rotation regardless of its age. */
export function refreshShop(save) {
  if (!hasUsableHero(save)) return failure(save, "invalid-save");
  const economy = sanitizeEconomy(save.economy, save);
  return refreshShopWithEconomy(
    save,
    economy,
    readTotalVictories(save.progress),
  );
}

export function purchaseShopItem(save, listingId) {
  if (!hasUsableHero(save)) return failure(save, "invalid-save");
  const economy = sanitizeEconomy(save.economy, save);
  const normalizedId = safeString(listingId, "", 100);
  const listingIndex = economy.shop.stock.findIndex(
    (listing) => listing.listingId === normalizedId,
  );
  if (listingIndex < 0) return failure(save, "listing-not-found");

  const inventory = Array.isArray(save.hero.inventory) ? save.hero.inventory : [];
  if (inventory.length >= getInventoryLimit()) return failure(save, "inventory-full");

  const listing = economy.shop.stock[listingIndex];
  const item = withCanonicalPower(listing.item);
  if (!item) return failure(save, "invalid-item");
  if (collectOwnedItemIds(save.hero).has(item.id)) {
    return failure(save, "duplicate-item");
  }

  const price = getShopPrice(item);
  const gold = nonNegativeInteger(save.hero.gold);
  if (gold < price) return failure(save, "insufficient-gold");

  const stock = economy.shop.stock.filter((_, index) => index !== listingIndex);
  const nextSave = {
    ...save,
    hero: {
      ...save.hero,
      gold: gold - price,
      inventory: [...inventory, item],
    },
    economy: {
      ...economy,
      shop: { ...economy.shop, stock },
    },
  };
  return {
    save: nextSave,
    ok: true,
    reason: null,
    item,
    listingId: listing.listingId,
    price,
  };
}

/**
 * Charges once and persists a deterministic candidate. A pending decision
 * blocks subsequent rolls until the player keeps or replaces the affixes.
 */
export function beginReforge(save, target, seed = null) {
  if (!hasUsableHero(save)) return failure(save, "invalid-save");
  const economy = sanitizeEconomy(save.economy, save);
  if (economy.pendingReforge) return failure(save, "reforge-pending");

  const found = findOwnedItem(save.hero, target);
  if (!found) return failure(save, "item-not-found");
  const cost = getReforgeCost(found.item);
  const gold = nonNegativeInteger(save.hero.gold);
  if (gold < cost) return failure(save, "insufficient-gold");

  // 可选材料消耗：开启时不足则拒绝，避免只扣金币。
  const materialReq = getReforgeMaterialCost(found.item, CONFIG);
  let nextMaterials = isRecord(save.materials) ? { ...save.materials } : {};
  if (materialReq.required) {
    const spent = spendMaterial(nextMaterials, materialReq.materialId, materialReq.amount);
    if (!spent.ok) return failure(save, "insufficient-material");
    nextMaterials = spent.materials;
  }

  const nextCounter = Math.min(MAX_COUNTER, economy.reforgeCounter + 1);
  const stableSeed = normalizeSeed(
    seed,
    `reforge|${save.hero.classId ?? "hero"}|${found.item.id}|${nextCounter}`,
  );
  const candidate = rerollItemAffixes(found.item, stableSeed, {
    classId: save.hero.classId,
  });
  if (!candidate || !sameImmutableItem(found.item, candidate)) {
    return failure(save, "candidate-invalid");
  }

  const pendingReforge = {
    target: createResolvedTarget(found),
    candidate,
    cost,
    materialCost: materialReq.required
      ? { materialId: materialReq.materialId, amount: materialReq.amount, name: materialReq.name }
      : null,
    seed: stableSeed,
    originalFingerprint: fingerprintItem(found.item),
  };
  const nextSave = {
    ...save,
    hero: { ...save.hero, gold: gold - cost },
    materials: nextMaterials,
    economy: {
      ...economy,
      reforgeCounter: nextCounter,
      pendingReforge,
    },
  };
  return {
    save: nextSave,
    ok: true,
    reason: null,
    pending: pendingReforge,
    original: found.item,
    candidate,
    cost,
    materialCost: pendingReforge.materialCost,
  };
}

export function resolveReforge(save, choice) {
  if (!hasUsableHero(save)) return failure(save, "invalid-save");
  const economy = sanitizeEconomy(save.economy, save);
  const pending = economy.pendingReforge;
  if (!pending) return failure(save, "no-pending-reforge");
  const normalizedChoice = normalizeReforgeChoice(choice);
  if (!normalizedChoice) return failure(save, "invalid-choice");

  if (normalizedChoice === "keep") {
    const nextSave = {
      ...save,
      economy: { ...economy, pendingReforge: null },
    };
    return {
      save: nextSave,
      ok: true,
      reason: null,
      choice: "keep",
      item: findOwnedItem(save.hero, pending.target)?.item ?? null,
      cost: pending.cost,
    };
  }

  const found = findOwnedItem(save.hero, pending.target)
    ?? findOwnedItem(save.hero, { location: "any", itemId: pending.target.itemId });
  if (!found) return failure(save, "item-not-found");
  if (fingerprintItem(found.item) !== pending.originalFingerprint) {
    return failure(save, "item-changed");
  }
  if (!sameImmutableItem(found.item, pending.candidate)) {
    return failure(save, "candidate-invalid");
  }

  const hero = replaceOwnedItem(save.hero, found, pending.candidate);
  if (!hero) return failure(save, "item-not-found");
  const nextSave = {
    ...save,
    hero,
    economy: { ...economy, pendingReforge: null },
  };
  return {
    save: nextSave,
    ok: true,
    reason: null,
    choice: "replace",
    item: pending.candidate,
    cost: pending.cost,
  };
}

export function getPendingReforge(save) {
  if (!hasUsableHero(save)) return null;
  const economy = sanitizeEconomy(save.economy, save);
  if (!economy.pendingReforge) return null;
  const original = findOwnedItem(save.hero, economy.pendingReforge.target)?.item ?? null;
  return original
    ? { ...economy.pendingReforge, original }
    : null;
}

export const buyShopItem = purchaseShopItem;
export const keepReforge = (save) => resolveReforge(save, "keep");
export const acceptReforge = (save) => resolveReforge(save, "replace");

function refreshShopWithEconomy(save, economy, victories) {
  const rotation = Math.min(MAX_COUNTER, economy.shop.rotation + 1);
  const stockSize = getShopStockLimit();
  const floor = getShopFloor(save);
  const stock = [];
  const seenItemIds = collectOwnedItemIds(save.hero);

  for (let index = 0; index < stockSize; index += 1) {
    const forcedSlot = EQUIPMENT_SLOT_IDS[index % EQUIPMENT_SLOT_IDS.length];
    const seed = `shop|${save.hero.classId ?? "hero"}|${rotation}|${floor}|${index}`;
    const generated = generateLoot(floor, seed, save.hero, {
      forcedSlot,
      idPrefix: "shop",
      classId: save.hero.classId,
    });
    if (!generated) continue;
    const uniqueId = `shop-${rotation}-${index}-${hashSeed(`${seed}|${generated.id}`).toString(16)}`;
    const item = withCanonicalPower({ ...generated, id: uniqueId });
    if (!item || seenItemIds.has(item.id)) continue;
    seenItemIds.add(item.id);
    stock.push({
      listingId: createListingId(rotation, index, item),
      item,
    });
  }

  const shop = {
    initialized: true,
    rotation,
    lastRefreshVictory: victories,
    stock,
  };
  const nextSave = {
    ...save,
    economy: { ...economy, shop },
  };
  return {
    save: nextSave,
    ok: true,
    reason: null,
    refreshed: true,
    shop,
  };
}

function sanitizePendingReforge(candidate, hero) {
  if (!isRecord(candidate)) return null;
  const target = normalizeTarget(candidate.target ?? candidate);
  const candidateItem = withCanonicalPower(candidate.candidate ?? candidate.item);
  if (!target || !candidateItem || candidateItem.id !== target.itemId) return null;
  const found = hero ? findOwnedItem(hero, target) : null;
  if (hero && !found) return null;
  if (found && !sameImmutableItem(found.item, candidateItem)) return null;
  const originalFingerprint = safeString(
    candidate.originalFingerprint,
    found ? fingerprintItem(found.item) : "",
    100,
  );
  if (!originalFingerprint) return null;
  return {
    target: found ? createResolvedTarget(found) : target,
    candidate: candidateItem,
    cost: clampInteger(candidate.cost, 1, MAX_COUNTER, 1),
    seed: normalizeSeed(candidate.seed, `reforge|${target.itemId}`),
    originalFingerprint,
  };
}

function findOwnedItem(hero, target) {
  if (!isRecord(hero)) return null;
  const normalized = normalizeTarget(target);
  if (!normalized) return null;
  const inventory = Array.isArray(hero.inventory) ? hero.inventory : [];

  if (normalized.location === "inventory" || normalized.location === "any") {
    const index = inventory.findIndex((item) => item?.id === normalized.itemId);
    const item = index >= 0 ? sanitizeItem(inventory[index]) : null;
    if (item) return { item, location: "inventory", index, slot: null };
  }

  if (normalized.location === "equipment" || normalized.location === "any") {
    const slots = normalized.slot ? [normalized.slot] : EQUIPMENT_SLOT_IDS;
    for (const slot of slots) {
      const item = sanitizeItem(hero.equipment?.[slot], { forcedSlot: slot });
      if (item?.id === normalized.itemId) {
        return { item, location: "equipment", index: null, slot };
      }
    }
  }
  return null;
}

function replaceOwnedItem(hero, found, item) {
  const replacement = sanitizeItem(item);
  if (!replacement || !isRecord(hero)) return null;
  if (found.location === "inventory") {
    const inventory = Array.isArray(hero.inventory) ? [...hero.inventory] : [];
    if (!inventory[found.index] || inventory[found.index].id !== found.item.id) return null;
    inventory[found.index] = replacement;
    return { ...hero, inventory };
  }
  if (found.location === "equipment" && EQUIPMENT_SLOT_IDS.includes(found.slot)) {
    if (hero.equipment?.[found.slot]?.id !== found.item.id) return null;
    return {
      ...hero,
      equipment: { ...hero.equipment, [found.slot]: replacement },
    };
  }
  return null;
}

function normalizeTarget(target) {
  if (typeof target === "string") {
    const itemId = safeString(target, "", 100);
    return itemId ? { location: "any", itemId } : null;
  }
  if (!isRecord(target)) return null;
  const itemId = safeString(target.itemId ?? target.id, "", 100);
  if (!itemId) return null;
  const requestedLocation = target.location ?? target.source ?? "any";
  const location = VALID_TARGET_LOCATIONS.has(requestedLocation)
    ? requestedLocation
    : "any";
  const slot = EQUIPMENT_SLOT_IDS.includes(target.slot) ? target.slot : null;
  return {
    location,
    itemId,
    ...(location === "equipment" && slot ? { slot } : {}),
  };
}

function createResolvedTarget(found) {
  return {
    location: found.location,
    itemId: found.item.id,
    ...(found.location === "equipment" ? { slot: found.slot } : {}),
  };
}

function sameImmutableItem(left, right) {
  const first = sanitizeItem(left);
  const second = sanitizeItem(right);
  if (!first || !second) return false;
  return JSON.stringify(readImmutableItemFields(first))
    === JSON.stringify(readImmutableItemFields(second));
}

function readImmutableItemFields(item) {
  return {
    id: item.id,
    emoji: item.emoji,
    slot: item.slot,
    rarity: item.rarity,
    level: item.level,
    baseStats: item.baseStats,
    effect: item.effect,
    seed: item.seed,
  };
}

function fingerprintItem(item) {
  const clean = sanitizeItem(item);
  return clean
    ? `item-${hashSeed(JSON.stringify(clean)).toString(16)}`
    : "";
}

function withCanonicalPower(item) {
  const clean = sanitizeItem(item);
  return clean
    ? sanitizeItem({ ...clean, power: calculateItemPower(clean) })
    : null;
}

function collectOwnedItemIds(hero) {
  const ids = new Set();
  if (!isRecord(hero)) return ids;
  for (const item of Array.isArray(hero.inventory) ? hero.inventory : []) {
    if (typeof item?.id === "string") ids.add(item.id);
  }
  for (const item of Object.values(isRecord(hero.equipment) ? hero.equipment : {})) {
    if (typeof item?.id === "string") ids.add(item.id);
  }
  return ids;
}

function getShopFloor(save) {
  const raw = save.progress?.highestUnlockedFloor ?? CONFIG.dungeon.minFloor;
  return clampInteger(
    raw,
    CONFIG.dungeon.minFloor,
    CONFIG.dungeon.maxFloor,
    CONFIG.dungeon.minFloor,
  );
}

function getShopStockLimit() {
  return clampInteger(
    CONFIG.economy?.shop?.stockSize,
    1,
    20,
    EQUIPMENT_SLOT_IDS.length,
  );
}

function getShopRefreshInterval() {
  return clampInteger(
    CONFIG.economy?.shop?.refreshEveryVictories,
    1,
    MAX_COUNTER,
    1,
  );
}

function getInventoryLimit() {
  return clampInteger(CONFIG.save?.maxInventoryItems, 1, MAX_COUNTER, 60);
}

function createListingId(rotation, index, item) {
  return `listing-${rotation}-${index}-${hashSeed(item?.id ?? index).toString(16)}`;
}

function getContextHero(context) {
  if (isRecord(context?.hero)) return context.hero;
  if (isRecord(context?.save?.hero)) return context.save.hero;
  return null;
}

function getContextProgress(context) {
  if (isRecord(context?.progress)) return context.progress;
  if (isRecord(context?.save?.progress)) return context.save.progress;
  return {};
}

function readTotalVictories(progress) {
  return clampInteger(progress?.totalVictories, 0, MAX_COUNTER, 0);
}

function withEconomy(save, economy) {
  return { ...save, economy };
}

function hasUsableHero(save) {
  return isRecord(save) && isRecord(save.hero);
}

function failure(save, reason) {
  return { save, ok: false, reason };
}

function normalizeReforgeChoice(choice) {
  if (choice === true) return "replace";
  if (choice === false) return "keep";
  if (["replace", "accept", "new"].includes(choice)) return "replace";
  if (["keep", "reject", "old", "cancel"].includes(choice)) return "keep";
  return null;
}

function normalizeSeed(seed, fallback) {
  if (typeof seed === "number" && Number.isFinite(seed)) return String(seed);
  if (typeof seed === "string" && seed.length > 0) return seed.slice(0, 120);
  return fallback.slice(0, 120);
}

function clampPrice(value, minimum) {
  const rounded = Number.isFinite(value) ? Math.round(value) : minimum;
  return clampInteger(rounded, minimum, MAX_COUNTER, minimum);
}

function positiveInteger(value, fallback) {
  return clampInteger(value, 1, MAX_COUNTER, fallback);
}

function nonNegativeInteger(value) {
  return clampInteger(value, 0, MAX_COUNTER, 0);
}

function clampInteger(value, min, max, fallback) {
  return Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.floor(value)))
    : fallback;
}

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function safeString(value, fallback, maxLength) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : fallback;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export { calculateItemPower };
