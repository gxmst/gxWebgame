import { CONFIG, createSeededRng, hashSeed } from "./config.js";

const MIN_FLOOR = finiteInteger(CONFIG.dungeon?.minFloor, 1);
const MAX_FLOOR = Math.max(MIN_FLOOR, finiteInteger(CONFIG.dungeon?.maxFloor, MIN_FLOOR));
const MAX_ENEMY_COUNT = 20;
const MAX_COMBAT_STAT = 1_000_000_000;
const MAX_SCALE = 1_000_000;
const MAX_REWARD = Number.MAX_SAFE_INTEGER;

export const FLOORS = Array.isArray(CONFIG.floors)
  ? CONFIG.floors
  : Array.isArray(CONFIG.dungeon?.floors)
    ? CONFIG.dungeon.floors
    : [];

/** Returns the immutable floor definition, or null for an unknown id. */
export function getFloor(id) {
  const floorId = normalizeFloorId(id);
  return floorId === null
    ? null
    : FLOORS.find((floor) => floor.id === floorId) ?? null;
}

/**
 * Returns the deepest floor this prestige count permits without mutating the
 * save's actual highestUnlockedFloor. Missing prestige config means no cap.
 */
export function getFloorCap(save) {
  const prestigeConfig = CONFIG.prestige && typeof CONFIG.prestige === "object"
    ? CONFIG.prestige
    : {};
  const initialCap = clampInteger(
    prestigeConfig.initialFloorCap,
    MIN_FLOOR,
    MAX_FLOOR,
    MAX_FLOOR,
  );
  const floorsPerCount = clampInteger(
    prestigeConfig.floorsPerCount,
    0,
    MAX_FLOOR,
    0,
  );
  const configuredMaxCount = clampInteger(
    prestigeConfig.maxCount,
    0,
    Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER,
  );
  const prestigeCount = Math.min(readPrestigeCount(save), configuredMaxCount);
  const addedFloors = Math.min(
    Number.MAX_SAFE_INTEGER - initialCap,
    prestigeCount * floorsPerCount,
  );
  return clampInteger(initialCap + addedFloors, MIN_FLOOR, MAX_FLOOR, initialCap);
}

/** Returns only floors selectable under both progression and prestige cap. */
export function getAvailableFloors(save) {
  const selectableThrough = Math.min(getHighestUnlockedFloor(save), getFloorCap(save));
  return FLOORS.filter((floor) => floor.id <= selectableThrough);
}

export function isFloorUnlocked(save, floor) {
  const definition = getFloor(floor);
  if (!definition) return false;
  const selectableThrough = Math.min(getHighestUnlockedFloor(save), getFloorCap(save));
  return definition.id <= selectableThrough;
}

export function getRecommendedPower(floor) {
  return getFloor(floor)?.recommendedPower ?? 0;
}

/**
 * Wave shape:
 * { floorId, seed, isBoss, enemies, rewards:{experience,gold,lootCount} }
 * Each enemy stores all volatile combat values inside `stats`, while reward
 * aliases remain at the root for simple combat engines.
 */
export function createEnemyWave(floor = MIN_FLOOR, seed = 0) {
  const definition = getFloor(floor) ?? FLOORS[0] ?? null;
  const stableSeed = normalizeSeed(seed);
  if (!definition) return createEmptyWave(MIN_FLOOR, stableSeed);

  const rng = createSeededRng(`${String(stableSeed)}|wave|${definition.id}`);
  const boss = isBossFloor(definition);
  const [configuredMin, configuredMax] = readEnemyCount(definition);
  const minCount = clampInteger(configuredMin, 0, MAX_ENEMY_COUNT, 0);
  const maxCount = clampInteger(configuredMax, minCount, MAX_ENEMY_COUNT, minCount);
  const count = boss ? 1 : rng.int(minCount, maxCount);
  const enemyPool = getEnemyPool(definition, boss);
  const enemies = [];

  for (let index = 0; index < count && enemyPool.length > 0; index += 1) {
    const templateId = rng.pick(enemyPool);
    const template = CONFIG.enemyTemplates?.[templateId];
    if (!template) continue;
    enemies.push(createEnemy(template, definition, index, stableSeed, rng, boss));
  }

  const rewards = enemies.reduce((total, enemy) => ({
    experience: safeAdd(total.experience, enemy.rewards.experience, MAX_REWARD),
    gold: safeAdd(total.gold, enemy.rewards.gold, MAX_REWARD),
    lootCount: 1,
  }), { experience: 0, gold: 0, lootCount: 1 });

  return {
    id: `wave-${definition.id}-${hashSeed(stableSeed).toString(16)}`,
    floorId: definition.id,
    floor: definition.id,
    name: definition.name,
    seed: stableSeed,
    isBoss: boss,
    enemies,
    rewards,
    experienceReward: rewards.experience,
    goldReward: rewards.gold,
  };
}

/** UI-friendly status without mutating the shared CONFIG floor object. */
export function getFloorStatus(save, floor) {
  const definition = getFloor(floor);
  if (!definition) return null;
  const highestUnlockedFloor = getHighestUnlockedFloor(save);
  const floorCap = getFloorCap(save);
  const cleared = getClearedFloorIds(save).includes(definition.id);
  return {
    ...definition,
    unlocked: definition.id <= Math.min(highestUnlockedFloor, floorCap),
    cleared,
    lockedByPrestige: definition.id <= highestUnlockedFloor && definition.id > floorCap,
    floorCap,
  };
}

function createEnemy(template, floor, index, stableSeed, rng, floorIsBoss) {
  const variance = clampNumber(CONFIG.dungeon?.enemyStatVariance, 0, 1, 0);
  const scales = getEnemyScales(floor);
  const stats = template.stats && typeof template.stats === "object" ? template.stats : {};
  const maxHp = rollStat(stats.maxHp, scales.hp, variance, rng, 1);
  const attack = rollStat(stats.attack, scales.attack, variance, rng, 1);
  const defense = rollStat(stats.defense, scales.defense, variance, rng, 0);
  const speed = rollStat(stats.speed, scales.speed, variance * 0.4, rng, 1);
  const boss = floorIsBoss || template.boss === true;
  const rewardBossMultiplier = boss
    ? clampNumber(CONFIG.dungeon?.bossRewardMultiplier, 1, MAX_SCALE, 4)
    : 1;
  const experience = rollReward(
    CONFIG.dungeon?.experiencePerEnemy,
    getRewardScale(floor, "experience"),
    rewardBossMultiplier,
  );
  const gold = rollReward(
    CONFIG.dungeon?.goldPerEnemy,
    getRewardScale(floor, "gold"),
    rewardBossMultiplier,
  );
  const templateId = String(template.id ?? "enemy").slice(0, 80);
  const suffix = hashSeed(`${String(stableSeed)}|${floor.id}|${index}|${templateId}`)
    .toString(16)
    .padStart(8, "0");
  const critChance = clampNumber(stats.critChance, 0, 0.75, 0.05);
  const critDamage = clampNumber(
    stats.critDamage,
    1,
    10,
    clampNumber(CONFIG.dungeon?.defaultEnemyCritDamage, 1, 10, 1.5),
  );

  return {
    id: `enemy-${floor.id}-${String(index).padStart(2, "0")}-${suffix}`,
    templateId,
    name: String(template.name ?? "无名敌人").slice(0, 80),
    emoji: String(template.emoji ?? "💀").slice(0, 8),
    level: clampInteger(floor.id, MIN_FLOOR, MAX_FLOOR, MIN_FLOOR),
    isBoss: boss,
    stats: {
      maxHp,
      hp: maxHp,
      health: maxHp,
      attack,
      defense,
      armor: defense,
      speed,
      critChance,
      critDamage,
      dodgeChance: 0,
      damageMultiplier: 1,
      damageReduction: 0,
    },
    skills: Array.isArray(template.skills) && template.skills.length > 0
      ? [...template.skills]
      : ["enemy_attack"],
    rewards: { experience, gold },
    experienceReward: experience,
    rewardExperience: experience,
    rewardXp: experience,
    goldReward: gold,
    rewardGold: gold,
  };
}

function getEnemyScales(floor) {
  const configured = floor?.enemyScales ?? floor?.enemyScale;
  if (configured && typeof configured === "object") {
    const fallback = boundedScale(configured.all ?? configured.base, 1);
    return {
      hp: boundedScale(configured.hp ?? configured.maxHp, fallback),
      attack: boundedScale(configured.attack, fallback),
      defense: boundedScale(configured.defense ?? configured.armor, fallback),
      speed: boundedScale(configured.speed, 1 + (fallback - 1) * 0.14),
    };
  }
  const base = boundedScale(configured, 1);
  return {
    hp: base,
    attack: base,
    defense: base,
    speed: boundedScale(1 + (base - 1) * 0.14, 1),
  };
}

function getRewardScale(floor, rewardType) {
  const configured = floor?.rewardScales ?? floor?.rewardScale;
  if (configured && typeof configured === "object") {
    return boundedScale(configured[rewardType] ?? configured.all ?? configured.base, 1);
  }
  return boundedScale(configured, 1);
}

function rollStat(base, scale, variance, rng, minimum) {
  const safeBase = clampNumber(base, minimum, MAX_COMBAT_STAT, minimum);
  const safeScale = boundedScale(scale, 1);
  const spread = clampNumber(variance, 0, 1, 0);
  const randomScale = 1 + rng.range(-spread, spread);
  const scaled = safeBase * safeScale * randomScale;
  return Math.max(minimum, Math.round(clampNumber(scaled, minimum, MAX_COMBAT_STAT, MAX_COMBAT_STAT)));
}

function rollReward(base, scale, bossMultiplier) {
  const safeBase = clampNumber(base, 0, MAX_REWARD, 0);
  const scaled = safeBase * boundedScale(scale, 1) * boundedScale(bossMultiplier, 1);
  return Math.max(0, Math.round(clampNumber(scaled, 0, MAX_REWARD, MAX_REWARD)));
}

function readEnemyCount(floor) {
  const configured = Array.isArray(floor?.enemyCount)
    ? floor.enemyCount
    : CONFIG.combat?.enemyCount;
  return Array.isArray(configured) && configured.length >= 2 ? configured : [0, 0];
}

function getEnemyPool(floor, boss) {
  const templates = CONFIG.enemyTemplates && typeof CONFIG.enemyTemplates === "object"
    ? CONFIG.enemyTemplates
    : {};
  const configured = Array.isArray(floor?.enemyPool) ? floor.enemyPool : [];
  const valid = configured.filter((id) => Object.hasOwn(templates, id));
  if (valid.length > 0) return valid;
  const entries = Object.values(templates);
  const fallback = boss ? entries.filter((template) => template?.boss === true) : entries;
  return fallback.map((template) => template?.id).filter((id) => typeof id === "string");
}

function isBossFloor(floor) {
  if (floor?.boss === true || floor?.isBoss === true) return true;
  const interval = clampInteger(
    CONFIG.dungeon?.bossEveryFloors,
    1,
    MAX_FLOOR,
    5,
  );
  return Number.isFinite(floor?.id) && floor.id % interval === 0;
}

function createEmptyWave(floorId, seed) {
  return {
    id: `wave-${floorId}-${hashSeed(seed).toString(16)}`,
    floorId,
    floor: floorId,
    name: "空置地牢",
    seed,
    isBoss: false,
    enemies: [],
    rewards: { experience: 0, gold: 0, lootCount: 0 },
    experienceReward: 0,
    goldReward: 0,
  };
}

function getHighestUnlockedFloor(save) {
  const source = save && typeof save === "object" ? save : {};
  const raw = source.progress?.highestUnlockedFloor
    ?? source.highestUnlockedFloor
    ?? source.unlockedFloor
    ?? source.maxUnlockedFloor
    ?? MIN_FLOOR;
  const configured = clampInteger(raw, MIN_FLOOR, MAX_FLOOR, MIN_FLOOR);
  const cleared = getClearedFloorIds(source);
  const inferred = cleared.length > 0
    ? Math.min(MAX_FLOOR, cleared.at(-1) + 1)
    : MIN_FLOOR;
  return Math.max(configured, inferred);
}

function readPrestigeCount(save) {
  const source = save && typeof save === "object" ? save : {};
  const candidates = [
    source.hero?.prestigeCount,
    source.hero?.prestige?.count,
    typeof source.hero?.prestige === "number" ? source.hero.prestige : undefined,
    source.progress?.prestigeCount,
    source.prestigeCount,
    source.prestige?.count,
  ];
  const raw = candidates.find((value) => Number.isFinite(value));
  return clampInteger(raw, 0, Number.MAX_SAFE_INTEGER, 0);
}

function getClearedFloorIds(save) {
  const source = save && typeof save === "object" ? save : {};
  const raw = source.progress?.clearedFloors ?? source.clearedFloors;
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map(normalizeFloorId).filter((id) => id !== null))].sort((a, b) => a - b);
}

function normalizeFloorId(value) {
  const raw = value && typeof value === "object" ? value.id : value;
  const number = typeof raw === "string" && raw.trim() ? Number(raw) : raw;
  if (!Number.isFinite(number)) return null;
  const integer = Math.floor(number);
  return integer >= MIN_FLOOR && integer <= MAX_FLOOR ? integer : null;
}

function normalizeSeed(seed) {
  if (typeof seed === "number" && Number.isFinite(seed)) return seed;
  if (typeof seed === "string") return seed.slice(0, 100);
  return String(seed ?? "0").slice(0, 100);
}

function boundedScale(value, fallback) {
  return clampNumber(value, 0, MAX_SCALE, fallback);
}

function safeAdd(left, right, maximum) {
  return Math.min(maximum, Math.max(0, left) + Math.max(0, right));
}

function finiteInteger(value, fallback) {
  return Number.isFinite(value) ? Math.floor(value) : fallback;
}

function clampInteger(value, min, max, fallback) {
  return Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.floor(value)))
    : fallback;
}

function clampNumber(value, min, max, fallback) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}
