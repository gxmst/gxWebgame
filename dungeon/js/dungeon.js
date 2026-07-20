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
  const eliteTuning = getEliteTuning();
  let eliteBudget = boss ? 0 : eliteTuning.maxPerWave;
  const enemies = [];

  for (let index = 0; index < count && enemyPool.length > 0; index += 1) {
    const templateId = rng.pick(enemyPool);
    const template = CONFIG.enemyTemplates?.[templateId];
    if (!template) continue;
    // 精英判定与词缀抽取先于个体属性掷点,保证同种子完全可复现。
    const makeElite = eliteBudget > 0
      && eliteTuning.enabled
      && definition.id >= eliteTuning.minFloor
      && rng() < eliteChanceForFloor(definition.id, eliteTuning);
    const modifier = makeElite ? rng.pick(eliteTuning.modifiers) ?? null : null;
    const enemy = createEnemy(template, definition, index, stableSeed, rng, boss, modifier, eliteTuning);
    if (enemy.isElite) eliteBudget -= 1;
    enemies.push(enemy);
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

function createEnemy(template, floor, index, stableSeed, rng, floorIsBoss, eliteModifier = null, eliteTuning = null) {
  const variance = clampNumber(CONFIG.dungeon?.enemyStatVariance, 0, 1, 0);
  const scales = getEnemyScales(floor);
  const stats = template.stats && typeof template.stats === "object" ? template.stats : {};
  const boss = floorIsBoss || template.boss === true;
  const elite = !boss && eliteModifier !== null && eliteModifier !== undefined;
  const tuning = eliteTuning ?? getEliteTuning();
  let maxHp = rollStat(stats.maxHp, scales.hp, variance, rng, 1);
  let attack = rollStat(stats.attack, scales.attack, variance, rng, 1);
  let defense = rollStat(stats.defense, scales.defense, variance, rng, 0);
  let speed = rollStat(stats.speed, scales.speed, variance * 0.4, rng, 1);
  const rewardBossMultiplier = boss
    ? clampNumber(CONFIG.dungeon?.bossRewardMultiplier, 1, MAX_SCALE, 4)
    : 1;
  const rewardEliteMultiplier = elite ? tuning.rewardMultiplier : 1;
  const experience = rollReward(
    CONFIG.dungeon?.experiencePerEnemy,
    getRewardScale(floor, "experience"),
    rewardBossMultiplier * rewardEliteMultiplier,
  );
  const gold = rollReward(
    CONFIG.dungeon?.goldPerEnemy,
    getRewardScale(floor, "gold"),
    rewardBossMultiplier * rewardEliteMultiplier,
  );
  const templateId = String(template.id ?? "enemy").slice(0, 80);
  const suffix = hashSeed(`${String(stableSeed)}|${floor.id}|${index}|${templateId}`)
    .toString(16)
    .padStart(8, "0");
  let critChance = clampNumber(stats.critChance, 0, 0.75, 0.05);
  const critDamage = clampNumber(
    stats.critDamage,
    1,
    10,
    clampNumber(CONFIG.dungeon?.defaultEnemyCritDamage, 1, 10, 1.5),
  );
  // 模板可携带的战斗特效(余烬恶鬼点燃、石像鬼荆棘等)。
  let dodgeChance = clampNumber(stats.dodgeChance, 0, 0.75, 0);
  let lifesteal = clampNumber(stats.lifesteal, 0, 1, 0);
  let thorns = clampNumber(stats.thorns, 0, 1, 0);
  let armorPenetration = clampNumber(stats.armorPenetration, 0, 1, 0);
  let multiHitChance = clampNumber(stats.multiHitChance, 0, 1, 0);
  let burnChance = clampNumber(stats.burnChance, 0, 1, 0);

  if (elite) {
    maxHp = Math.max(1, Math.round(maxHp * tuning.statMultipliers.maxHp));
    attack = Math.max(1, Math.round(attack * tuning.statMultipliers.attack));
    const changes = eliteModifier.stats && typeof eliteModifier.stats === "object"
      ? eliteModifier.stats
      : {};
    for (const [key, rawValue] of Object.entries(changes)) {
      const value = clampNumber(rawValue, 0, MAX_SCALE, 0);
      if (key === "maxHpMultiplier") maxHp = Math.max(1, Math.round(maxHp * value));
      else if (key === "attackMultiplier") attack = Math.max(1, Math.round(attack * value));
      else if (key === "defenseMultiplier") defense = Math.max(0, Math.round(defense * value));
      else if (key === "speedMultiplier") speed = Math.max(1, Math.round(speed * value));
      else if (key === "dodgeChance") dodgeChance = clampNumber(dodgeChance + value, 0, 0.75, dodgeChance);
      else if (key === "critChance") critChance = clampNumber(critChance + value, 0, 0.75, critChance);
      else if (key === "lifesteal") lifesteal = clampNumber(lifesteal + value, 0, 1, lifesteal);
      else if (key === "thorns") thorns = clampNumber(thorns + value, 0, 1, thorns);
      else if (key === "armorPenetration") armorPenetration = clampNumber(armorPenetration + value, 0, 1, armorPenetration);
      else if (key === "multiHitChance") multiHitChance = clampNumber(multiHitChance + value, 0, 1, multiHitChance);
      else if (key === "burnChance") burnChance = clampNumber(burnChance + value, 0, 1, burnChance);
    }
  }

  const baseName = String(template.name ?? "无名敌人").slice(0, 72);
  return {
    id: `enemy-${floor.id}-${String(index).padStart(2, "0")}-${suffix}`,
    templateId,
    name: elite ? `${String(eliteModifier.prefix ?? "精英的").slice(0, 8)}${baseName}` : baseName,
    emoji: String(template.emoji ?? "💀").slice(0, 8),
    level: clampInteger(floor.id, MIN_FLOOR, MAX_FLOOR, MIN_FLOOR),
    isBoss: boss,
    isElite: elite,
    eliteModifierId: elite ? String(eliteModifier.id ?? "") : null,
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
      dodgeChance,
      damageMultiplier: 1,
      damageReduction: 0,
      lifesteal,
      thorns,
      armorPenetration,
      multiHitChance,
      burnChance,
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

/** Elite tuning with hard bounds so a bad config can never flood waves. */
function getEliteTuning() {
  const source = CONFIG.dungeon?.elites && typeof CONFIG.dungeon.elites === "object"
    ? CONFIG.dungeon.elites
    : {};
  const rawMultipliers = source.statMultipliers && typeof source.statMultipliers === "object"
    ? source.statMultipliers
    : {};
  const modifiers = (Array.isArray(source.modifiers) ? source.modifiers : [])
    .filter((entry) => entry && typeof entry === "object" && entry.id);
  return {
    enabled: source.enabled === true && modifiers.length > 0,
    minFloor: clampInteger(source.minFloor, MIN_FLOOR, MAX_FLOOR, MIN_FLOOR),
    baseChance: clampNumber(source.baseChance, 0, 1, 0),
    chancePerFloor: clampNumber(source.chancePerFloor, 0, 1, 0),
    maxChance: clampNumber(source.maxChance, 0, 1, 0),
    maxPerWave: clampInteger(source.maxPerWave, 0, MAX_ENEMY_COUNT, 0),
    statMultipliers: {
      maxHp: clampNumber(rawMultipliers.maxHp, 0.01, MAX_SCALE, 1),
      attack: clampNumber(rawMultipliers.attack, 0.01, MAX_SCALE, 1),
    },
    rewardMultiplier: clampNumber(source.rewardMultiplier, 1, MAX_SCALE, 1),
    bonusLootChance: clampNumber(source.bonusLootChance, 0, 1, 0),
    modifiers,
  };
}

function eliteChanceForFloor(floorId, tuning) {
  return Math.min(
    tuning.maxChance,
    tuning.baseChance + Math.max(0, floorId - tuning.minFloor) * tuning.chancePerFloor,
  );
}

export { getEliteTuning };

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
