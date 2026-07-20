import { CONFIG } from "./config.js";

const MAX_SAFE = Number.MAX_SAFE_INTEGER;

const DEFAULT_SKILL_PROGRESSION = Object.freeze({
  initialLevel: 1,
  maxLevel: 10,
  pointEveryLevels: 1,
  pointsPerAward: 1,
  pointsPerPrestige: 3,
});

const DEFAULT_PRESTIGE = Object.freeze({
  minLevel: 0,
  maxCount: 99,
  combatBonusPerCount: 0.05,
  pointsPerCount: 3,
  resetSkillLevels: true,
  refundSkillPointsOnPrestige: true,
  initialFloorCap: 1,
  floorsPerCount: 0,
});

const hasOwn = (value, key) =>
  Object.prototype.hasOwnProperty.call(value ?? {}, key);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function firstRecord(...values) {
  return values.find(isRecord) ?? null;
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max, fallback = min) {
  return Math.min(max, Math.max(min, finiteNumber(value, fallback)));
}

function integer(value, min, max, fallback) {
  return Math.floor(clamp(value, min, max, fallback));
}

function positiveInteger(value, fallback = 0) {
  return integer(value, 0, MAX_SAFE, fallback);
}

function uniqueSkillIds(entries) {
  if (!Array.isArray(entries)) return [];
  return [...new Set(entries
    .map((entry) => isRecord(entry) ? entry.id ?? entry.key : entry)
    .map((id) => String(id ?? "").trim())
    .filter(Boolean))];
}

function getConfiguredSkill(skillOrId) {
  const supplied = isRecord(skillOrId) ? skillOrId : null;
  const id = String(supplied?.id ?? supplied?.key ?? skillOrId ?? "").trim();
  if (!id) return null;
  const configured = isRecord(CONFIG.skills?.[id]) ? CONFIG.skills[id] : null;
  if (!configured && !supplied) return null;
  return { ...(configured ?? {}), ...(supplied ?? {}), id };
}

function getGlobalSkillProgression() {
  const source = firstRecord(
    CONFIG.skillProgression,
    CONFIG.hero?.skillProgression,
    CONFIG.skills?.progression,
  ) ?? {};
  const pointsPerLevel = source.pointsPerLevel ?? source.pointsPerLevelUp;
  const pointEveryLevels = integer(
    source.pointEveryLevels
      ?? source.levelInterval
      ?? (pointsPerLevel === undefined ? DEFAULT_SKILL_PROGRESSION.pointEveryLevels : 1),
    1,
    10_000,
    DEFAULT_SKILL_PROGRESSION.pointEveryLevels,
  );
  return {
    initialLevel: integer(
      source.initialLevel ?? source.startLevel,
      1,
      100,
      DEFAULT_SKILL_PROGRESSION.initialLevel,
    ),
    maxLevel: integer(
      source.maxLevel ?? source.levelCap,
      1,
      1_000,
      DEFAULT_SKILL_PROGRESSION.maxLevel,
    ),
    pointEveryLevels,
    pointsPerAward: positiveInteger(
      source.pointsPerAward ?? pointsPerLevel,
      DEFAULT_SKILL_PROGRESSION.pointsPerAward,
    ),
    pointsPerPrestige: positiveInteger(
      source.pointsPerPrestige
        ?? source.prestigePoints
        ?? CONFIG.prestige?.skillPointsPerCount
        ?? CONFIG.prestige?.pointsPerCount,
      DEFAULT_SKILL_PROGRESSION.pointsPerPrestige,
    ),
    initialPoints: positiveInteger(
      source.initialPoints ?? source.startingPoints,
      0,
    ),
  };
}

function getSkillLeveling(definition) {
  const global = getGlobalSkillProgression();
  const source = firstRecord(
    definition?.leveling,
    definition?.progression,
    definition?.upgrade,
  ) ?? {};
  const initialLevel = integer(
    source.initialLevel
      ?? source.startLevel
      ?? definition?.initialLevel
      ?? global.initialLevel,
    1,
    100,
    global.initialLevel,
  );
  const maxLevel = integer(
    source.maxLevel
      ?? source.levelCap
      ?? definition?.maxLevel
      ?? global.maxLevel,
    initialLevel,
    1_000,
    Math.max(initialLevel, global.maxLevel),
  );
  const perLevel = firstRecord(
    source.perLevel,
    source.perRank,
    source.growth,
    definition?.perLevel,
    definition?.perRank,
  ) ?? {};
  const milestones = source.milestones ?? source.breakpoints ?? definition?.milestones;
  const levels = source.levels ?? source.levelValues ?? definition?.levels;
  return { initialLevel, maxLevel, perLevel, milestones, levels };
}

function getClassSkillIds(heroOrClassId) {
  const classId = isRecord(heroOrClassId)
    ? heroOrClassId.classId
    : heroOrClassId;
  const classDefinition = CONFIG.classes?.[classId]
    ?? CONFIG.classes?.[CONFIG.hero?.classId]
    ?? null;
  const configured = uniqueSkillIds(classDefinition?.skills);
  if (configured.length) return configured;
  const fallback = uniqueSkillIds(CONFIG.hero?.startingSkills);
  if (fallback.length) return fallback;
  // 兜底列表要排除敌方专属技能,避免它们漏进职业技能面板。
  return Object.keys(CONFIG.skills ?? {}).filter((id) =>
    id !== "enemy_attack" && CONFIG.skills?.[id]?.enemyOnly !== true);
}

function getHeroSkillEntries(hero) {
  const classSkills = getClassSkillIds(hero);
  if (!Array.isArray(hero?.skills) || hero.skills.length === 0) return classSkills;
  const allowed = new Set(classSkills);
  const explicit = hero.skills.filter((entry) => allowed.has(String(
    isRecord(entry) ? entry.id ?? entry.key : entry,
  ).trim()));
  return explicit.length > 0 ? explicit : classSkills;
}

function getSkillLevelMap(hero) {
  const source = firstRecord(hero?.skillLevels, hero?.skillRanks, hero?.skillProgress?.levels);
  return source ? { ...source } : {};
}

function getExplicitSkillLevel(hero, skillId) {
  const levels = getSkillLevelMap(hero);
  if (hasOwn(levels, skillId)) return levels[skillId];
  for (const entry of getHeroSkillEntries(hero)) {
    if (!isRecord(entry)) continue;
    const id = String(entry.id ?? entry.key ?? "").trim();
    if (id === skillId && (entry.level !== undefined || entry.rank !== undefined)) {
      return entry.level ?? entry.rank;
    }
  }
  return undefined;
}

function isSkillAvailable(hero, skillId) {
  const entries = getHeroSkillEntries(hero);
  if (entries.length === 0) return false;
  return entries.some((entry) => String(
    isRecord(entry) ? entry.id ?? entry.key : entry,
  ).trim() === skillId);
}

function getCombatAoeCap() {
  const damage = firstRecord(CONFIG.combat?.damage, CONFIG.damage) ?? {};
  return clamp(
    damage.aoeMultiplierCap
      ?? damage.areaMultiplierCap
      ?? CONFIG.combat?.aoeMultiplierCap,
    0.01,
    100,
    0.9,
  );
}

function getCombatGuardCap() {
  const damage = firstRecord(CONFIG.combat?.damage, CONFIG.damage) ?? {};
  return clamp(
    damage.maxGuardReduction
      ?? damage.guardReductionCap,
    0,
    0.99,
    0.8,
  );
}

function getCombatDodgeCap() {
  const damage = firstRecord(CONFIG.combat?.damage, CONFIG.damage) ?? {};
  return clamp(
    damage.maxDodgeChance
      ?? damage.dodgeChanceCap
      ?? CONFIG.combat?.maxDodgeChance,
    0,
    1,
    0.75,
  );
}

function getCombatHitCap() {
  return integer(
    CONFIG.combat?.maxHitsPerAction,
    1,
    100,
    12,
  );
}

function applyNumericChanges(target, changes, factor = 1) {
  if (!isRecord(changes)) return;
  for (const [key, rawDelta] of Object.entries(changes)) {
    const delta = Number(rawDelta);
    if (!Number.isFinite(delta)) continue;
    const current = Number(target[key]);
    if (Number.isFinite(current)) target[key] = current + delta * factor;
  }
}

function normalizeMilestones(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (!isRecord(entry)) return null;
        const level = integer(entry.level ?? entry.rank, 1, 1_000, 1);
        const changes = firstRecord(entry.add, entry.changes, entry.effects, entry.values);
        return changes ? { level, changes } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.level - b.level);
  }
  if (!isRecord(value)) return [];
  return Object.entries(value)
    .map(([level, changes]) => ({
      level: integer(level, 1, 1_000, 1),
      changes: firstRecord(changes?.add, changes?.changes, changes) ?? {},
    }))
    .sort((a, b) => a.level - b.level);
}

function applyLevelValues(target, values, level) {
  if (!values) return;
  const entry = Array.isArray(values)
    ? values[level - 1] ?? values[level]
    : values[String(level)] ?? values[level];
  if (!isRecord(entry)) return;
  for (const [key, value] of Object.entries(entry)) {
    if (key === "id" || key === "leveling") continue;
    if (typeof value === "number" && Number.isFinite(value)) target[key] = value;
    else if (typeof value === "boolean" || typeof value === "string") target[key] = value;
  }
}

function clampResolvedSkill(skill) {
  const type = String(skill.type ?? skill.category ?? "single").toLowerCase();
  if (skill.multiplier !== undefined) {
    const cap = type === "aoe" || ["area", "group", "all"].includes(type)
      ? getCombatAoeCap()
      : 100;
    skill.multiplier = clamp(skill.multiplier, 0, cap, 0);
  }
  if (skill.cooldown !== undefined) skill.cooldown = integer(skill.cooldown, 0, 10_000, 0);
  if (skill.reduction !== undefined) {
    skill.reduction = clamp(skill.reduction, 0, getCombatGuardCap(), 0);
  }
  if (skill.duration !== undefined) skill.duration = integer(skill.duration, 1, 10_000, 1);
  if (skill.triggerBelowHpRatio !== undefined) {
    skill.triggerBelowHpRatio = clamp(skill.triggerBelowHpRatio, 0, 1, 0);
  }
  if (skill.minimumTargets !== undefined) {
    skill.minimumTargets = integer(skill.minimumTargets, 1, 100, 1);
  }
  if (skill.hitCount !== undefined) {
    skill.hitCount = integer(skill.hitCount, 1, getCombatHitCap(), 1);
  }
  if (skill.critChanceBonus !== undefined) {
    skill.critChanceBonus = clamp(skill.critChanceBonus, 0, 1, 0);
  }
  if (skill.dodgeBonus !== undefined) {
    skill.dodgeBonus = clamp(skill.dodgeBonus, 0, getCombatDodgeCap(), 0);
  }
  if (skill.resourceCost !== undefined) skill.resourceCost = clamp(skill.resourceCost, 0, MAX_SAFE, 0);
  if (skill.flatDamage !== undefined) skill.flatDamage = clamp(skill.flatDamage, 0, MAX_SAFE, 0);
  if (skill.healRatio !== undefined) skill.healRatio = clamp(skill.healRatio, 0, 10, 0);
  // 召唤/形态类字段:升级成长同样要被钳制,防止异常存档制造失控数值。
  if (skill.summonCount !== undefined) skill.summonCount = integer(skill.summonCount, 1, 10, 1);
  if (skill.maxMinions !== undefined) skill.maxMinions = integer(skill.maxMinions, 0, 20, 0);
  if (skill.minionHpRatio !== undefined) skill.minionHpRatio = clamp(skill.minionHpRatio, 0.01, 10, 0.3);
  if (skill.minionAttackRatio !== undefined) skill.minionAttackRatio = clamp(skill.minionAttackRatio, 0.01, 10, 0.4);
  if (skill.minionDefenseRatio !== undefined) skill.minionDefenseRatio = clamp(skill.minionDefenseRatio, 0, 10, 0.35);
  if (skill.minionSpeedRatio !== undefined) skill.minionSpeedRatio = clamp(skill.minionSpeedRatio, 0.01, 10, 0.85);
  if (skill.damageBonus !== undefined) skill.damageBonus = clamp(skill.damageBonus, 0, 5, 0);
  if (skill.lifestealBonus !== undefined) skill.lifestealBonus = clamp(skill.lifestealBonus, 0, 1, 0);
  return skill;
}

/** Returns the configured level of a skill, with a safe level-one fallback. */
export function getSkillLevel(hero, skillId) {
  const id = String(skillId ?? "").trim();
  const definition = getConfiguredSkill(id);
  if (!definition) return 0;
  const leveling = getSkillLeveling(definition);
  const explicit = getExplicitSkillLevel(hero, id);
  return integer(
    explicit ?? leveling.initialLevel,
    leveling.initialLevel,
    leveling.maxLevel,
    leveling.initialLevel,
  );
}

/** Resolves one skill at a level without mutating config or the supplied object. */
export function resolveSkillAtLevel(skillOrId, level) {
  const definition = getConfiguredSkill(skillOrId);
  if (!definition) return null;
  const leveling = getSkillLeveling(definition);
  const rank = integer(
    level ?? definition.level ?? definition.skillLevel,
    leveling.initialLevel,
    leveling.maxLevel,
    leveling.initialLevel,
  );
  const resolved = {
    ...definition,
    level: rank,
    skillLevel: rank,
    maxLevel: leveling.maxLevel,
  };
  const rankDelta = rank - leveling.initialLevel;
  applyNumericChanges(resolved, leveling.perLevel, rankDelta);
  for (const milestone of normalizeMilestones(leveling.milestones)) {
    if (milestone.level <= rank) applyNumericChanges(resolved, milestone.changes);
  }
  applyLevelValues(resolved, leveling.levels, rank);
  return clampResolvedSkill(resolved);
}

/** Returns all active skills for a hero with their current level applied. */
export function getHeroSkills(hero) {
  const entries = getHeroSkillEntries(hero);
  const skills = [];
  const seen = new Set();
  for (const entry of entries) {
    const id = String(isRecord(entry) ? entry.id ?? entry.key : entry ?? "").trim();
    if (!id || seen.has(id)) continue;
    const definition = getConfiguredSkill(entry);
    if (!definition || definition.enabled === false || definition.active === false) continue;
    const resolved = resolveSkillAtLevel(
      definition,
      getSkillLevel(hero, id),
    );
    if (!resolved) continue;
    skills.push(resolved);
    seen.add(id);
  }

  if (!skills.some((skill) => skill.isBasic === true)) {
    const classDefinition = CONFIG.classes?.[hero?.classId]
      ?? CONFIG.classes?.[CONFIG.hero?.classId]
      ?? {};
    const basicId = classDefinition.basicSkillId ?? "basic_attack";
    const basic = resolveSkillAtLevel(basicId);
    if (basic) skills.unshift(basic);
  }
  return skills;
}

/** Returns the number of skill points earned by reaching a level. */
export function getSkillPointsEarnedAtLevel(level) {
  const progression = getGlobalSkillProgression();
  const safeLevel = integer(level, 1, MAX_SAFE, 1);
  const awards = Math.max(
    0,
    Math.floor(safeLevel / progression.pointEveryLevels)
      - Math.floor(1 / progression.pointEveryLevels),
  );
  return progression.initialPoints + awards * progression.pointsPerAward;
}

/** Returns immutable skill-point accounting, including migration-friendly totals. */
export function getSkillPointState(hero) {
  const progression = getGlobalSkillProgression();
  const levels = getSkillLevelMap(hero);
  const ids = uniqueSkillIds([
    ...getHeroSkillEntries(hero),
    ...Object.keys(levels),
  ]);
  let spent = 0;
  for (const id of ids) {
    const definition = getConfiguredSkill(id);
    if (!definition) continue;
    const leveling = getSkillLeveling(definition);
    spent += Math.max(0, getSkillLevel(hero, id) - leveling.initialLevel);
  }

  const prestigeCount = getPrestigeCount(hero);
  const earnedFromLevels = getSkillPointsEarnedAtLevel(hero?.level ?? 1);
  const earnedFromPrestige = prestigeCount * progression.pointsPerPrestige;
  const earned = earnedFromLevels + earnedFromPrestige;
  const explicitUnspent = Number.isFinite(hero?.unspentSkillPoints)
    ? hero.unspentSkillPoints
    : Number.isFinite(hero?.skillPoints)
      ? hero.skillPoints
      : hero?.skillPoints && Number.isFinite(hero.skillPoints.unspent)
        ? hero.skillPoints.unspent
        : null;
  const unspent = explicitUnspent === null
    ? Math.max(0, earned - spent)
    : positiveInteger(explicitUnspent);
  return {
    unspent,
    available: unspent,
    spent,
    total: spent + unspent,
    earned,
    earnedFromLevels,
    earnedFromPrestige,
    pointsPerPrestige: progression.pointsPerPrestige,
  };
}

function cloneSkillState(hero) {
  const source = isRecord(hero) ? hero : {};
  return {
    ...source,
    skills: Array.isArray(source.skills)
      ? source.skills.map((entry) => isRecord(entry) ? { ...entry } : entry)
      : source.skills,
    skillLevels: getSkillLevelMap(source),
  };
}

/** Spends up to amount skill points on one non-basic skill immutably. */
export function upgradeSkill(hero, skillId, amount = 1) {
  const next = cloneSkillState(hero);
  const id = String(skillId ?? "").trim();
  const definition = getConfiguredSkill(id);
  if (!definition || definition.isBasic === true || !isSkillAvailable(hero, id)) return next;
  const leveling = getSkillLeveling(definition);
  const current = getSkillLevel(hero, id);
  const state = getSkillPointState(hero);
  const requested = positiveInteger(amount, 1);
  const points = Math.min(
    requested,
    state.unspent,
    Math.max(0, leveling.maxLevel - current),
  );
  if (points <= 0) return next;
  next.skillLevels[id] = current + points;
  next.unspentSkillPoints = state.unspent - points;
  return next;
}

/** Refunds all invested skill points and returns every learned skill to its base rank. */
export function resetSkillPoints(hero) {
  const next = cloneSkillState(hero);
  const state = getSkillPointState(hero);
  const ids = uniqueSkillIds([
    ...getHeroSkillEntries(hero),
    ...Object.keys(next.skillLevels),
  ]);
  for (const id of ids) {
    const definition = getConfiguredSkill(id);
    if (!definition) continue;
    next.skillLevels[id] = getSkillLeveling(definition).initialLevel;
  }
  next.unspentSkillPoints = state.unspent + state.spent;
  return next;
}

function getPrestigeConfig() {
  const source = firstRecord(CONFIG.prestige, CONFIG.hero?.prestige) ?? {};
  const globalFloor = integer(CONFIG.dungeon?.maxFloor, 1, MAX_SAFE, DEFAULT_PRESTIGE.initialFloorCap);
  const initialFloorCap = integer(
    source.initialFloorCap
      ?? source.baseFloorCap
      ?? CONFIG.dungeon?.initialFloorCap
      ?? globalFloor,
    1,
    globalFloor,
    Math.min(globalFloor, DEFAULT_PRESTIGE.initialFloorCap),
  );
  return {
    minLevel: integer(
      source.minLevel ?? source.requiredLevel ?? CONFIG.hero?.maxLevel,
      1,
      MAX_SAFE,
      CONFIG.hero?.maxLevel ?? DEFAULT_PRESTIGE.minLevel,
    ),
    maxCount: integer(source.maxCount ?? source.maxPrestige, 0, 100_000, DEFAULT_PRESTIGE.maxCount),
    combatBonusPerCount: clamp(
      source.combatBonusPerCount
        ?? source.statBonusPerCount
        ?? source.allStatsPercent
        ?? source.bonusPerCount,
      0,
      10,
      DEFAULT_PRESTIGE.combatBonusPerCount,
    ),
    pointsPerCount: positiveInteger(
      source.pointsPerCount
        ?? source.skillPointsPerCount
        ?? source.skillPoints,
      DEFAULT_PRESTIGE.pointsPerCount,
    ),
    resetSkillLevels: source.resetSkillLevels !== false,
    refundSkillPointsOnPrestige: source.refundSkillPointsOnPrestige
      ?? source.refundSkillPoints
      ?? DEFAULT_PRESTIGE.refundSkillPointsOnPrestige,
    initialFloorCap,
    floorsPerCount: positiveInteger(
      source.floorsPerCount
        ?? source.floorUnlockPerCount
        ?? source.floorCapPerCount,
      DEFAULT_PRESTIGE.floorsPerCount,
    ),
    globalFloor,
  };
}

function getPrestigeCount(hero) {
  return integer(
    hero?.prestigeCount ?? hero?.prestige?.count,
    0,
    100_000,
    0,
  );
}

/** Returns all derived permanent bonuses for a hero's prestige count. */
export function getPrestigeBonuses(hero) {
  const config = getPrestigeConfig();
  const count = Math.min(config.maxCount, getPrestigeCount(hero));
  const multiplier = 1 + count * config.combatBonusPerCount;
  const floorCap = Math.min(
    config.globalFloor,
    config.initialFloorCap + count * config.floorsPerCount,
  );
  return {
    count,
    multiplier,
    combatMultiplier: multiplier,
    statBonus: multiplier - 1,
    skillPoints: count * config.pointsPerCount,
    floorCap,
    initialFloorCap: config.initialFloorCap,
    floorsPerCount: config.floorsPerCount,
  };
}

/** Returns whether the hero currently qualifies for another prestige. */
export function canPrestige(hero) {
  const config = getPrestigeConfig();
  return finiteNumber(hero?.level, 1) >= config.minLevel
    && getPrestigeCount(hero) < config.maxCount;
}

/** Provides a UI-friendly, pure preview of the next prestige transaction. */
export function getPrestigePreview(hero) {
  const current = getPrestigeBonuses(hero);
  const nextCount = Math.min(getPrestigeConfig().maxCount, current.count + 1);
  const next = getPrestigeBonuses({ ...(isRecord(hero) ? hero : {}), prestigeCount: nextCount });
  const config = getPrestigeConfig();
  return {
    eligible: canPrestige(hero),
    canPrestige: canPrestige(hero),
    currentCount: current.count,
    nextCount,
    currentMultiplier: current.multiplier,
    nextMultiplier: next.multiplier,
    multiplierGain: Math.max(0, next.multiplier - current.multiplier),
    currentFloorCap: current.floorCap,
    nextFloorCap: next.floorCap,
    skillPointsGranted: config.pointsPerCount,
    resetSkillLevels: config.resetSkillLevels,
    maxLevel: config.minLevel,
  };
}

function getStartingStats(hero) {
  const classDefinition = CONFIG.classes?.[hero?.classId];
  const configured = firstRecord(
    classDefinition?.startingStats,
    CONFIG.hero?.startingStats,
  );
  return configured ? { ...configured } : { ...(hero?.baseStats ?? {}) };
}

/** Performs a prestige reset immutably; ineligible heroes are returned as clones. */
export function prestigeHero(hero) {
  const current = cloneSkillState(hero);
  if (!canPrestige(hero)) return current;
  const config = getPrestigeConfig();
  const currentState = getSkillPointState(hero);
  const nextCount = getPrestigeCount(hero) + 1;
  const next = {
    ...current,
    level: 1,
    experience: 0,
    prestigeCount: nextCount,
    baseStats: getStartingStats(hero),
    unspentStatPoints: 0,
  };

  if (config.resetSkillLevels) {
    const ids = uniqueSkillIds([
      ...getHeroSkillEntries(hero),
      ...Object.keys(current.skillLevels),
    ]);
    next.skillLevels = {};
    for (const id of ids) {
      const definition = getConfiguredSkill(id);
      if (definition) next.skillLevels[id] = getSkillLeveling(definition).initialLevel;
    }
    const refunded = config.refundSkillPointsOnPrestige
      ? currentState.unspent + currentState.spent
      : currentState.unspent;
    next.unspentSkillPoints = refunded + config.pointsPerCount;
  } else {
    next.unspentSkillPoints = currentState.unspent + config.pointsPerCount;
  }
  return next;
}

// Small aliases make the module convenient for callers that use shorter names.
export const resolveSkill = resolveSkillAtLevel;
export const allocateSkillPoint = upgradeSkill;
