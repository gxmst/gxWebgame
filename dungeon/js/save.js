import { CONFIG } from "./config.js";
import {
  addExperience,
  createDefaultHero,
  createHeroForClass,
  sanitizeHero,
  sanitizeItem,
} from "./hero.js";
import { getFloor } from "./dungeon.js";
import {
  createDefaultEconomy,
  ensureShop,
  sanitizeEconomy,
} from "./economy.js";
import { canPrestige, prestigeHero } from "./skills.js";

export const DEFAULT_SAVE_KEY = CONFIG.save.key;

/**
 * Save shape:
 * { version, hero,
 *   progress:{highestUnlockedFloor,clearedFloors,totalVictories,totalDefeats},
 *   settings:{autoAllocate,battleSpeed} }
 */
export function createDefaultSave() {
  return {
    version: CONFIG.save.version,
    hero: createDefaultHero(),
    progress: {
      highestUnlockedFloor: CONFIG.dungeon.minFloor,
      clearedFloors: [],
      totalVictories: 0,
      totalDefeats: 0,
    },
    settings: {
      autoAllocate: true,
      battleSpeed: 1,
    },
    economy: createDefaultEconomy(),
    // A marker makes a browser refresh during an active run count as a retreat.
    pendingBattle: null,
  };
}

/** Loads and sanitizes local data. Missing/blocked/broken storage never throws. */
export function loadSave(storage = getDefaultStorage(), key = DEFAULT_SAVE_KEY) {
  try {
    const serialized = storage?.getItem?.(key);
    if (!serialized) return createDefaultSave();
    return sanitizeSave(JSON.parse(serialized));
  } catch {
    return createDefaultSave();
  }
}

/** Writes only the recognized, JSON-safe schema and reports storage failure. */
export function saveSave(save, storage = getDefaultStorage(), key = DEFAULT_SAVE_KEY) {
  try {
    if (typeof storage?.setItem !== "function") return false;
    storage.setItem(key, JSON.stringify(sanitizeSave(save)));
    return true;
  } catch {
    return false;
  }
}

/** Migrates known prototype aliases and drops unknown fields. */
export function sanitizeSave(candidate) {
  const defaults = createDefaultSave();
  const source = isRecord(candidate) ? candidate : {};
  const rawHero = firstRecord(source.hero, source.character, source.player)
    ?? (hasLegacyHeroFields(source) ? source : defaults.hero);
  const heroInput = {
    ...rawHero,
    gold: Number.isFinite(rawHero.gold) ? rawHero.gold : source.gold,
    inventory: rawHero.inventory ?? rawHero.backpack ?? source.inventory ?? source.backpack,
    equipment: rawHero.equipment ?? rawHero.gear ?? source.equipment ?? source.gear,
  };
  const hero = sanitizeHero(heroInput);
  const rawProgress = firstRecord(source.progress, source.dungeon) ?? {};
  const clearedFloors = sanitizeFloorList(
    rawProgress.clearedFloors ?? source.clearedFloors,
  );
  const highestFromSave = clampInteger(
    rawProgress.highestUnlockedFloor
      ?? rawProgress.unlockedFloor
      ?? source.highestUnlockedFloor
      ?? source.unlockedFloor
      ?? source.maxUnlockedFloor,
    CONFIG.dungeon.minFloor,
    CONFIG.dungeon.maxFloor,
    CONFIG.dungeon.minFloor,
  );
  const highestFromClears = clearedFloors.length > 0
    ? Math.min(CONFIG.dungeon.maxFloor, clearedFloors.at(-1) + 1)
    : CONFIG.dungeon.minFloor;
  const progress = {
    highestUnlockedFloor: Math.max(highestFromSave, highestFromClears),
    clearedFloors,
    totalVictories: clampInteger(
      rawProgress.totalVictories ?? source.totalVictories ?? source.victories,
      0,
      Number.MAX_SAFE_INTEGER,
      0,
    ),
    totalDefeats: clampInteger(
      rawProgress.totalDefeats ?? source.totalDefeats ?? source.defeats,
      0,
      Number.MAX_SAFE_INTEGER,
      0,
    ),
  };
  const rawSettings = isRecord(source.settings) ? source.settings : {};
  const pendingBattle = sanitizePendingBattle(source.pendingBattle);
  const economy = sanitizeEconomy(source.economy, { hero, progress });

  return {
    version: CONFIG.save.version,
    hero,
    progress,
    settings: {
      autoAllocate: booleanOr(
        rawSettings.autoAllocate ?? source.autoAllocate,
        defaults.settings.autoAllocate,
      ),
      battleSpeed: [1, 2, 3].includes(rawSettings.battleSpeed)
        ? rawSettings.battleSpeed
        : defaults.settings.battleSpeed,
    },
    economy,
    pendingBattle,
  };
}

/**
 * Applies rewards, loot and floor unlocks immutably. Supported aliases include
 * xp/experience, gold, loot/item, and floorId/floor/wave.floorId.
 */
export function applyVictory(save, result = {}) {
  const next = sanitizeSave(save);
  const source = normalizeResult(result);
  const experience = readReward(source, ["experience", "xp", "experienceReward", "rewardXp"]);
  const gold = readReward(source, ["gold", "goldReward", "rewardGold"]);
  next.hero = addExperience(next.hero, experience, {
    autoAllocate: next.settings.autoAllocate,
  });
  next.hero.gold = safeAdd(next.hero.gold, gold);

  const rawLoot = source.loot
    ?? source.items
    ?? source.item
    ?? source.rewards?.loot
    ?? source.rewards?.items
    ?? source.rewards?.item;
  const loot = (Array.isArray(rawLoot) ? rawLoot : rawLoot ? [rawLoot] : [])
    .map((item) => sanitizeItem(item))
    .filter(Boolean);
  const availableSpace = Math.max(
    0,
    CONFIG.save.maxInventoryItems - next.hero.inventory.length,
  );
  next.hero.inventory.push(...loot.slice(0, availableSpace));

  const floorId = readFloorId(source);
  if (floorId !== null) {
    if (!next.progress.clearedFloors.includes(floorId)) {
      next.progress.clearedFloors.push(floorId);
      next.progress.clearedFloors.sort((a, b) => a - b);
    }
    next.progress.highestUnlockedFloor = Math.max(
      next.progress.highestUnlockedFloor,
      Math.min(CONFIG.dungeon.maxFloor, floorId + 1),
    );
  }
  next.progress.totalVictories = safeAdd(next.progress.totalVictories, 1);
  return ensureShop(next).save;
}

/** Starts a fresh run with one chosen class while preserving user settings. */
export function selectStartingClass(save, classId) {
  if (!Object.hasOwn(CONFIG.classes, classId)) return sanitizeSave(save);
  const current = sanitizeSave(save);
  const fresh = createDefaultSave();
  fresh.settings = { ...current.settings };
  fresh.hero = createHeroForClass(classId, { classChosen: true });
  return fresh;
}

/** Applies a complete prestige transaction without touching equipment or progress. */
export function applyPrestige(save) {
  const current = sanitizeSave(save);
  if (!canPrestige(current.hero)) return current;
  return sanitizeSave({
    ...current,
    hero: prestigeHero(current.hero),
    pendingBattle: null,
  });
}

/** Applies defeat or retreat loss without mutating or reducing hero level. */
export function applyDefeat(save, result = {}) {
  const next = sanitizeSave(save);
  const source = normalizeResult(result);
  const retreat = source.retreat === true
    || source.reason === "retreat"
    || source.outcome === "retreat";
  const penalty = getDefeatPenalty(next, retreat);
  const experienceLoss = Number.isFinite(source.experienceLoss)
    ? clampInteger(source.experienceLoss, 0, next.hero.experience, 0)
    : penalty.experience;
  const goldLoss = Number.isFinite(source.goldLoss)
    ? clampInteger(source.goldLoss, 0, next.hero.gold, 0)
    : penalty.gold;
  next.hero.experience = Math.max(0, next.hero.experience - experienceLoss);
  next.hero.gold = Math.max(0, next.hero.gold - goldLoss);
  next.progress.totalDefeats = safeAdd(next.progress.totalDefeats, 1);
  return next;
}

/** Routes a completed combat result to victory/defeat handling. */
export function applyBattleResult(save, result = {}) {
  const source = normalizeResult(result);
  const victory = source.victory === true
    || source.won === true
    || ["victory", "win", "won"].includes(source.outcome)
    || ["player", "hero"].includes(source.winner);
  return victory ? applyVictory(save, source) : applyDefeat(save, source);
}

export function getDefeatPenalty(saveOrHero, retreat = false) {
  const hero = isRecord(saveOrHero?.hero)
    ? sanitizeHero(saveOrHero.hero)
    : sanitizeHero(saveOrHero);
  const rates = retreat ? CONFIG.penalties.retreat : CONFIG.penalties.defeat;
  return {
    experience: Math.min(
      hero.experience,
      Math.floor(hero.experience * rates.experienceLossRate),
    ),
    gold: Math.min(hero.gold, Math.floor(hero.gold * rates.goldLossRate)),
    experienceRate: rates.experienceLossRate,
    goldRate: rates.goldLossRate,
  };
}

/** Resets progression while preserving the two user preferences. */
export function clearProgress(save) {
  const current = sanitizeSave(save);
  const fresh = createDefaultSave();
  fresh.settings = { ...current.settings };
  return fresh;
}

function normalizeResult(result) {
  if (Number.isFinite(result)) return { floorId: Math.floor(result) };
  return isRecord(result) ? result : {};
}

function readReward(source, keys) {
  for (const container of [source.rewards, source]) {
    if (!isRecord(container)) continue;
    for (const key of keys) {
      if (Number.isFinite(container[key])) {
        return clampInteger(container[key], 0, Number.MAX_SAFE_INTEGER, 0);
      }
    }
  }
  return 0;
}

function readFloorId(source) {
  const raw = source.floorId
    ?? source.wave?.floorId
    ?? source.floor?.id
    ?? source.floor;
  return getFloor(raw)?.id ?? null;
}

function sanitizeFloorList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((entry) => getFloor(entry)?.id ?? null)
    .filter((floor) => floor !== null))]
    .sort((a, b) => a - b);
}

function hasLegacyHeroFields(source) {
  return [
    "classId",
    "level",
    "experience",
    "xp",
    "baseStats",
    "attributes",
    "equipment",
    "inventory",
    "gold",
  ].some((key) => Object.hasOwn(source, key));
}

function getDefaultStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function firstRecord(...values) {
  return values.find(isRecord) ?? null;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeAdd(current, amount) {
  return Math.min(
    Number.MAX_SAFE_INTEGER,
    Math.max(0, Math.floor(Number.isFinite(current) ? current : 0))
      + Math.max(0, Math.floor(Number.isFinite(amount) ? amount : 0)),
  );
}

function clampInteger(value, min, max, fallback) {
  return Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.floor(value)))
    : fallback;
}

function booleanOr(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function sanitizePendingBattle(value) {
  if (!isRecord(value)) return null;
  const floorId = getFloor(value.floorId)?.id ?? null;
  if (floorId === null || typeof value.seed !== "string" || value.seed.length === 0) return null;
  return {
    floorId,
    seed: value.seed.slice(0, 120),
    startedAt: Number.isFinite(value.startedAt) ? Math.max(0, Math.floor(value.startedAt)) : null,
  };
}
