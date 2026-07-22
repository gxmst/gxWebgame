import { CONFIG, createSeededRng, hashSeed } from "./config.js";

const MIN_FLOOR = finiteInteger(CONFIG.dungeon?.minFloor, 1);
const MAX_FLOOR = Math.max(MIN_FLOOR, finiteInteger(CONFIG.dungeon?.maxFloor, MIN_FLOOR));
const MAX_ENEMY_COUNT = 20;
const MAX_COMBAT_STAT = 1_000_000_000;
const MAX_SCALE = 1_000_000;
const MAX_REWARD = Number.MAX_SAFE_INTEGER;

const BASE_PACING = Object.freeze({
  stage: 0,
  floor: MIN_FLOOR,
  name: "初入地牢",
  hint: "先熟悉职业循环，凑齐基础装备。",
  recommendedPowerMultiplier: 1,
  enemyMultipliers: Object.freeze({ hp: 1, attack: 1, defense: 1, speed: 1 }),
  bossMultipliers: Object.freeze({ hp: 1, attack: 1, defense: 1, speed: 1 }),
  rewardMultipliers: Object.freeze({ experience: 0.95, gold: 0.92 }),
  gateRewardMultiplier: 1,
  // Tutorial floors always hand out a starter item; the first real drop
  // reduction begins at the floor-5 equipment check.
  baseLootChance: 1,
  mechanics: Object.freeze({}),
  mechanicIds: Object.freeze([]),
});

/**
 * Persistent progression stages. Reaching a gate raises the following band as
 * well as its boss, so a cleared threshold cannot be bypassed by moving to the
 * next normal floor. Gate bosses then add a small build check on top.
 */
export const PROGRESSION_GATES = Object.freeze([
  createGate({
    stage: 1,
    floor: 5,
    name: "装备检验",
    hint: "至少补齐主要装备，并准备一项稳定的生存手段。",
    recommendedPowerMultiplier: 1.08,
    enemyMultipliers: { hp: 1.04, attack: 1.02, defense: 1.03, speed: 1 },
    bossMultipliers: { hp: 1.15, attack: 1.08, defense: 1.1, speed: 1 },
    rewardMultipliers: { experience: 0.9, gold: 0.88 },
    gateRewardMultiplier: 1.1,
    baseLootChance: 0.85,
    mechanics: { damageReduction: 0.05 },
    mechanicIds: ["坚韧"],
  }),
  createGate({
    stage: 2,
    floor: 10,
    name: "技能检验",
    hint: "需要明确主攻技能，并用防御或控制弥补构筑短板。",
    recommendedPowerMultiplier: 1.16,
    enemyMultipliers: { hp: 1.08, attack: 1.05, defense: 1.06, speed: 1.01 },
    bossMultipliers: { hp: 1.17, attack: 1.1, defense: 1.12, speed: 1.01 },
    rewardMultipliers: { experience: 0.82, gold: 0.82 },
    gateRewardMultiplier: 1.12,
    baseLootChance: 0.78,
    mechanics: { armorPenetration: 0.08 },
    mechanicIds: ["破甲"],
  }),
  createGate({
    stage: 3,
    floor: 20,
    name: "构筑成形",
    hint: "核心技能、装备词条和续航需要形成完整配合。",
    recommendedPowerMultiplier: 1.27,
    enemyMultipliers: { hp: 1.14, attack: 1.09, defense: 1.1, speed: 1.02 },
    bossMultipliers: { hp: 1.2, attack: 1.13, defense: 1.15, speed: 1.02 },
    rewardMultipliers: { experience: 0.7, gold: 0.74 },
    gateRewardMultiplier: 1.15,
    baseLootChance: 0.72,
    mechanics: { damageReduction: 0.08, lifesteal: 0.08 },
    mechanicIds: ["坚韧", "汲取"],
  }),
  createGate({
    stage: 4,
    floor: 35,
    name: "专精检验",
    hint: "围绕技能派生强化单一打法，并补足破甲与减伤。",
    recommendedPowerMultiplier: 1.39,
    enemyMultipliers: { hp: 1.2, attack: 1.13, defense: 1.15, speed: 1.03 },
    bossMultipliers: { hp: 1.23, attack: 1.16, defense: 1.18, speed: 1.03 },
    rewardMultipliers: { experience: 0.6, gold: 0.68 },
    gateRewardMultiplier: 1.17,
    baseLootChance: 0.68,
    mechanics: { critChance: 0.04, armorPenetration: 0.12 },
    mechanicIds: ["致命", "破甲"],
  }),
  createGate({
    stage: 5,
    floor: 50,
    name: "流派检验",
    hint: "只堆伤害已不足以通过，需要处理反伤和持续伤害。",
    recommendedPowerMultiplier: 1.52,
    enemyMultipliers: { hp: 1.27, attack: 1.17, defense: 1.2, speed: 1.04 },
    bossMultipliers: { hp: 1.26, attack: 1.19, defense: 1.22, speed: 1.04 },
    rewardMultipliers: { experience: 0.52, gold: 0.62 },
    gateRewardMultiplier: 1.2,
    baseLootChance: 0.64,
    mechanics: { damageReduction: 0.12, thorns: 0.08 },
    mechanicIds: ["壁垒", "荆棘"],
  }),
  createGate({
    stage: 6,
    floor: 70,
    name: "深渊检验",
    hint: "敌人开始压缩防御收益，需要兼顾生命、恢复与爆发窗口。",
    recommendedPowerMultiplier: 1.66,
    enemyMultipliers: { hp: 1.34, attack: 1.21, defense: 1.25, speed: 1.05 },
    bossMultipliers: { hp: 1.29, attack: 1.22, defense: 1.25, speed: 1.05 },
    rewardMultipliers: { experience: 0.46, gold: 0.57 },
    gateRewardMultiplier: 1.22,
    baseLootChance: 0.6,
    mechanics: { armorPenetration: 0.16, multiHitChance: 0.1 },
    mechanicIds: ["裂甲", "追击"],
  }),
  createGate({
    stage: 7,
    floor: 85,
    name: "虚空检验",
    hint: "命中稳定性和持续作战能力决定能否继续深入。",
    recommendedPowerMultiplier: 1.8,
    enemyMultipliers: { hp: 1.4, attack: 1.25, defense: 1.3, speed: 1.06 },
    bossMultipliers: { hp: 1.32, attack: 1.25, defense: 1.28, speed: 1.06 },
    rewardMultipliers: { experience: 0.42, gold: 0.53 },
    gateRewardMultiplier: 1.24,
    baseLootChance: 0.58,
    mechanics: { dodgeChance: 0.06, damageReduction: 0.14 },
    mechanicIds: ["幻影", "壁垒"],
  }),
  createGate({
    stage: 8,
    floor: 100,
    name: "终局检验",
    hint: "终局首领会同时检验输出、生存和恢复抑制能力。",
    recommendedPowerMultiplier: 1.96,
    enemyMultipliers: { hp: 1.48, attack: 1.3, defense: 1.36, speed: 1.08 },
    bossMultipliers: { hp: 1.32, attack: 1.28, defense: 1.32, speed: 1.08 },
    rewardMultipliers: { experience: 0.38, gold: 0.5 },
    gateRewardMultiplier: 1.28,
    baseLootChance: 0.55,
    mechanics: {
      critChance: 0.05,
      damageReduction: 0.16,
      armorPenetration: 0.18,
      multiHitChance: 0.12,
    },
    mechanicIds: ["致命", "壁垒", "裂甲", "追击"],
  }),
]);

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
  return getFloorPacing(floor)?.recommendedPower ?? 0;
}

/** Returns the effective stage tuning without exposing mutable shared config. */
export function getFloorPacing(floor) {
  const definition = getFloor(floor);
  if (!definition) return null;
  const stage = findProgressionStage(definition.id);
  const isGate = stage.floor === definition.id && stage.stage > 0;
  const bossFloor = isBossFloor(definition);
  return {
    floorId: definition.id,
    stage: stage.stage,
    stageFloor: stage.stage > 0 ? stage.floor : null,
    isGate,
    name: stage.name,
    hint: stage.hint,
    recommendedPower: Math.max(0, Math.round(
      clampNumber(definition.recommendedPower, 0, MAX_COMBAT_STAT, 0)
        * stage.recommendedPowerMultiplier,
    )),
    enemyMultipliers: { ...stage.enemyMultipliers },
    bossMultipliers: isGate ? { ...stage.bossMultipliers } : { ...BASE_PACING.bossMultipliers },
    rewardMultipliers: { ...stage.rewardMultipliers },
    gateRewardMultiplier: isGate ? stage.gateRewardMultiplier : 1,
    // Keep the public chance honest for the floor card: bosses are guaranteed
    // even though their stage also has a normal-floor baseline.
    baseLootChance: bossFloor ? 1 : stage.baseLootChance,
    normalLootChance: stage.baseLootChance,
    mechanics: isGate ? { ...stage.mechanics } : {},
    mechanicIds: isGate ? [...stage.mechanicIds] : [],
  };
}

/** Bosses always drop; normal floors use a stable per-battle pacing roll. */
export function shouldDropBaseLoot(floor, seed = 0) {
  const definition = getFloor(floor);
  const pacing = getFloorPacing(definition);
  if (!definition || !pacing) return false;
  if (isBossFloor(definition)) return true;
  const rng = createSeededRng(`${String(normalizeSeed(seed))}|base-loot|${definition.id}`);
  return rng() < pacing.baseLootChance;
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
  const pacing = getFloorPacing(definition);
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
    progressionGate: pacing?.isGate ? serializeGatePacing(pacing) : null,
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
  const pacing = getFloorPacing(definition);
  return {
    ...definition,
    recommendedPower: pacing?.recommendedPower ?? definition.recommendedPower,
    pacing,
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
  const pacing = getFloorPacing(floor);
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
  let damageReduction = clampNumber(stats.damageReduction, 0, 0.75, 0);

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

  if (boss && pacing?.isGate) {
    maxHp = multiplyCombatStat(maxHp, pacing.bossMultipliers.hp, 1);
    attack = multiplyCombatStat(attack, pacing.bossMultipliers.attack, 1);
    defense = multiplyCombatStat(defense, pacing.bossMultipliers.defense, 0);
    speed = multiplyCombatStat(speed, pacing.bossMultipliers.speed, 1);
    const mechanics = pacing.mechanics;
    critChance = addBoundedChance(critChance, mechanics.critChance, 0.75);
    dodgeChance = addBoundedChance(dodgeChance, mechanics.dodgeChance, 0.75);
    lifesteal = addBoundedChance(lifesteal, mechanics.lifesteal, 1);
    thorns = addBoundedChance(thorns, mechanics.thorns, 1);
    armorPenetration = addBoundedChance(armorPenetration, mechanics.armorPenetration, 1);
    multiHitChance = addBoundedChance(multiHitChance, mechanics.multiHitChance, 1);
    burnChance = addBoundedChance(burnChance, mechanics.burnChance, 1);
    damageReduction = addBoundedChance(damageReduction, mechanics.damageReduction, 0.75);
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
    progressionGate: boss && pacing?.isGate,
    gateMechanics: boss && pacing?.isGate ? [...pacing.mechanicIds] : [],
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
      damageReduction,
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
  const pacing = getFloorPacing(floor) ?? BASE_PACING;
  const configured = floor?.enemyScales ?? floor?.enemyScale;
  if (configured && typeof configured === "object") {
    const fallback = boundedScale(configured.all ?? configured.base, 1);
    return {
      hp: multiplyScale(configured.hp ?? configured.maxHp, fallback, pacing.enemyMultipliers.hp),
      attack: multiplyScale(configured.attack, fallback, pacing.enemyMultipliers.attack),
      defense: multiplyScale(configured.defense ?? configured.armor, fallback, pacing.enemyMultipliers.defense),
      speed: multiplyScale(configured.speed, 1 + (fallback - 1) * 0.14, pacing.enemyMultipliers.speed),
    };
  }
  const base = boundedScale(configured, 1);
  return {
    hp: boundedScale(base * pacing.enemyMultipliers.hp, base),
    attack: boundedScale(base * pacing.enemyMultipliers.attack, base),
    defense: boundedScale(base * pacing.enemyMultipliers.defense, base),
    speed: boundedScale((1 + (base - 1) * 0.14) * pacing.enemyMultipliers.speed, 1),
  };
}

function createGate(source = {}) {
  const stage = clampInteger(source.stage, 1, Number.MAX_SAFE_INTEGER, 1);
  const floor = clampInteger(source.floor, MIN_FLOOR, MAX_FLOOR, MIN_FLOOR);
  const enemyMultipliers = source.enemyMultipliers && typeof source.enemyMultipliers === "object"
    ? source.enemyMultipliers
    : {};
  const bossMultipliers = source.bossMultipliers && typeof source.bossMultipliers === "object"
    ? source.bossMultipliers
    : {};
  const rewardMultipliers = source.rewardMultipliers && typeof source.rewardMultipliers === "object"
    ? source.rewardMultipliers
    : {};
  const mechanics = source.mechanics && typeof source.mechanics === "object"
    ? source.mechanics
    : {};
  const mechanicIds = Array.isArray(source.mechanicIds)
    ? source.mechanicIds.map((id) => String(id).slice(0, 20)).filter(Boolean)
    : [];
  return Object.freeze({
    stage,
    floor,
    name: String(source.name ?? `阶段 ${stage}`).slice(0, 32),
    hint: String(source.hint ?? "提升装备和技能后再继续深入。").slice(0, 120),
    recommendedPowerMultiplier: clampNumber(source.recommendedPowerMultiplier, 0.1, MAX_SCALE, 1),
    enemyMultipliers: Object.freeze({
      hp: clampNumber(enemyMultipliers.hp, 0.01, MAX_SCALE, 1),
      attack: clampNumber(enemyMultipliers.attack, 0.01, MAX_SCALE, 1),
      defense: clampNumber(enemyMultipliers.defense, 0, MAX_SCALE, 1),
      speed: clampNumber(enemyMultipliers.speed, 0.01, MAX_SCALE, 1),
    }),
    bossMultipliers: Object.freeze({
      hp: clampNumber(bossMultipliers.hp, 0.01, MAX_SCALE, 1),
      attack: clampNumber(bossMultipliers.attack, 0.01, MAX_SCALE, 1),
      defense: clampNumber(bossMultipliers.defense, 0, MAX_SCALE, 1),
      speed: clampNumber(bossMultipliers.speed, 0.01, MAX_SCALE, 1),
    }),
    rewardMultipliers: Object.freeze({
      experience: clampNumber(rewardMultipliers.experience, 0, MAX_SCALE, 1),
      gold: clampNumber(rewardMultipliers.gold, 0, MAX_SCALE, 1),
    }),
    gateRewardMultiplier: clampNumber(source.gateRewardMultiplier, 0, MAX_SCALE, 1),
    baseLootChance: clampNumber(source.baseLootChance, 0, 1, 1),
    mechanics: Object.freeze(Object.fromEntries(
      Object.entries(mechanics).map(([key, value]) => [
        key,
        clampNumber(value, 0, 1, 0),
      ]),
    )),
    mechanicIds: Object.freeze(mechanicIds),
  });
}

function findProgressionStage(floorId) {
  let active = BASE_PACING;
  for (const gate of PROGRESSION_GATES) {
    if (gate.floor > floorId) break;
    active = gate;
  }
  return active;
}

function serializeGatePacing(pacing) {
  return {
    stage: pacing.stage,
    floor: pacing.stageFloor,
    name: pacing.name,
    hint: pacing.hint,
    mechanicIds: [...pacing.mechanicIds],
  };
}

function multiplyScale(value, fallback, multiplier) {
  const base = boundedScale(value, fallback);
  return boundedScale(base * boundedScale(multiplier, 1), fallback);
}

function multiplyCombatStat(value, multiplier, minimum) {
  const safeValue = clampNumber(value, minimum, MAX_COMBAT_STAT, minimum);
  const safeMultiplier = clampNumber(multiplier, 0.01, MAX_SCALE, 1);
  return Math.max(minimum, Math.round(clampNumber(
    safeValue * safeMultiplier,
    minimum,
    MAX_COMBAT_STAT,
    safeValue,
  )));
}

function addBoundedChance(value, addition, maximum) {
  const current = clampNumber(value, 0, maximum, 0);
  const extra = clampNumber(addition, 0, maximum, 0);
  return Math.min(maximum, current + extra);
}

function getRewardScale(floor, rewardType) {
  const pacing = getFloorPacing(floor) ?? BASE_PACING;
  const configured = floor?.rewardScales ?? floor?.rewardScale;
  let base;
  if (configured && typeof configured === "object") {
    base = boundedScale(configured[rewardType] ?? configured.all ?? configured.base, 1);
  } else {
    base = boundedScale(configured, 1);
  }
  const typeMultiplier = pacing.rewardMultipliers[rewardType] ?? 1;
  return boundedScale(base * typeMultiplier * pacing.gateRewardMultiplier, base);
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
