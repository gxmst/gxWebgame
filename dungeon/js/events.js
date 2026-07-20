/**
 * 野外事件卡：纯数据 / 纯函数层。
 * 不读 DOM、不写 localStorage；触发、抽取、结果结算集中于此，便于单测与种子复现。
 * 战斗本身不在此执行，仅产出 battle 配置交由 game 层走现有 combat 流程。
 */

import { CONFIG, RARITY_IDS, createSeededRng } from "./config.js";
import { generateLoot } from "./loot.js";
import { createOutdoorWave } from "./outdoor.js";

const MAX_ID_LENGTH = 64;
const MAX_REWARD = Number.MAX_SAFE_INTEGER;
const VALID_OUTCOME_TYPES = new Set([
  "loot",
  "gold",
  "experience",
  "material",
  "buff",
  "battle",
  "heal",
  "damage",
  "questFlag",
  "spendGold",
]);

/**
 * @param {object} [inputConfig]
 * @returns {{ eventChance: number, cards: object[], wavesBetweenEvents: number }}
 */
export function getEventConfig(inputConfig = CONFIG) {
  const source = isRecord(inputConfig?.events) ? inputConfig.events : {};
  const cards = Array.isArray(source.cards)
    ? source.cards.filter((card) => isRecord(card) && typeof card.id === "string")
    : [];
  return {
    enabled: source.enabled !== false,
    eventChance: clampNumber(source.eventChance, 0, 1, 0.2),
    wavesBetweenEvents: clampInteger(source.wavesBetweenEvents, 1, 100, 1),
    cards,
    eliteBattle: isRecord(source.eliteBattle) ? source.eliteBattle : {
      enemyStatMultiplier: 1.35,
      rewardMultiplier: 1.8,
      lootChance: 0.85,
      minimumRarity: "uncommon",
      enemyCount: 2,
    },
  };
}

/** 默认事件相关存档字段。 */
export function createDefaultEventState() {
  return {
    eventFlags: {},
    eventBuffs: createEmptyBuffs(),
    materials: {},
    lastEventWave: -999,
  };
}

/** 清洗事件存档字段（可嵌在角色上）。 */
export function sanitizeEventState(candidate) {
  const source = isRecord(candidate) ? candidate : {};
  const flagsSource = isRecord(source.eventFlags) ? source.eventFlags : {};
  const eventFlags = {};
  for (const [key, value] of Object.entries(flagsSource)) {
    const id = safeId(key);
    if (id) eventFlags[id] = value === true || value === 1 || value === "1";
  }
  return {
    eventFlags,
    eventBuffs: sanitizeBuffs(source.eventBuffs),
    materials: sanitizeMaterials(source.materials),
    lastEventWave: clampInteger(source.lastEventWave, -1_000_000, MAX_REWARD, -999),
  };
}

/**
 * 清完一波后是否尝试触发事件。
 * @param {{ completedWaves?: number, lastEventWave?: number }} context
 * @param {string|number} seed
 * @param {object} [inputConfig]
 */
export function shouldTriggerEvent(context = {}, seed = 0, inputConfig = CONFIG) {
  const tuning = getEventConfig(inputConfig);
  if (!tuning.enabled || tuning.cards.length === 0) return false;
  const completedWaves = clampInteger(context.completedWaves, 0, MAX_REWARD, 0);
  const lastEventWave = clampInteger(context.lastEventWave, -1_000_000, MAX_REWARD, -999);
  if (completedWaves - lastEventWave < tuning.wavesBetweenEvents) return false;
  const rng = createSeededRng(`${normalizeSeed(seed)}|event-trigger|${completedWaves}`);
  return rng() < tuning.eventChance;
}

/**
 * 按区域 / 世界等级 / 权重抽取一张事件卡。
 * @returns {object|null}
 */
export function pickEventCard(context = {}, seed = 0, inputConfig = CONFIG) {
  const candidates = listEligibleEventCards(context, inputConfig);
  if (candidates.length === 0) return null;
  const rng = createSeededRng(`${normalizeSeed(seed)}|event-pick`);
  const weights = candidates.map((card) => Math.max(0, finiteNumber(card.weight, 1)));
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return cloneCard(candidates[0]);
  let cursor = rng() * total;
  for (let index = 0; index < candidates.length; index += 1) {
    cursor -= weights[index];
    if (cursor < 0) return cloneCard(candidates[index]);
  }
  return cloneCard(candidates.at(-1));
}

/** 列出当前上下文可出现的事件卡。 */
export function listEligibleEventCards(context = {}, inputConfig = CONFIG) {
  const tuning = getEventConfig(inputConfig);
  const regionId = safeId(context.regionId) || null;
  const worldLevel = clampInteger(context.worldLevel, 0, 10_000, 0);
  const flags = isRecord(context.eventFlags) ? context.eventFlags : {};
  return tuning.cards.filter((card) => {
    if (Array.isArray(card.regions) && card.regions.length > 0) {
      if (!regionId || !card.regions.includes(regionId)) return false;
    }
    const minLevel = clampInteger(card.minWorldLevel, 0, 10_000, 0);
    if (worldLevel < minLevel) return false;
    if (card.once === true && flags[card.id] === true) return false;
    return true;
  });
}

/**
 * 结算玩家选择。
 * 返回：{ ok, resultText, rewards, battle, eventFlags, eventBuffs, materials, heroPatch, questFlags }
 * 其中 rewards 是本次即时收益摘要；battle 非空时 game 层应暂停事件并开打。
 */
export function resolveEventOption(card, optionIndex, context = {}, seed = 0, inputConfig = CONFIG) {
  const sourceCard = isRecord(card) ? card : null;
  if (!sourceCard) {
    return failure("unknown-card");
  }
  const options = Array.isArray(sourceCard.options) ? sourceCard.options : [];
  const option = options[optionIndex];
  if (!isRecord(option)) {
    return failure("unknown-option");
  }

  const rng = createSeededRng(
    `${normalizeSeed(seed)}|event-resolve|${sourceCard.id}|${optionIndex}`,
  );
  const outcomes = Array.isArray(option.outcomes) ? option.outcomes : [];
  const rewards = createEmptyRewards();
  const questFlags = {};
  let battle = null;
  let goldDelta = 0;
  let experienceDelta = 0;
  let hpDelta = 0;
  const eventBuffs = sanitizeBuffs(context.eventBuffs);
  const materials = sanitizeMaterials(context.materials);
  const eventFlags = {
    ...(isRecord(context.eventFlags) ? context.eventFlags : {}),
  };
  if (sourceCard.once === true) {
    eventFlags[sourceCard.id] = true;
  }

  const heroGold = clampInteger(context.heroGold, 0, MAX_REWARD, 0);
  let spendFailed = false;

  for (const raw of outcomes) {
    if (!isRecord(raw) || !VALID_OUTCOME_TYPES.has(raw.type)) continue;
    switch (raw.type) {
      case "spendGold": {
        const cost = clampInteger(raw.amount ?? raw.min, 0, MAX_REWARD, 0);
        if (heroGold + goldDelta < cost) {
          spendFailed = true;
        } else {
          goldDelta -= cost;
          rewards.goldSpent = safeAdd(rewards.goldSpent, cost);
        }
        break;
      }
      case "gold": {
        const amount = rollRange(raw, rng);
        goldDelta += amount;
        rewards.gold = safeAdd(rewards.gold, amount);
        break;
      }
      case "experience": {
        const amount = rollRange(raw, rng);
        experienceDelta += amount;
        rewards.experience = safeAdd(rewards.experience, amount);
        break;
      }
      case "loot": {
        const floorId = clampInteger(
          context.lootFloor ?? context.worldLevel ?? context.highestUnlockedFloor,
          1,
          10_000,
          1,
        );
        const minimumRarity = normalizeRarity(raw.rarityBias ?? raw.minimumRarity);
        const item = generateLoot(floorId, `${normalizeSeed(seed)}|event-loot|${sourceCard.id}|${optionIndex}|${rewards.items.length}`, context.hero, {
          idPrefix: "event",
          minimumRarity: minimumRarity || undefined,
          classId: typeof context.hero?.classId === "string" ? context.hero.classId : undefined,
        });
        if (item) {
          rewards.items.push(item);
        }
        break;
      }
      case "material": {
        const materialId = safeId(raw.id ?? raw.materialId) || "wild_essence";
        const amount = Math.max(1, rollRange({ min: raw.min ?? raw.amount ?? 1, max: raw.max ?? raw.amount ?? 1 }, rng));
        materials[materialId] = safeAdd(materials[materialId], amount);
        rewards.materials[materialId] = safeAdd(rewards.materials[materialId], amount);
        break;
      }
      case "buff": {
        const key = safeBuffKey(raw.stat ?? raw.key);
        if (!key) break;
        const amount = clampNumber(raw.amount ?? raw.value, -1000, 1000, 0);
        eventBuffs[key] = clampNumber(
          (eventBuffs[key] ?? 0) + amount,
          -1000,
          1000,
          amount,
        );
        rewards.buffs[key] = safeAdd(rewards.buffs[key], amount);
        break;
      }
      case "battle": {
        battle = buildEventBattlePlan(raw, context, `${normalizeSeed(seed)}|event-battle|${sourceCard.id}`, inputConfig);
        rewards.battle = true;
        break;
      }
      case "heal": {
        const amount = rollRange(raw, rng);
        hpDelta += amount;
        rewards.heal = safeAdd(rewards.heal, amount);
        break;
      }
      case "damage": {
        const amount = rollRange(raw, rng);
        hpDelta -= amount;
        rewards.damage = safeAdd(rewards.damage, amount);
        break;
      }
      case "questFlag": {
        const flag = safeId(raw.flag ?? raw.id);
        if (flag) questFlags[flag] = true;
        break;
      }
      default:
        break;
    }
    if (spendFailed) break;
  }

  if (spendFailed) {
    return {
      ok: false,
      reason: "not-enough-gold",
      resultText: option.failText || "你的金币不够。",
      rewards: createEmptyRewards(),
      battle: null,
      eventFlags: isRecord(context.eventFlags) ? { ...context.eventFlags } : {},
      eventBuffs: sanitizeBuffs(context.eventBuffs),
      materials: sanitizeMaterials(context.materials),
      heroPatch: { goldDelta: 0, experienceDelta: 0, hpDelta: 0 },
      questFlags: {},
    };
  }

  // 选项可带 conditional battle：小概率伏击
  if (!battle && isRecord(option.ambush) && finiteNumber(option.ambush.chance, 0) > 0) {
    if (rng() < clampNumber(option.ambush.chance, 0, 1, 0)) {
      battle = buildEventBattlePlan(option.ambush, context, `${normalizeSeed(seed)}|event-ambush|${sourceCard.id}`, inputConfig);
      rewards.battle = true;
      rewards.ambush = true;
    }
  }

  return {
    ok: true,
    reason: null,
    resultText: String(option.resultText ?? "你做出了选择。").slice(0, 400),
    rewards,
    battle,
    eventFlags,
    eventBuffs,
    materials,
    heroPatch: {
      goldDelta,
      experienceDelta,
      hpDelta,
    },
    questFlags,
    cardId: sourceCard.id,
    optionIndex,
  };
}

/**
 * 构造事件战斗波次（精英伏击等），复用 outdoor/dungeon 敌人生成，不碰 combat.js。
 */
export function createEventBattleWave(saveOrProgress, seed = 0, options = {}, inputConfig = CONFIG) {
  const plan = isRecord(options) ? options : {};
  const eventTuning = getEventConfig(inputConfig).eliteBattle;
  const statMultiplier = clampNumber(
    plan.enemyStatMultiplier ?? eventTuning.enemyStatMultiplier,
    0.1,
    10,
    1.35,
  );
  const rewardMultiplier = clampNumber(
    plan.rewardMultiplier ?? eventTuning.rewardMultiplier,
    0.1,
    10,
    1.8,
  );
  const outdoorState = {
    status: "running",
    sessionSeed: normalizeSeed(seed),
    nextWaveIndex: 0,
    completedWaves: 0,
    defeats: 0,
    rewards: { experience: 0, gold: 0, items: [], materials: {} },
  };
  const base = createOutdoorWave(saveOrProgress, outdoorState, inputConfig);
  let enemies = (Array.isArray(base.enemies) ? base.enemies : []).map((enemy, index) =>
    scaleEventEnemy(enemy, statMultiplier, rewardMultiplier, index),
  );
  const desiredCount = clampInteger(
    plan.enemyCount ?? eventTuning.enemyCount,
    1,
    6,
    Math.max(1, enemies.length || 2),
  );
  if (enemies.length > desiredCount) {
    enemies = enemies.slice(0, desiredCount);
  }
  // 至少保证一只精英风味怪
  if (enemies.length === 0) {
    enemies = [createFallbackElite(base.floorId ?? 1, seed, statMultiplier, rewardMultiplier)];
  } else {
    enemies = enemies.map((enemy, index) => ({
      ...enemy,
      isElite: true,
      name: enemy.name?.startsWith("精英") || enemy.name?.includes("的")
        ? enemy.name
        : `伏击的${enemy.name || "魔物"}`,
      eliteModifierId: enemy.eliteModifierId || "event_ambush",
    }));
  }

  const rewards = enemies.reduce((total, enemy) => ({
    experience: safeAdd(total.experience, enemy.rewards?.experience),
    gold: safeAdd(total.gold, enemy.rewards?.gold),
  }), { experience: 0, gold: 0 });

  return {
    ...base,
    id: `event-battle-${hashish(seed)}`,
    mode: "event",
    isBoss: false,
    isEventBattle: true,
    enemies,
    rewards: { ...rewards, lootCount: enemies.length },
    experienceReward: rewards.experience,
    goldReward: rewards.gold,
    eventLootChance: clampNumber(plan.lootChance ?? eventTuning.lootChance, 0, 1, 0.85),
    eventMinimumRarity: normalizeRarity(plan.minimumRarity ?? eventTuning.minimumRarity) || "uncommon",
  };
}

/** 将永久事件 buff 叠到战斗单位 stats 上（不改 hero.js / combat.js）。 */
export function applyEventBuffsToStats(stats, eventBuffs) {
  const source = isRecord(stats) ? { ...stats } : {};
  const buffs = sanitizeBuffs(eventBuffs);
  if (buffs.maxHp) {
    source.maxHp = Math.max(1, Math.round(finiteNumber(source.maxHp, 1) + buffs.maxHp));
    if (Number.isFinite(source.hp)) source.hp = Math.min(source.maxHp, source.hp + Math.max(0, buffs.maxHp));
    if (Number.isFinite(source.health)) source.health = source.hp ?? source.maxHp;
  }
  if (buffs.attack) {
    source.attack = Math.max(1, Math.round(finiteNumber(source.attack, 1) + buffs.attack));
  }
  if (buffs.defense) {
    source.defense = Math.max(0, Math.round(finiteNumber(source.defense, 0) + buffs.defense));
    source.armor = source.defense;
  }
  if (buffs.speed) {
    source.speed = Math.max(1, Math.round(finiteNumber(source.speed, 1) + buffs.speed));
  }
  return source;
}

// ─── internals ───────────────────────────────────────────────

function buildEventBattlePlan(raw, context, seed, inputConfig) {
  return {
    kind: "elite_ambush",
    seed: normalizeSeed(seed),
    enemyStatMultiplier: raw.enemyStatMultiplier,
    rewardMultiplier: raw.rewardMultiplier,
    lootChance: raw.lootChance,
    minimumRarity: raw.minimumRarity ?? raw.rarityBias,
    enemyCount: raw.enemyCount,
    regionId: context.regionId,
  };
}

function scaleEventEnemy(enemy, statMultiplier, rewardMultiplier, index) {
  const source = isRecord(enemy) ? enemy : {};
  const stats = isRecord(source.stats) ? { ...source.stats } : {};
  for (const key of ["maxHp", "attack", "defense"]) {
    const minimum = key === "defense" ? 0 : 1;
    stats[key] = Math.max(minimum, Math.round(finiteNumber(stats[key], minimum) * statMultiplier));
  }
  stats.hp = stats.maxHp;
  stats.health = stats.maxHp;
  stats.armor = stats.defense;
  const exp = Math.max(1, Math.round(finiteNumber(source.rewards?.experience ?? source.experienceReward, 10) * rewardMultiplier));
  const gold = Math.max(1, Math.round(finiteNumber(source.rewards?.gold ?? source.goldReward, 5) * rewardMultiplier));
  return {
    ...source,
    id: source.id || `event-enemy-${index}`,
    isElite: true,
    stats,
    rewards: { experience: exp, gold },
    experienceReward: exp,
    goldReward: gold,
  };
}

function createFallbackElite(floorId, seed, statMultiplier, rewardMultiplier) {
  const baseHp = Math.max(40, Math.round(50 * floorId * 0.35 * statMultiplier));
  const attack = Math.max(8, Math.round(10 * floorId * 0.2 * statMultiplier));
  const exp = Math.max(15, Math.round(25 * rewardMultiplier));
  const gold = Math.max(8, Math.round(12 * rewardMultiplier));
  return {
    id: `event-fallback-${hashish(seed)}`,
    templateId: "skeleton",
    name: "伏击精英",
    emoji: "⚔️",
    level: floorId,
    isBoss: false,
    isElite: true,
    eliteModifierId: "event_ambush",
    stats: {
      maxHp: baseHp,
      hp: baseHp,
      health: baseHp,
      attack,
      defense: Math.max(2, Math.round(attack * 0.35)),
      armor: Math.max(2, Math.round(attack * 0.35)),
      speed: 60,
      critChance: 0.08,
      critDamage: 1.5,
      dodgeChance: 0,
      damageMultiplier: 1,
      damageReduction: 0,
      lifesteal: 0,
      thorns: 0,
      armorPenetration: 0,
      multiHitChance: 0,
      burnChance: 0,
    },
    skills: ["enemy_attack"],
    rewards: { experience: exp, gold },
    experienceReward: exp,
    goldReward: gold,
  };
}

function cloneCard(card) {
  return {
    ...card,
    options: Array.isArray(card.options)
      ? card.options.map((option) => ({
        ...option,
        outcomes: Array.isArray(option.outcomes)
          ? option.outcomes.map((entry) => ({ ...entry }))
          : [],
        ambush: isRecord(option.ambush) ? { ...option.ambush } : undefined,
      }))
      : [],
  };
}

function createEmptyRewards() {
  return {
    gold: 0,
    goldSpent: 0,
    experience: 0,
    items: [],
    materials: {},
    buffs: {},
    heal: 0,
    damage: 0,
    battle: false,
    ambush: false,
  };
}

function createEmptyBuffs() {
  return { maxHp: 0, attack: 0, defense: 0, speed: 0 };
}

function sanitizeBuffs(candidate) {
  const source = isRecord(candidate) ? candidate : {};
  return {
    maxHp: clampNumber(source.maxHp, -1000, 1000, 0),
    attack: clampNumber(source.attack, -1000, 1000, 0),
    defense: clampNumber(source.defense, -1000, 1000, 0),
    speed: clampNumber(source.speed, -1000, 1000, 0),
  };
}

function sanitizeMaterials(candidate) {
  const source = isRecord(candidate) ? candidate : {};
  const materials = {};
  for (const [id, amount] of Object.entries(source)) {
    const cleanId = safeId(id);
    const cleanAmount = clampInteger(amount, 0, MAX_REWARD, 0);
    if (cleanId && cleanAmount > 0) materials[cleanId] = cleanAmount;
  }
  return materials;
}

function safeBuffKey(value) {
  const key = String(value ?? "").trim();
  return ["maxHp", "attack", "defense", "speed"].includes(key) ? key : "";
}

function normalizeRarity(value) {
  if (typeof value !== "string") return null;
  const mapped = { normal: "common", excellent: "uncommon" }[value] ?? value;
  return RARITY_IDS.includes(mapped) ? mapped : null;
}

function rollRange(raw, rng) {
  const min = clampInteger(raw?.min ?? raw?.amount ?? 0, 0, MAX_REWARD, 0);
  const max = clampInteger(raw?.max ?? raw?.amount ?? min, min, MAX_REWARD, min);
  if (max <= min) return min;
  return rng.int(min, max);
}

function failure(reason) {
  return {
    ok: false,
    reason,
    resultText: "什么也没有发生。",
    rewards: createEmptyRewards(),
    battle: null,
    eventFlags: {},
    eventBuffs: createEmptyBuffs(),
    materials: {},
    heroPatch: { goldDelta: 0, experienceDelta: 0, hpDelta: 0 },
    questFlags: {},
  };
}

function normalizeSeed(seed) {
  if (typeof seed === "number" && Number.isFinite(seed)) return String(Math.trunc(seed));
  return String(seed ?? "0").slice(0, 120);
}

function hashish(seed) {
  const text = normalizeSeed(seed);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function safeId(value) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, MAX_ID_LENGTH);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function clampInteger(value, min, max, fallback) {
  return Math.trunc(clampNumber(value, min, max, fallback));
}

function safeAdd(left, right) {
  return Math.min(MAX_REWARD, Math.max(0, clampInteger(left, 0, MAX_REWARD, 0) + clampInteger(right, 0, MAX_REWARD, 0)));
}
