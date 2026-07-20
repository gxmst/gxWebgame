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
import {
  createDefaultOutdoorState,
  sanitizeOutdoorState,
} from "./outdoor.js";
import {
  createDefaultWorldState,
  sanitizeWorldState,
  syncWorldProgress,
} from "./world.js";
import { canPrestige, prestigeHero } from "./skills.js";

export const DEFAULT_SAVE_KEY = CONFIG.save.key;

const DEFAULT_MAX_CHARACTERS = 8;
const MAX_CHARACTER_ID_LENGTH = 80;
const ACTIVE_PROJECTION_KEYS = [
  "hero",
  "progress",
  "economy",
  "outdoor",
  "world",
  "pendingBattle",
];
const NORMALIZED_SAVE = Symbol("normalized-save");

/**
 * Canonical v3 save shape:
 * { version, characters:[{id,name,hero,progress,economy,outdoor,world,pendingBattle}],
 *   activeCharacterId, settings }
 *
 * Enumerable hero/progress/economy/outdoor/world/pendingBattle accessors project
 * the active character for compatibility with the v2 game/economy APIs. saveSave()
 * writes only the canonical fields; ordinary JSON snapshots retain aliases so
 * legacy helper code that parses them directly still has the expected shape.
 */
export function createDefaultSave() {
  const character = createDefaultCharacter({ id: "character-1" });
  return attachActiveProjection({
    version: CONFIG.save.version,
    characters: [character],
    activeCharacterId: character.id,
    settings: createDefaultSettings(),
  });
}

/** Creates one isolated character record without adding it to a save. */
export function createDefaultCharacter(options = {}) {
  const classId = Object.hasOwn(CONFIG.classes, options.classId)
    ? options.classId
    : CONFIG.hero.classId;
  const hero = options.classChosen === true
    ? createHeroForClass(classId, { classChosen: true })
    : createDefaultHero(classId);
  const name = safeString(options.name, hero.name, 30);
  const namedHero = sanitizeHero({ ...hero, name });
  const id = safeString(options.id, "character-1", MAX_CHARACTER_ID_LENGTH);
  const progress = createDefaultProgress();
  return {
    id,
    name: namedHero.name,
    hero: namedHero,
    progress,
    economy: createDefaultEconomy(),
    outdoor: createDefaultOutdoorState(),
    world: createDefaultWorldState({
      highestUnlockedFloor: progress.highestUnlockedFloor,
    }),
    // Refreshing during combat settles only this character as a retreat.
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
    storage.setItem(key, JSON.stringify(toCanonicalSave(sanitizeSave(save))));
    return true;
  } catch {
    return false;
  }
}

/** Migrates v1/v2 single-character data and drops unknown fields. */
export function sanitizeSave(candidate) {
  const source = isRecord(candidate) ? candidate : {};
  const rawCharacterList = Array.isArray(source.characters)
    ? source.characters.filter(isRecord)
    : [];
  const hasCharacterList = rawCharacterList.length > 0;
  const usedIds = new Set();
  let characters;

  if (hasCharacterList) {
    characters = rawCharacterList
      .slice(0, getMaxCharacters())
      .map((entry, index) => sanitizeCharacterRecord(entry, index, usedIds));
  } else {
    characters = [sanitizeLegacyCharacter(source, usedIds)];
  }
  if (characters.length === 0) characters = [createDefaultCharacter()];

  const requestedActiveId = safeString(
    source.activeCharacterId ?? source.currentCharacterId ?? source.selectedCharacterId,
    "",
    MAX_CHARACTER_ID_LENGTH,
  );
  let activeCharacterId = characters.some((entry) => entry.id === requestedActiveId)
    ? requestedActiveId
    : characters[0].id;

  // v2-compatible helpers spread the projected aliases and may replace one of
  // them. Sync those values only when the projection still names this active
  // character, otherwise a manual id switch could overwrite the destination.
  const projectedCharacterId = safeString(source.characterId, "", MAX_CHARACTER_ID_LENGTH);
  const hasProjectedValues = ACTIVE_PROJECTION_KEYS.some((key) => Object.hasOwn(source, key));
  const projectionMatches = hasCharacterList
    && hasProjectedValues
    && !isNormalizedSave(source)
    && (projectedCharacterId === activeCharacterId
      || (!projectedCharacterId && requestedActiveId === activeCharacterId));
  if (projectionMatches) {
    const index = characters.findIndex((entry) => entry.id === activeCharacterId);
    characters[index] = synchronizeProjectedCharacter(characters[index], source);
    activeCharacterId = characters[index].id;
  }

  const rawSettings = isRecord(source.settings) ? source.settings : {};
  return attachActiveProjection({
    version: CONFIG.save.version,
    characters,
    activeCharacterId,
    settings: {
      autoAllocate: booleanOr(
        rawSettings.autoAllocate ?? source.autoAllocate,
        true,
      ),
      battleSpeed: [1, 2, 3].includes(rawSettings.battleSpeed)
        ? rawSettings.battleSpeed
        : 1,
      soundEnabled: booleanOr(
        rawSettings.soundEnabled ?? source.soundEnabled,
        true,
      ),
    },
  });
}

/** Returns the active character record; callers get a defensive copy by default. */
export function getActiveCharacter(save, options = {}) {
  const current = save?.[NORMALIZED_SAVE] === true ? save : sanitizeSave(save);
  const active = findActiveCharacter(current);
  if (!active || options.clone === false) return active ?? null;
  return sanitizeCharacterRecord(active, 0, new Set());
}

/** Reconciles v2-style top-level aliases and returns a normalized projected save. */
export function projectActiveCharacter(save) {
  return sanitizeSave(save);
}

/** Immutably updates only the active character, preserving every other record. */
export function updateActiveCharacter(save, updaterOrPatch) {
  const current = sanitizeSave(save);
  const active = findActiveCharacter(current);
  if (!active) return current;
  const draft = sanitizeCharacterRecord(active, 0, new Set());
  const produced = typeof updaterOrPatch === "function"
    ? updaterOrPatch(draft)
    : updaterOrPatch;
  const returnedPatch = isRecord(produced) ? produced : null;
  const patch = returnedPatch ?? draft;
  const candidate = { ...draft, ...patch, id: active.id };
  if (returnedPatch) {
    const nameChanged = Object.hasOwn(returnedPatch, "name")
      && returnedPatch.name !== active.name;
    const heroNameChanged = isRecord(returnedPatch.hero)
      && returnedPatch.hero.name !== active.hero.name;
    if (nameChanged && isRecord(candidate.hero)) {
      candidate.hero = { ...candidate.hero, name: returnedPatch.name };
    } else if (heroNameChanged) {
      candidate.name = returnedPatch.hero.name;
    }
  } else if (!returnedPatch && isRecord(candidate.hero)) {
    if (draft.name !== active.name) {
      candidate.hero = { ...candidate.hero, name: draft.name };
    } else {
      candidate.name = candidate.hero.name;
    }
  }
  const usedIds = new Set(current.characters
    .filter((entry) => entry.id !== active.id)
    .map((entry) => entry.id));
  const replacement = sanitizeCharacterRecord(candidate, 0, usedIds);
  const characters = current.characters.map((entry) => (
    entry.id === active.id ? replacement : entry
  ));
  return rebuildSave(current, characters);
}

/** Adds and selects a fresh character. Returns a structured success/failure result. */
export function createCharacter(save, options = {}, characterName = undefined) {
  const current = sanitizeSave(save);
  const input = typeof options === "string"
    ? { classId: options, name: characterName }
    : options;
  if (!isRecord(input) || !Object.hasOwn(CONFIG.classes, input.classId)) {
    return characterFailure(current, "invalid-class");
  }
  const placeholder = current.characters.length === 1
    && current.characters[0].hero.classChosen !== true
    ? current.characters[0]
    : null;
  if (!placeholder && current.characters.length >= getMaxCharacters()) {
    return characterFailure(current, "character-limit");
  }

  const id = placeholder?.id ?? createNextCharacterId(current.characters);
  const character = createDefaultCharacter({
    id,
    classId: input.classId,
    classChosen: true,
    name: input.name,
  });
  const characters = placeholder ? [character] : [...current.characters, character];
  const next = rebuildSave(
    current,
    characters,
    input.activate === false ? current.activeCharacterId : character.id,
  );
  return {
    save: next,
    ok: true,
    reason: null,
    character: sanitizeCharacterRecord(character, 0, new Set()),
  };
}

/** Selects an existing character without touching either character's state. */
export function switchCharacter(save, characterId) {
  const current = sanitizeSave(save);
  const id = safeString(characterId, "", MAX_CHARACTER_ID_LENGTH);
  const character = current.characters.find((entry) => entry.id === id);
  if (!character) return characterFailure(current, "character-not-found");
  const next = rebuildSave(current, current.characters, id);
  return {
    save: next,
    ok: true,
    reason: null,
    character: getActiveCharacter(next),
  };
}

/** Deletes one character. At least one record is retained for legacy game code. */
export function deleteCharacter(save, characterId) {
  const current = sanitizeSave(save);
  const id = safeString(characterId, "", MAX_CHARACTER_ID_LENGTH);
  if (!current.characters.some((entry) => entry.id === id)) {
    return characterFailure(current, "character-not-found");
  }
  if (current.characters.length <= 1) return characterFailure(current, "last-character");

  const characters = current.characters.filter((entry) => entry.id !== id);
  const activeCharacterId = current.activeCharacterId === id
    ? characters[0].id
    : current.activeCharacterId;
  const next = rebuildSave(current, characters, activeCharacterId);
  return {
    save: next,
    ok: true,
    reason: null,
    deletedCharacterId: id,
    character: getActiveCharacter(next),
  };
}

/** Stores a battle marker on the active character and stamps its owner id. */
export function setPendingBattle(save, battle) {
  return updateActiveCharacter(save, (active) => ({
    ...active,
    pendingBattle: sanitizePendingBattle(battle, active.id),
  }));
}

export function clearPendingBattle(save) {
  return setPendingBattle(save, null);
}

export function getCharacterLimit() {
  return getMaxCharacters();
}

/**
 * Applies rewards, loot and floor unlocks immutably. Supported aliases include
 * xp/experience, gold, loot/item, and floorId/floor/wave.floorId.
 */
export function applyVictory(save, result = {}) {
  const next = sanitizeSave(save);
  const source = normalizeResult(result);
  if (!resultMatchesActiveCharacter(next, source)) return next;
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
  next.world = syncWorldProgress(next.world, next.progress);
  return projectActiveCharacter(ensureShop(next).save);
}

/** Starts a fresh run with one chosen class while preserving user settings. */
export function selectStartingClass(save, classId) {
  if (!Object.hasOwn(CONFIG.classes, classId)) return sanitizeSave(save);
  const current = sanitizeSave(save);
  const active = getActiveCharacter(current, { clone: false });
  if (!active) return current;
  const hero = createHeroForClass(classId, { classChosen: true });
  const progress = createDefaultProgress();
  const replacement = {
    ...active,
    name: hero.name,
    hero,
    progress,
    economy: createDefaultEconomy(),
    outdoor: createDefaultOutdoorState(),
    world: createDefaultWorldState({
      highestUnlockedFloor: progress.highestUnlockedFloor,
    }),
    pendingBattle: null,
  };
  return rebuildSave(current, current.characters.map((entry) => (
    entry.id === active.id ? replacement : entry
  )));
}

/** Applies a complete prestige transaction without touching equipment or progress. */
export function applyPrestige(save) {
  const current = sanitizeSave(save);
  if (!canPrestige(current.hero)) return current;
  return updateActiveCharacter(current, (active) => ({
    ...active,
    hero: prestigeHero(active.hero),
    pendingBattle: null,
  }));
}

/** Applies defeat or retreat loss without mutating or reducing hero level. */
export function applyDefeat(save, result = {}) {
  const next = sanitizeSave(save);
  const source = normalizeResult(result);
  if (!resultMatchesActiveCharacter(next, source)) return next;
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
  return projectActiveCharacter(next);
}

/** Routes a completed combat result to victory/defeat handling. */
export function applyBattleResult(save, result = {}) {
  const source = normalizeResult(result);
  const current = sanitizeSave(save);
  if (!resultMatchesActiveCharacter(current, source)) return current;
  const victory = source.victory === true
    || source.won === true
    || ["victory", "win", "won"].includes(source.outcome)
    || ["player", "hero"].includes(source.winner);
  return victory ? applyVictory(current, source) : applyDefeat(current, source);
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

function createDefaultSettings() {
  return { autoAllocate: true, battleSpeed: 1, soundEnabled: true };
}

export function createDefaultProgress() {
  return {
    highestUnlockedFloor: CONFIG.dungeon.minFloor,
    clearedFloors: [],
    totalVictories: 0,
    totalDefeats: 0,
  };
}

export function createDefaultOutdoor() {
  return createDefaultOutdoorState();
}

function sanitizeLegacyCharacter(source, usedIds) {
  const fallback = createDefaultCharacter({ id: "character-1" });
  const rawHero = firstRecord(source.hero, source.character, source.player)
    ?? (hasLegacyHeroFields(source) ? source : fallback.hero);
  const hero = sanitizeHero(normalizeHeroInput(rawHero, source));
  const id = uniqueCharacterId("character-1", usedIds, 0);
  const progress = sanitizeProgress(
    firstRecord(source.progress, source.dungeon),
    source,
  );
  return {
    id,
    name: hero.name,
    hero,
    progress,
    economy: sanitizeEconomy(source.economy, { hero, progress }),
    outdoor: sanitizeOutdoorState(source.outdoor),
    world: sanitizeWorldState(
      firstRecord(source.world),
      progress,
    ),
    pendingBattle: sanitizePendingBattle(source.pendingBattle, id),
  };
}

function sanitizeCharacterRecord(candidate, index, usedIds = new Set()) {
  const source = isRecord(candidate) ? candidate : {};
  const rawHero = firstRecord(source.hero, source.character, source.player)
    ?? (hasLegacyHeroFields(source) ? source : createDefaultHero());
  const heroInput = normalizeHeroInput(rawHero, source);
  const hero = sanitizeHero(heroInput);
  const id = uniqueCharacterId(
    source.id ?? `character-${index + 1}`,
    usedIds,
    index,
  );
  const progress = sanitizeProgress(
    firstRecord(source.progress, source.dungeon),
    source,
  );
  const name = safeString(source.name, hero.name, 30);
  const namedHero = hero.name === name ? hero : sanitizeHero({ ...hero, name });
  return {
    id,
    name: namedHero.name,
    hero: namedHero,
    progress,
    economy: sanitizeEconomy(source.economy, { hero: namedHero, progress }),
    outdoor: sanitizeOutdoorState(source.outdoor),
    world: sanitizeWorldState(
      firstRecord(source.world),
      progress,
    ),
    pendingBattle: sanitizePendingBattle(source.pendingBattle, id),
  };
}

function normalizeHeroInput(rawHero, rootSource = {}) {
  const hero = isRecord(rawHero) ? rawHero : {};
  return {
    ...hero,
    gold: Number.isFinite(hero.gold) ? hero.gold : rootSource.gold,
    inventory: hero.inventory
      ?? hero.backpack
      ?? rootSource.inventory
      ?? rootSource.backpack,
    equipment: hero.equipment
      ?? hero.gear
      ?? rootSource.equipment
      ?? rootSource.gear,
  };
}

function sanitizeProgress(value, aliases = {}) {
  const rawProgress = isRecord(value) ? value : {};
  const clearedFloors = sanitizeFloorList(
    rawProgress.clearedFloors ?? aliases.clearedFloors,
  );
  const highestFromSave = clampInteger(
    rawProgress.highestUnlockedFloor
      ?? rawProgress.unlockedFloor
      ?? aliases.highestUnlockedFloor
      ?? aliases.unlockedFloor
      ?? aliases.maxUnlockedFloor,
    CONFIG.dungeon.minFloor,
    CONFIG.dungeon.maxFloor,
    CONFIG.dungeon.minFloor,
  );
  const highestFromClears = clearedFloors.length > 0
    ? Math.min(CONFIG.dungeon.maxFloor, clearedFloors.at(-1) + 1)
    : CONFIG.dungeon.minFloor;
  return {
    highestUnlockedFloor: Math.max(highestFromSave, highestFromClears),
    clearedFloors,
    totalVictories: clampInteger(
      rawProgress.totalVictories ?? aliases.totalVictories ?? aliases.victories,
      0,
      Number.MAX_SAFE_INTEGER,
      0,
    ),
    totalDefeats: clampInteger(
      rawProgress.totalDefeats ?? aliases.totalDefeats ?? aliases.defeats,
      0,
      Number.MAX_SAFE_INTEGER,
      0,
    ),
  };
}

function synchronizeProjectedCharacter(character, source) {
  const projectedHero = Object.hasOwn(source, "hero")
    ? sanitizeHero(normalizeHeroInput(source.hero, source))
    : character.hero;
  const progress = Object.hasOwn(source, "progress")
    ? sanitizeProgress(source.progress, source)
    : character.progress;
  const name = projectedHero.name;
  const hero = projectedHero;
  return {
    ...character,
    name,
    hero,
    progress,
    economy: Object.hasOwn(source, "economy")
      ? sanitizeEconomy(source.economy, { hero, progress })
      : sanitizeEconomy(character.economy, { hero, progress }),
    outdoor: Object.hasOwn(source, "outdoor")
      ? sanitizeOutdoorState(source.outdoor)
      : sanitizeOutdoorState(character.outdoor),
    world: Object.hasOwn(source, "world")
      ? sanitizeWorldState(source.world, progress)
      : sanitizeWorldState(character.world, progress),
    pendingBattle: Object.hasOwn(source, "pendingBattle")
      ? sanitizePendingBattle(source.pendingBattle, character.id)
      : sanitizePendingBattle(character.pendingBattle, character.id),
  };
}

function rebuildSave(current, characters, activeCharacterId = current.activeCharacterId) {
  return sanitizeSave({
    version: CONFIG.save.version,
    characters,
    activeCharacterId,
    settings: { ...current.settings },
  });
}

function findActiveCharacter(save) {
  if (!isRecord(save) || !Array.isArray(save.characters)) return null;
  return save.characters.find((entry) => entry.id === save.activeCharacterId)
    ?? save.characters[0]
    ?? null;
}

function isNormalizedSave(value) {
  return value?.[NORMALIZED_SAVE] === true;
}

function attachActiveProjection(save) {
  Object.defineProperty(save, NORMALIZED_SAVE, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  Object.defineProperty(save, "characterId", {
    enumerable: true,
    configurable: true,
    get: () => findActiveCharacter(save)?.id ?? null,
    // This marker is informational; changing it must not switch characters.
    set: () => {},
  });

  for (const key of ACTIVE_PROJECTION_KEYS) {
    Object.defineProperty(save, key, {
      enumerable: true,
      configurable: true,
      get: () => findActiveCharacter(save)?.[key] ?? null,
      set: (value) => {
        const active = findActiveCharacter(save);
        if (!active) return;
        if (key === "pendingBattle") {
          active.pendingBattle = sanitizePendingBattle(value, active.id);
          return;
        }
        active[key] = value;
        if (key === "hero" && isRecord(value) && typeof value.name === "string") {
          active.name = value.name;
        }
      },
    });
  }

  Object.defineProperty(save, "toJSON", {
    enumerable: false,
    configurable: true,
    value() {
      return {
        ...toCanonicalSave(save),
        characterId: save.characterId,
        hero: save.hero,
        progress: save.progress,
        economy: save.economy,
        outdoor: save.outdoor,
        world: save.world,
        pendingBattle: save.pendingBattle,
      };
    },
  });
  return save;
}

function toCanonicalSave(save) {
  return {
    version: save.version,
    characters: save.characters,
    activeCharacterId: save.activeCharacterId,
    settings: save.settings,
  };
}

function resultMatchesActiveCharacter(save, result) {
  const marker = result.characterId
    ?? result.ownerCharacterId
    ?? result.pendingBattle?.characterId
    ?? result.battle?.characterId;
  if (marker === undefined || marker === null || marker === "") return true;
  return safeString(marker, "", MAX_CHARACTER_ID_LENGTH) === save.activeCharacterId;
}

function characterFailure(save, reason) {
  return { save, ok: false, reason };
}

function getMaxCharacters() {
  return clampInteger(
    CONFIG.save?.maxCharacters
      ?? CONFIG.save?.maxCharacterCount
      ?? CONFIG.save?.characterLimit,
    1,
    50,
    DEFAULT_MAX_CHARACTERS,
  );
}

function createNextCharacterId(characters) {
  let counter = 1;
  const ids = new Set(characters.map((entry) => entry.id));
  while (ids.has(`character-${counter}`)) counter += 1;
  return `character-${counter}`;
}

function uniqueCharacterId(value, usedIds, index) {
  const base = safeString(value, `character-${index + 1}`, MAX_CHARACTER_ID_LENGTH);
  let id = base;
  let suffix = 2;
  while (usedIds.has(id)) {
    const suffixText = `-${suffix}`;
    id = `${base.slice(0, MAX_CHARACTER_ID_LENGTH - suffixText.length)}${suffixText}`;
    suffix += 1;
  }
  usedIds.add(id);
  return id;
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

function sanitizePendingBattle(value, characterId = null) {
  if (!isRecord(value)) return null;
  const owner = safeString(characterId, "", MAX_CHARACTER_ID_LENGTH);
  const embeddedOwner = safeString(value.characterId, "", MAX_CHARACTER_ID_LENGTH);
  if (owner && embeddedOwner && owner !== embeddedOwner) return null;
  const floorId = getFloor(value.floorId)?.id ?? null;
  if (floorId === null || typeof value.seed !== "string" || value.seed.length === 0) return null;
  return {
    ...(owner || embeddedOwner ? { characterId: owner || embeddedOwner } : {}),
    floorId,
    seed: value.seed.slice(0, 120),
    startedAt: Number.isFinite(value.startedAt) ? Math.max(0, Math.floor(value.startedAt)) : null,
  };
}

function safeString(value, fallback, maxLength) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : fallback;
}
