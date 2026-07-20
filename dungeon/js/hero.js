import {
  CONFIG,
  EQUIPMENT_SLOT_IDS,
  RARITY_IDS,
  STAT_KEYS,
  hashSeed,
} from "./config.js";
import {
  getHeroSkills,
  getPrestigeBonuses,
  getSkillPointsEarnedAtLevel,
} from "./skills.js";

const BONUS_KEYS = Object.freeze([
  ...STAT_KEYS,
  "maxHp",
  "attack",
  "defense",
  "speed",
  "critChance",
  "critDamage",
  "damagePercent",
  "physicalDamagePercent",
  "magicDamagePercent",
  "damageReduction",
  "dodgeChance",
]);

/**
 * Hero save shape:
 * { id, name, classId, classChosen, level, experience, totalExperience,
 *   unspentStatPoints, unspentSkillPoints, skillLevels, prestigeCount,
 *   baseStats, equipment, inventory, skills, gold }
 *
 * baseStats only contains the four allocated attributes. Combat values are
 * derived by getHeroStats(), so stale attack/HP values never enter a save.
 */
export function createDefaultHero(classId = CONFIG.hero.classId, options = {}) {
  const selectedClassId = Object.hasOwn(CONFIG.classes, classId)
    ? classId
    : CONFIG.hero.classId;
  const classDefinition = CONFIG.classes[selectedClassId];
  const initialSkillLevels = Object.fromEntries(classDefinition.skills.map((skillId) => [
    skillId,
    getSkillInitialLevel(skillId),
  ]));
  return {
    id: selectedClassId === CONFIG.hero.classId ? CONFIG.hero.id : `hero-${selectedClassId}`,
    name: selectedClassId === CONFIG.hero.classId ? CONFIG.hero.name : `无名${classDefinition.name}`,
    classId: classDefinition.id,
    classChosen: options.classChosen === true,
    level: 1,
    experience: 0,
    totalExperience: 0,
    unspentStatPoints: 0,
    unspentSkillPoints: 0,
    skillLevels: initialSkillLevels,
    prestigeCount: 0,
    baseStats: { ...classDefinition.startingStats },
    equipment: Object.fromEntries(EQUIPMENT_SLOT_IDS.map((slot) => [slot, null])),
    inventory: [],
    skills: [...classDefinition.skills],
    gold: 0,
  };
}

export function createHeroForClass(classId, options = {}) {
  return createDefaultHero(classId, { ...options, classChosen: options.classChosen !== false });
}

export function getClassDefinition(classId) {
  return CONFIG.classes[classId] ?? CONFIG.classes[CONFIG.hero.classId];
}

/** Returns a fresh, JSON-safe hero and drops unknown/corrupt fields. */
export function sanitizeHero(candidate) {
  const defaults = createDefaultHero();
  const source = isRecord(candidate) ? candidate : {};
  const classId = Object.hasOwn(CONFIG.classes, source.classId)
    ? source.classId
    : defaults.classId;
  const classDefinition = getClassDefinition(classId);
  const classDefaults = createDefaultHero(classId);
  const classChosen = typeof source.classChosen === "boolean"
    ? source.classChosen
    // Payloads from the first batch already represent a chosen warrior.
    : Object.keys(source).length > 0;
  const rawStats = firstRecord(source.baseStats, source.attributes, source.stats);
  const baseStats = {};

  for (const key of STAT_KEYS) {
    baseStats[key] = clampInteger(
      rawStats?.[key],
      0,
      CONFIG.stats.maximumValue,
      classDefinition.startingStats[key],
    );
  }

  let level = clampInteger(source.level, 1, CONFIG.hero.maxLevel, 1);
  let experience = nonNegativeInteger(source.experience ?? source.xp);
  let unspentStatPoints = clampInteger(
    source.unspentStatPoints ?? source.statPoints,
    0,
    CONFIG.stats.maximumValue,
    0,
  );
  const prestigeCount = clampInteger(
    source.prestigeCount ?? source.prestige,
    0,
    CONFIG.prestige.maxCount,
    0,
  );
  const rawSkillLevels = isRecord(source.skillLevels) ? source.skillLevels : {};
  const skillLevels = Object.fromEntries(classDefinition.skills.map((skillId) => [
    skillId,
    clampInteger(
      rawSkillLevels[skillId],
      getSkillInitialLevel(skillId),
      getSkillMaxLevel(skillId),
      getSkillInitialLevel(skillId),
    ),
  ]));
  const historicalSkillPoints = getSkillPointsEarnedAtLevel(level)
    + prestigeCount * CONFIG.skillProgression.pointsPerPrestige;
  const investedSkillPoints = Object.entries(skillLevels).reduce(
    (sum, [skillId, rank]) => sum + Math.max(0, rank - getSkillInitialLevel(skillId)),
    0,
  );
  let unspentSkillPoints = clampInteger(
    source.unspentSkillPoints ?? source.skillPoints,
    0,
    CONFIG.stats.maximumValue,
    Math.max(0, historicalSkillPoints - investedSkillPoints),
  );

  // Overflow XP from an older build is normalized instead of being discarded.
  while (level < CONFIG.hero.maxLevel) {
    const required = getExperienceRequirement(level);
    if (required <= 0 || experience < required) break;
    experience -= required;
    level += 1;
    unspentStatPoints = Math.min(
      CONFIG.stats.maximumValue,
      unspentStatPoints + CONFIG.hero.statPointsPerLevel,
    );
    if (level % CONFIG.skillProgression.pointEveryLevels === 0) {
      unspentSkillPoints = Math.min(
        CONFIG.stats.maximumValue,
        unspentSkillPoints + CONFIG.skillProgression.pointsPerAward,
      );
    }
  }
  if (level >= CONFIG.hero.maxLevel) experience = 0;

  const rawEquipment = firstRecord(source.equipment, source.gear) ?? {};
  const equipment = {};
  for (const slot of EQUIPMENT_SLOT_IDS) {
    equipment[slot] = sanitizeItem(rawEquipment[slot], { forcedSlot: slot });
  }

  const inventory = Array.isArray(source.inventory ?? source.backpack)
    ? (source.inventory ?? source.backpack)
      .slice(0, CONFIG.save.maxInventoryItems)
      .map((item) => sanitizeItem(item))
      .filter(Boolean)
    : [];

  const rawSkills = Array.isArray(source.skills) ? source.skills : classDefinition.skills;
  const skills = [...new Set(rawSkills
    .map((skill) => isRecord(skill) ? skill.id : skill)
    .filter((id) => typeof id === "string" && classDefinition.skills.includes(id)))];
  const basicSkillId = classDefinition.basicSkillId ?? classDefinition.skills[0];
  if (!skills.includes(basicSkillId)) skills.unshift(basicSkillId);

  return {
    id: safeString(source.id, classDefaults.id, 80),
    name: safeString(source.name, classDefaults.name, 30),
    classId,
    classChosen,
    level,
    experience,
    totalExperience: clampInteger(
      source.totalExperience,
      0,
      Number.MAX_SAFE_INTEGER,
      0,
    ),
    unspentStatPoints,
    unspentSkillPoints,
    skillLevels,
    prestigeCount,
    baseStats,
    equipment,
    inventory,
    skills,
    gold: clampInteger(source.gold, 0, Number.MAX_SAFE_INTEGER, 0),
  };
}

/** A convenient explicit clone for preview/state reducers. */
export function cloneHero(hero) {
  return sanitizeHero(hero);
}

/**
 * Item save shape:
 * { id, name, emoji, slot, rarity, level, baseStats,
 *   affixes:[{id,name,stat,value,format}], effect|null, power, seed }
 */
export function sanitizeItem(candidate, options = {}) {
  if (!isRecord(candidate)) return null;
  const forcedSlot = EQUIPMENT_SLOT_IDS.includes(options.forcedSlot)
    ? options.forcedSlot
    : null;
  const slot = forcedSlot || (EQUIPMENT_SLOT_IDS.includes(candidate.slot)
    ? candidate.slot
    : null);
  if (!slot) return null;

  const rawRarity = isRecord(candidate.rarity)
    ? candidate.rarity.id ?? candidate.rarity.key
    : candidate.rarity;
  const rarityAliases = { normal: "common", excellent: "uncommon" };
  const normalizedRarity = rarityAliases[rawRarity] ?? rawRarity;
  const rarity = RARITY_IDS.includes(normalizedRarity) ? normalizedRarity : "common";
  const level = clampInteger(candidate.level ?? candidate.itemLevel, 1, 999, 1);
  const baseStats = sanitizeBonusRecord(candidate.baseStats ?? candidate.stats);
  const affixes = Array.isArray(candidate.affixes)
    ? candidate.affixes
      .slice(0, CONFIG.rarities[rarity].maxAffixes)
      .map(sanitizeAffix)
      .filter(Boolean)
    : [];
  const effect = sanitizeEffect(candidate.effect ?? candidate.legendaryEffect, rarity);
  const fallbackName = `${CONFIG.rarities[rarity].name}${CONFIG.equipmentSlots[slot].name}`;
  const name = safeString(candidate.name, fallbackName, 50);
  const fallbackId = `item-${hashSeed(JSON.stringify([
    slot,
    rarity,
    level,
    name,
    baseStats,
    affixes,
  ])).toString(16)}`;
  const seed = typeof candidate.seed === "number" && Number.isFinite(candidate.seed)
    ? candidate.seed
    : typeof candidate.seed === "string"
      ? candidate.seed.slice(0, 100)
      : null;

  return {
    id: safeString(candidate.id, fallbackId, 100),
    name,
    emoji: safeString(candidate.emoji, CONFIG.equipmentSlots[slot].emoji, 8),
    slot,
    rarity,
    level,
    baseStats,
    affixes,
    effect,
    power: clampInteger(candidate.power, 0, CONFIG.stats.maximumValue, 0),
    seed,
    // 玩家手动锁定的装备不会被单件/批量出售。
    locked: candidate.locked === true,
  };
}

/** Returns all final combat stats, including an equipment bonus breakdown. */
export function getHeroStats(hero) {
  const clean = sanitizeHero(hero);
  const tuning = CONFIG.stats;
  const classDefinition = getClassDefinition(clean.classId);
  const classCombat = classDefinition.combat ?? {};
  const prestige = getPrestigeBonuses(clean);
  const equipmentBonuses = collectEquipmentBonuses(clean.equipment);
  const attributes = {};

  for (const key of STAT_KEYS) {
    attributes[key] = clampNumber(
      clean.baseStats[key] + equipmentBonuses[key],
      0,
      tuning.maximumValue,
      clean.baseStats[key],
    );
  }

  const baseMaxHp =
    (Number.isFinite(classCombat.baseHp) ? classCombat.baseHp : tuning.baseHp)
      + attributes.vitality * (Number.isFinite(classCombat.hpPerVitality)
        ? classCombat.hpPerVitality
        : tuning.hpPerVitality)
      + clean.level * (Number.isFinite(classCombat.hpPerLevel)
        ? classCombat.hpPerLevel
        : tuning.hpPerLevel)
      + equipmentBonuses.maxHp;
  const maxHp = Math.max(1, Math.round(baseMaxHp * prestige.multiplier));
  const attackWeights = classCombat.attackPerAttribute ?? {
    strength: tuning.attackPerStrength,
    agility: tuning.attackPerAgility,
    intelligence: tuning.attackPerIntelligence,
    vitality: 0,
  };
  const rawAttack = (Number.isFinite(classCombat.baseAttack) ? classCombat.baseAttack : tuning.baseAttack)
    + STAT_KEYS.reduce((sum, stat) => sum + attributes[stat] * (attackWeights[stat] ?? 0), 0)
    + clean.level * (Number.isFinite(classCombat.attackPerLevel)
      ? classCombat.attackPerLevel
      : tuning.attackPerLevel)
    + equipmentBonuses.attack;
  // 职业伤害类型决定吃"法术增伤"还是"物理增伤"词条(法师/死灵为法术)。
  const classDamageBonus = classDefinition.damageType === "magic"
    ? equipmentBonuses.magicDamagePercent
    : equipmentBonuses.physicalDamagePercent;
  const damageMultiplier = Math.max(
    0.1,
    1 + equipmentBonuses.damagePercent + classDamageBonus,
  );
  // damageMultiplier is consumed by combat; folding it into attack here would
  // apply percentage-damage affixes twice.
  const attack = Math.max(1, Math.round(rawAttack * prestige.multiplier));
  const baseDefense =
    (Number.isFinite(classCombat.baseDefense) ? classCombat.baseDefense : tuning.baseDefense)
      + attributes.vitality * (Number.isFinite(classCombat.defensePerVitality)
        ? classCombat.defensePerVitality
        : tuning.defensePerVitality)
      + attributes.strength * (Number.isFinite(classCombat.defensePerStrength)
        ? classCombat.defensePerStrength
        : tuning.defensePerStrength)
      + clean.level * (Number.isFinite(classCombat.defensePerLevel)
        ? classCombat.defensePerLevel
        : tuning.defensePerLevel)
      + equipmentBonuses.defense;
  const defense = Math.max(0, Math.round(baseDefense * prestige.multiplier));
  const speed = Math.max(1, Math.round(
    (Number.isFinite(classCombat.baseSpeed) ? classCombat.baseSpeed : tuning.baseSpeed)
      + attributes.agility * (Number.isFinite(classCombat.speedPerAgility)
        ? classCombat.speedPerAgility
        : tuning.speedPerAgility)
      + equipmentBonuses.speed,
  ));
  const baseCritChance = Number.isFinite(classCombat.baseCritChance)
    ? classCombat.baseCritChance
    : tuning.baseCritChance;
  const critChancePerAgility = Number.isFinite(classCombat.critChancePerAgility)
    ? classCombat.critChancePerAgility
    : tuning.critChancePerAgility;
  const maxCritChance = Number.isFinite(classCombat.maxCritChance)
    ? classCombat.maxCritChance
    : tuning.maxCritChance;
  const critChance = clampNumber(
    baseCritChance
      + attributes.agility * critChancePerAgility
      + equipmentBonuses.critChance,
    0,
    maxCritChance,
    baseCritChance,
  );
  const baseCritDamage = Number.isFinite(classCombat.baseCritDamage)
    ? classCombat.baseCritDamage
    : tuning.baseCritDamage;
  const critDamage = Math.max(1, baseCritDamage + equipmentBonuses.critDamage);
  const baseDodgeChance = Number.isFinite(classCombat.baseDodgeChance)
    ? classCombat.baseDodgeChance
    : tuning.baseDodgeChance;
  const dodgeChancePerAgility = Number.isFinite(classCombat.dodgeChancePerAgility)
    ? classCombat.dodgeChancePerAgility
    : tuning.dodgeChancePerAgility;
  const maxDodgeChance = Number.isFinite(classCombat.maxDodgeChance)
    ? classCombat.maxDodgeChance
    : tuning.maxDodgeChance;
  const dodgeChance = clampNumber(
    baseDodgeChance
      + attributes.agility * dodgeChancePerAgility
      + equipmentBonuses.dodgeChance,
    0,
    maxDodgeChance,
    baseDodgeChance,
  );
  const damageReduction = clampNumber(
    equipmentBonuses.damageReduction,
    0,
    tuning.maxDamageReduction,
    0,
  );

  const stats = {
    ...attributes,
    attributes,
    maxHp,
    hp: maxHp,
    health: maxHp,
    attack,
    physicalAttack: attack,
    defense,
    armor: defense,
    speed,
    critChance,
    critDamage,
    dodgeChance,
    damageMultiplier,
    classId: clean.classId,
    prestigeCount: prestige.count,
    damageReduction,
    lifesteal: equipmentBonuses.lifesteal,
    thorns: equipmentBonuses.thorns,
    armorPenetration: equipmentBonuses.armorPenetration,
    multiHitChance: equipmentBonuses.multiHitChance,
    burnChance: equipmentBonuses.burning,
    equipmentBonuses,
  };
  stats.power = calculatePower(stats);
  return stats;
}

export function getPower(hero) {
  return getHeroStats(hero).power;
}

/** Returns progress within the current level; experience never de-levels a hero. */
export function getLevelProgress(hero) {
  const clean = sanitizeHero(hero);
  const maxLevel = clean.level >= CONFIG.hero.maxLevel;
  const required = maxLevel ? 0 : getExperienceRequirement(clean.level);
  const ratio = maxLevel ? 1 : clampNumber(clean.experience / required, 0, 1, 0);
  return {
    level: clean.level,
    current: clean.experience,
    experience: clean.experience,
    required,
    total: required,
    remaining: maxLevel ? 0 : Math.max(0, required - clean.experience),
    ratio,
    percent: Math.round(ratio * 100),
    maxLevel,
  };
}

export function getExperienceRequirement(level) {
  const safeLevel = clampInteger(level, 1, CONFIG.hero.maxLevel, 1);
  if (safeLevel >= CONFIG.hero.maxLevel) return 0;
  const progression = CONFIG.hero.experience;
  return Math.max(1, Math.floor(
    progression.base * progression.growth ** (safeLevel - 1)
      + progression.linear * (safeLevel - 1),
  ));
}

/** Adds XP without mutating hero. Pass {autoAllocate:true} to spend new points. */
export function addExperience(hero, amount, options = {}) {
  let next = sanitizeHero(hero);
  const gained = clampInteger(amount, 0, Number.MAX_SAFE_INTEGER, 0);
  if (gained <= 0) return next;

  next.experience = Math.min(Number.MAX_SAFE_INTEGER, next.experience + gained);
  next.totalExperience = Math.min(Number.MAX_SAFE_INTEGER, next.totalExperience + gained);
  while (next.level < CONFIG.hero.maxLevel) {
    const required = getExperienceRequirement(next.level);
    if (required <= 0 || next.experience < required) break;
    next.experience -= required;
    next.level += 1;
    next.unspentStatPoints = Math.min(
      CONFIG.stats.maximumValue,
      next.unspentStatPoints + CONFIG.hero.statPointsPerLevel,
    );
    if (next.level % CONFIG.skillProgression.pointEveryLevels === 0) {
      next.unspentSkillPoints = Math.min(
        CONFIG.stats.maximumValue,
        next.unspentSkillPoints + CONFIG.skillProgression.pointsPerAward,
      );
    }
  }
  if (next.level >= CONFIG.hero.maxLevel) next.experience = 0;

  const autoAllocate = options === true || options?.autoAllocate === true;
  if (autoAllocate && next.unspentStatPoints > 0) next = applyAutoAllocation(next);
  return next;
}

/** Spends up to amount points on one base attribute; invalid input is a no-op. */
export function allocateStat(hero, stat, amount = 1) {
  const next = sanitizeHero(hero);
  if (!STAT_KEYS.includes(stat)) return next;
  const requested = clampInteger(amount, 0, CONFIG.stats.maximumValue, 0);
  const capacity = Math.max(0, CONFIG.stats.maximumValue - next.baseStats[stat]);
  const spent = Math.min(requested, next.unspentStatPoints, capacity);
  if (spent <= 0) return next;
  next.baseStats[stat] = Math.min(CONFIG.stats.maximumValue, next.baseStats[stat] + spent);
  next.unspentStatPoints -= spent;
  return next;
}

/** Applies a multi-stat allocation in stable STAT_KEYS order. */
export function allocateStats(hero, allocation = {}) {
  let next = sanitizeHero(hero);
  if (!isRecord(allocation)) return next;
  for (const stat of STAT_KEYS) next = allocateStat(next, stat, allocation[stat]);
  return next;
}

/** Spends all remaining points using the current class recommendation. */
export function applyAutoAllocation(hero) {
  const next = sanitizeHero(hero);
  const available = next.unspentStatPoints;
  if (available <= 0) return next;
  const classDefinition = CONFIG.classes[next.classId] ?? CONFIG.classes.warrior;
  const weights = classDefinition.autoAllocation;
  const startingStats = classDefinition.startingStats;
  const invested = Object.fromEntries(STAT_KEYS.map((stat) => [
    stat,
    Math.max(0, next.baseStats[stat] - startingStats[stat]),
  ]));
  const targetTotal = Object.values(invested).reduce((sum, value) => sum + value, 0) + available;
  const needs = Object.fromEntries(STAT_KEYS.map((stat) => [
    stat,
    Math.max(0, targetTotal * (weights[stat] ?? 0) - invested[stat]),
  ]));
  let needTotal = Object.values(needs).reduce((sum, value) => sum + value, 0);
  if (needTotal <= 0) {
    for (const stat of STAT_KEYS) needs[stat] = Math.max(0, weights[stat] ?? 0);
    needTotal = Object.values(needs).reduce((sum, value) => sum + value, 0) || 1;
  }

  const exact = Object.fromEntries(STAT_KEYS.map((stat) => [
    stat,
    available * needs[stat] / needTotal,
  ]));
  const allocation = Object.fromEntries(STAT_KEYS.map((stat) => [stat, Math.floor(exact[stat])]));
  let remaining = available - Object.values(allocation).reduce((sum, value) => sum + value, 0);
  const order = [...STAT_KEYS].sort((a, b) =>
    (exact[b] - allocation[b]) - (exact[a] - allocation[a])
      || STAT_KEYS.indexOf(a) - STAT_KEYS.indexOf(b));
  for (let index = 0; remaining > 0; index += 1, remaining -= 1) {
    allocation[order[index % order.length]] += 1;
  }

  let spent = 0;
  for (const stat of STAT_KEYS) {
    const before = next.baseStats[stat];
    next.baseStats[stat] = Math.min(
      CONFIG.stats.maximumValue,
      before + allocation[stat],
    );
    spent += next.baseStats[stat] - before;
  }
  next.unspentStatPoints = Math.max(0, available - spent);
  return next;
}

/**
 * Equips an item immutably. An item already in the backpack is removed there;
 * the replaced item is put back. A full backpack makes unsafe swaps a no-op.
 */
export function equipItem(hero, item) {
  const current = sanitizeHero(hero);
  const cleanItem = sanitizeItem(item);
  if (!cleanItem) return current;

  const inventory = [...current.inventory];
  const inventoryIndex = inventory.findIndex((entry) => entry.id === cleanItem.id);
  if (inventoryIndex >= 0) inventory.splice(inventoryIndex, 1);
  const replaced = current.equipment[cleanItem.slot];
  if (replaced && inventory.length >= CONFIG.save.maxInventoryItems) return current;
  if (replaced) inventory.push(replaced);

  return {
    ...current,
    equipment: { ...current.equipment, [cleanItem.slot]: cleanItem },
    inventory,
  };
}

/** Unequips one slot immutably; a full backpack leaves the hero unchanged. */
export function unequipItem(hero, slot) {
  const current = sanitizeHero(hero);
  if (!EQUIPMENT_SLOT_IDS.includes(slot)) return current;
  const item = current.equipment[slot];
  if (!item || current.inventory.length >= CONFIG.save.maxInventoryItems) return current;
  return {
    ...current,
    equipment: { ...current.equipment, [slot]: null },
    inventory: [...current.inventory, item],
  };
}

/** Converts persistent hero data to the nested unit shape consumed by combat. */
export function createHeroCombatant(hero) {
  const clean = sanitizeHero(hero);
  const classDefinition = CONFIG.classes[clean.classId] ?? CONFIG.classes.warrior;
  const stats = getHeroStats(clean);
  return {
    id: clean.id,
    name: clean.name,
    emoji: classDefinition.emoji,
    level: clean.level,
    classId: clean.classId,
    isPlayer: true,
    stats: { ...stats, hp: stats.maxHp },
    skills: getHeroSkills(clean),
  };
}

function collectEquipmentBonuses(equipment) {
  const bonuses = Object.fromEntries(BONUS_KEYS.map((key) => [key, 0]));
  bonuses.lifesteal = 0;
  bonuses.thorns = 0;
  bonuses.armorPenetration = 0;
  bonuses.multiHitChance = 0;
  bonuses.burning = 0;

  for (const item of Object.values(equipment)) {
    if (!item) continue;
    addBonuses(bonuses, item.baseStats);
    for (const affix of item.affixes) {
      if (Object.hasOwn(bonuses, affix.stat)) bonuses[affix.stat] += affix.value;
    }
    if (item.effect && Object.hasOwn(bonuses, item.effect.type)) {
      bonuses[item.effect.type] += item.effect.value;
    }
  }
  return bonuses;
}

function addBonuses(target, source) {
  if (!isRecord(source)) return;
  for (const key of BONUS_KEYS) {
    if (Number.isFinite(source[key])) target[key] += source[key];
  }
}

function calculatePower(stats) {
  const weights = CONFIG.stats.powerWeights;
  const effectTotal = (stats.lifesteal ?? 0)
    + (stats.thorns ?? 0)
    + (stats.armorPenetration ?? 0)
    + (stats.multiHitChance ?? 0)
    + (stats.burnChance ?? 0);
  return Math.max(1, Math.round(
    stats.maxHp * weights.maxHp
      + stats.attack * weights.attack
      + stats.defense * weights.defense
      + stats.speed * weights.speed
      + stats.critChance * weights.critChance
      + stats.critDamage * weights.critDamage
      + stats.dodgeChance * (weights.dodgeChance ?? 0)
      + stats.damageReduction * weights.damageReduction
      + stats.attack * Math.max(0, stats.damageMultiplier - 1) * weights.attack
      + effectTotal * (weights.legendaryEffect ?? 0),
  ));
}

function sanitizeBonusRecord(candidate) {
  if (!isRecord(candidate)) return {};
  const result = {};
  for (const key of BONUS_KEYS) {
    if (!Number.isFinite(candidate[key])) continue;
    const max = [
      "critChance",
      "damagePercent",
      "physicalDamagePercent",
      "magicDamagePercent",
      "damageReduction",
      "dodgeChance",
    ].includes(key)
      ? 1
      : CONFIG.stats.maximumValue;
    result[key] = clampNumber(candidate[key], 0, max, 0);
  }
  return result;
}

function sanitizeAffix(candidate) {
  if (!isRecord(candidate)) return null;
  const definition = CONFIG.affixes[candidate.id] ?? Object.values(CONFIG.affixes)
    .find((entry) => entry.stat === candidate.stat);
  if (!definition) return null;
  const value = clampNumber(
    candidate.value,
    0,
    ["percent", "ratio"].includes(definition.format) ? 1 : CONFIG.stats.maximumValue,
    0,
  );
  if (value <= 0) return null;
  return {
    id: definition.id,
    name: definition.name,
    stat: definition.stat,
    value,
    format: definition.format ?? "number",
  };
}

function sanitizeEffect(candidate, rarity) {
  if (rarity !== "legendary") return null;
  const source = typeof candidate === "string" ? { id: candidate } : candidate;
  if (!isRecord(source)) return null;
  const definition = CONFIG.legendaryEffects[source.id];
  if (!definition) return null;
  return {
    id: definition.id,
    name: definition.name,
    description: definition.description,
    type: definition.type,
    value: clampNumber(source.value, 0, 1, definition.value),
  };
}

function firstRecord(...values) {
  return values.find(isRecord) ?? null;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeString(value, fallback, maxLength) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : fallback;
}

function nonNegativeInteger(value) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function getSkillInitialLevel(skillId) {
  const definition = CONFIG.skills[skillId];
  return clampInteger(definition?.leveling?.initialLevel, 1, 100, 1);
}

function getSkillMaxLevel(skillId) {
  const initial = getSkillInitialLevel(skillId);
  return clampInteger(definitionNumber(CONFIG.skills[skillId]?.leveling?.maxLevel), initial, 1_000, initial);
}

function definitionNumber(value) {
  return Number.isFinite(value) ? value : NaN;
}

function clampInteger(value, min, max, fallback) {
  return Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.floor(value)))
    : fallback;
}

function clampNumber(value, min, max, fallback) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}
