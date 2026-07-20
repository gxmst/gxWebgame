import { createSeededRng, hashSeed } from "./rng.js";

const MAX_STAT = 1_000_000_000;
const hasOwn = (value, key) =>
  Object.prototype.hasOwnProperty.call(value ?? {}, key);
const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const DEFAULT_SKILLS = Object.freeze({
  basic_attack: Object.freeze({
    id: "basic_attack",
    name: "普通攻击",
    emoji: "⚔️",
    type: "single",
    multiplier: 1,
    cooldown: 0,
    resourceCost: 0,
    isBasic: true,
  }),
  heavy_strike: Object.freeze({
    id: "heavy_strike",
    name: "重击",
    emoji: "💥",
    type: "single",
    multiplier: 1.8,
    cooldown: 2,
    resourceCost: 0,
  }),
  whirlwind: Object.freeze({
    id: "whirlwind",
    name: "旋风斩",
    emoji: "🌀",
    type: "aoe",
    multiplier: 0.75,
    cooldown: 3,
    resourceCost: 0,
  }),
  block: Object.freeze({
    id: "block",
    name: "格挡",
    emoji: "🛡️",
    type: "guard",
    multiplier: 0,
    cooldown: 4,
    resourceCost: 0,
    reduction: 0.55,
    duration: 2,
  }),
});

export const DEFAULT_PLAYER_SKILL_IDS = Object.freeze([
  "basic_attack",
  "heavy_strike",
  "whirlwind",
  "block",
]);

export const DEFAULT_COMBAT_CONFIG = Object.freeze({
  maxRounds: 200,
  maxHitsPerAction: 12,
  speedTieBreaker: "initialOrder",
  damage: Object.freeze({
    defenseCoefficient: 0.5,
    variance: 0.1,
    minDamage: 1,
    criticalMultiplier: 1.5,
    maxDefenseReduction: 0.85,
    maxPassiveReduction: 0.75,
    maxGuardReduction: 0.8,
    maxTotalReduction: 0.9,
    maxDodgeChance: 0.75,
    aoeMultiplierCap: 0.9,
  }),
  ai: Object.freeze({
    aoeMinTargets: 3,
    guardHpThreshold: 0.35,
    targetStrategy: "lowestHp",
    priority: Object.freeze(["survival", "summon", "empower", "aoe", "single", "basic"]),
  }),
  minions: Object.freeze({
    maxActive: 5,
    maxSummonsPerCast: 3,
  }),
  effects: Object.freeze({
    burnDuration: 2,
    burnDamageRatio: 0.4,
    maxLifesteal: 0.5,
    maxThorns: 0.6,
    maxArmorPenetration: 0.6,
    maxMultiHitChance: 0.5,
    maxBurnChance: 0.75,
  }),
});

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function clamp(value, min, max, fallback = min) {
  return Math.min(max, Math.max(min, finiteNumber(value, fallback)));
}

function firstDefined(sources, keys, fallback) {
  for (const source of sources) {
    if (!isRecord(source)) continue;
    for (const key of keys) {
      if (source[key] !== undefined && source[key] !== null) {
        return source[key];
      }
    }
  }
  return fallback;
}

function firstFinite(sources, keys, fallback) {
  for (const source of sources) {
    if (!isRecord(source)) continue;
    for (const key of keys) {
      const number = Number(source[key]);
      if (Number.isFinite(number)) return number;
    }
  }
  return fallback;
}

function compareStrings(a, b) {
  const left = String(a ?? "");
  const right = String(b ?? "");
  return left < right ? -1 : left > right ? 1 : 0;
}

function configNumber(sources, keys, fallback, min, max) {
  return clamp(firstDefined(sources, keys, fallback), min, max, fallback);
}

function normalizePriority(value) {
  const fallback = [...DEFAULT_COMBAT_CONFIG.ai.priority];
  if (!Array.isArray(value)) return fallback;
  const known = new Set(["survival", "summon", "empower", "aoe", "single", "basic"]);
  const normalized = value
    .map((item) => String(item ?? "").toLowerCase())
    .map((item) => {
      if (["guard", "defense", "defensive", "heal", "self"].includes(item)) {
        return "survival";
      }
      if (["area", "group", "all"].includes(item)) return "aoe";
      if (["pet", "pets", "minion", "minions"].includes(item)) return "summon";
      if (["buff", "form", "stance", "transform"].includes(item)) return "empower";
      return item;
    })
    .filter((item, index, items) => known.has(item) && items.indexOf(item) === index);
  for (const item of fallback) {
    if (!normalized.includes(item)) normalized.push(item);
  }
  return normalized;
}

/** Accepts either the combat section itself or the whole game CONFIG object. */
export function normalizeCombatConfig(input = {}) {
  const root = isRecord(input) ? input : {};
  const combat = isRecord(root.combat) ? root.combat : root;
  const rootDamage = isRecord(root.damage) ? root.damage : {};
  const combatDamage = isRecord(combat.damage) ? combat.damage : {};
  const damageSources = [combatDamage, rootDamage, combat, root];
  const rootAi = isRecord(root.ai) ? root.ai : {};
  const combatAi = isRecord(combat.ai) ? combat.ai : {};
  const aiSources = [combatAi, rootAi, combat, root];
  const rootEffects = isRecord(root.effects) ? root.effects : {};
  const combatEffects = isRecord(combat.effects) ? combat.effects : {};
  const effectSources = [combatEffects, rootEffects, combat, root];

  return {
    maxRounds: Math.floor(configNumber(
      [combat, root],
      ["maxRounds", "roundLimit", "maximumRounds"],
      DEFAULT_COMBAT_CONFIG.maxRounds,
      1,
      100_000,
    )),
    maxHitsPerAction: Math.floor(configNumber(
      [combat, root],
      ["maxHitsPerAction", "maximumHitsPerAction", "hitCountCap"],
      DEFAULT_COMBAT_CONFIG.maxHitsPerAction,
      1,
      100,
    )),
    speedTieBreaker: String(firstDefined(
      [combat, root],
      ["speedTieBreaker", "tieBreaker", "turnOrderTieBreaker"],
      DEFAULT_COMBAT_CONFIG.speedTieBreaker,
    )).toLowerCase(),
    damage: {
      defenseCoefficient: configNumber(
        damageSources,
        ["defenseCoefficient", "defenseFactor", "defenceCoefficient", "defenseReductionFactor"],
        DEFAULT_COMBAT_CONFIG.damage.defenseCoefficient,
        0,
        100,
      ),
      variance: configNumber(
        damageSources,
        ["variance", "damageVariance", "randomVariance", "randomSwing", "damageRandomness"],
        DEFAULT_COMBAT_CONFIG.damage.variance,
        0,
        1,
      ),
      minDamage: configNumber(
        damageSources,
        ["minDamage", "minimumDamage", "damageFloor"],
        DEFAULT_COMBAT_CONFIG.damage.minDamage,
        1,
        MAX_STAT,
      ),
      criticalMultiplier: configNumber(
        damageSources,
        ["criticalMultiplier", "critMultiplier", "critDamageMultiplier", "criticalDamage", "critDamage", "baseCritDamage"],
        DEFAULT_COMBAT_CONFIG.damage.criticalMultiplier,
        1,
        10,
      ),
      maxDefenseReduction: configNumber(
        damageSources,
        ["maxDefenseReduction", "defenseReductionCap", "maxDefenceReduction"],
        DEFAULT_COMBAT_CONFIG.damage.maxDefenseReduction,
        0,
        0.99,
      ),
      maxPassiveReduction: configNumber(
        damageSources,
        ["maxPassiveReduction", "passiveReductionCap"],
        DEFAULT_COMBAT_CONFIG.damage.maxPassiveReduction,
        0,
        0.99,
      ),
      maxGuardReduction: configNumber(
        damageSources,
        ["maxGuardReduction", "guardReductionCap"],
        DEFAULT_COMBAT_CONFIG.damage.maxGuardReduction,
        0,
        0.99,
      ),
      maxTotalReduction: configNumber(
        damageSources,
        ["maxTotalReduction", "damageReductionCap", "reductionCap"],
        DEFAULT_COMBAT_CONFIG.damage.maxTotalReduction,
        0,
        0.99,
      ),
      maxDodgeChance: configNumber(
        damageSources,
        ["maxDodgeChance", "dodgeChanceCap", "evasionCap"],
        DEFAULT_COMBAT_CONFIG.damage.maxDodgeChance,
        0,
        1,
      ),
      aoeMultiplierCap: configNumber(
        damageSources,
        ["aoeMultiplierCap", "areaMultiplierCap", "maxAoeMultiplier"],
        DEFAULT_COMBAT_CONFIG.damage.aoeMultiplierCap,
        0.01,
        10,
      ),
    },
    ai: {
      aoeMinTargets: Math.floor(configNumber(
        aiSources,
        ["aoeMinTargets", "aoeMinimumTargets", "aoeEnemyThreshold", "areaSkillThreshold"],
        DEFAULT_COMBAT_CONFIG.ai.aoeMinTargets,
        2,
        100,
      )),
      guardHpThreshold: configNumber(
        aiSources,
        ["guardHpThreshold", "defenseHpThreshold", "survivalHpThreshold"],
        DEFAULT_COMBAT_CONFIG.ai.guardHpThreshold,
        0,
        1,
      ),
      targetStrategy: firstDefined(
        aiSources,
        ["targetStrategy", "singleTargetStrategy"],
        DEFAULT_COMBAT_CONFIG.ai.targetStrategy,
      ),
      aoeUtilityWeight: configNumber(
        aiSources,
        ["aoeUtilityWeight", "areaUtilityWeight"],
        0.82,
        0.05,
        2,
      ),
      buildAwareOffense: Boolean(firstDefined(
        aiSources,
        ["buildAwareOffense", "compareOffense", "offenseUtility"],
        false,
      )),
      priority: normalizePriority(firstDefined(
        aiSources,
        ["priority", "skillPriority", "priorities"],
        DEFAULT_COMBAT_CONFIG.ai.priority,
      )),
    },
    minions: {
      maxActive: Math.floor(configNumber(
        [isRecord(combat.minions) ? combat.minions : {}, isRecord(root.minions) ? root.minions : {}, combat, root],
        ["maxActive", "maxMinions", "minionCap"],
        DEFAULT_COMBAT_CONFIG.minions.maxActive,
        0,
        20,
      )),
      maxSummonsPerCast: Math.floor(configNumber(
        [isRecord(combat.minions) ? combat.minions : {}, isRecord(root.minions) ? root.minions : {}, combat, root],
        ["maxSummonsPerCast", "summonsPerCastCap"],
        DEFAULT_COMBAT_CONFIG.minions.maxSummonsPerCast,
        1,
        10,
      )),
    },
    effects: {
      burnDuration: Math.floor(configNumber(
        effectSources,
        ["burnDuration", "burningDuration"],
        DEFAULT_COMBAT_CONFIG.effects.burnDuration,
        1,
        100,
      )),
      burnDamageRatio: configNumber(
        effectSources,
        ["burnDamageRatio", "burningDamageRatio"],
        DEFAULT_COMBAT_CONFIG.effects.burnDamageRatio,
        0,
        10,
      ),
      maxLifesteal: configNumber(
        effectSources,
        ["maxLifesteal", "lifestealCap"],
        DEFAULT_COMBAT_CONFIG.effects.maxLifesteal,
        0,
        1,
      ),
      maxThorns: configNumber(
        effectSources,
        ["maxThorns", "thornsCap"],
        DEFAULT_COMBAT_CONFIG.effects.maxThorns,
        0,
        1,
      ),
      maxArmorPenetration: configNumber(
        effectSources,
        ["maxArmorPenetration", "armorPenetrationCap"],
        DEFAULT_COMBAT_CONFIG.effects.maxArmorPenetration,
        0,
        1,
      ),
      maxMultiHitChance: configNumber(
        effectSources,
        ["maxMultiHitChance", "multiHitChanceCap"],
        DEFAULT_COMBAT_CONFIG.effects.maxMultiHitChance,
        0,
        1,
      ),
      maxBurnChance: configNumber(
        effectSources,
        ["maxBurnChance", "burnChanceCap"],
        DEFAULT_COMBAT_CONFIG.effects.maxBurnChance,
        0,
        1,
      ),
    },
    classDefinitions: isRecord(root.classes) ? root.classes : {},
    skillRegistry: createSkillRegistry(root, combat),
  };
}

function createSkillRegistry(root, combat) {
  const registry = Object.fromEntries(
    Object.entries(DEFAULT_SKILLS).map(([id, skill]) => [id, { ...skill }]),
  );
  const candidates = [root.skills, combat.skills];

  const register = (skill, fallbackId) => {
    if (!isRecord(skill)) return;
    const id = String(skill.id ?? fallbackId ?? "").trim();
    if (!id) return;
    registry[id] = { ...(registry[id] ?? {}), ...skill, id };
  };

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      candidate.forEach((skill) => register(skill));
      continue;
    }
    if (!isRecord(candidate)) continue;
    for (const [id, skill] of Object.entries(candidate)) {
      if (Array.isArray(skill)) {
        skill.forEach((entry) => register(entry));
      } else if (isRecord(skill) && !hasOwn(skill, "id") && !hasOwn(skill, "type")) {
        for (const [nestedId, nestedSkill] of Object.entries(skill)) {
          register(nestedSkill, nestedId);
        }
      } else {
        register(skill, id);
      }
    }
  }
  return registry;
}

function normalizeSkillType(value, id, definition) {
  const type = String(value ?? "").toLowerCase();
  if (["aoe", "area", "group", "all", "all_enemies"].includes(type)) return "aoe";
  if (["guard", "defense", "defensive", "block"].includes(type)) return "guard";
  if (["heal", "healing", "restore"].includes(type)) return "heal";
  if (["summon", "minion", "pet", "raise"].includes(type)) return "summon";
  if (["empower", "transform", "form", "stance", "shapeshift"].includes(type)) return "empower";
  if (["single", "attack", "basic", "damage", "single_target"].includes(type)) {
    return "single";
  }
  if (id === "block" || finiteNumber(definition.reduction, 0) > 0) return "guard";
  return "single";
}

function normalizeSkill(skillOrId, config) {
  const supplied = isRecord(skillOrId) ? skillOrId : {};
  const id = String(
    isRecord(skillOrId) ? skillOrId.id ?? skillOrId.key ?? "" : skillOrId ?? "",
  ).trim();
  if (!id) return null;
  const registered = config.skillRegistry[id] ?? {};
  const definition = { ...registered, ...supplied, id };
  if (definition.enabled === false || definition.active === false) return null;
  const type = normalizeSkillType(
    definition.type ?? definition.kind ?? definition.targetType ?? definition.category,
    id,
    definition,
  );
  let multiplier = clamp(
    firstDefined([definition], ["multiplier", "damageMultiplier", "powerMultiplier", "power"], type === "guard" ? 0 : 1),
    0,
    100,
    type === "guard" ? 0 : 1,
  );
  if (type === "aoe") {
    multiplier = Math.min(multiplier, config.damage.aoeMultiplierCap);
  }

  return {
    id,
    name: String(definition.name ?? definition.label ?? id),
    emoji: String(definition.emoji ?? definition.icon ?? (type === "aoe" ? "🌀" : "⚔️")),
    type,
    multiplier,
    flatDamage: clamp(definition.flatDamage, 0, MAX_STAT, 0),
    cooldown: Math.floor(clamp(
      firstDefined([definition], ["cooldown", "cooldownRounds", "cd"], 0),
      0,
      10_000,
      0,
    )),
    resourceCost: clamp(
      firstDefined([definition], ["resourceCost", "cost", "manaCost", "rageCost"], 0),
      0,
      MAX_STAT,
      0,
    ),
    reduction: clamp(
      firstDefined([definition], ["reduction", "damageReduction", "guardReduction"], 0),
      0,
      config.damage.maxGuardReduction,
      0,
    ),
    duration: Math.floor(clamp(
      firstDefined([definition], ["duration", "durationRounds", "turns"], 1),
      1,
      10_000,
      1,
    )),
    healRatio: clamp(
      firstDefined([definition], ["healRatio", "healingRatio", "restoreRatio"], 0),
      0,
      10,
      0,
    ),
    healAmount: clamp(
      firstDefined([definition], ["healAmount", "healing", "restoreAmount"], 0),
      0,
      MAX_STAT,
      0,
    ),
    minimumTargets: Math.floor(clamp(
      firstDefined([definition], ["minimumTargets", "minTargets", "targetThreshold"], config.ai.aoeMinTargets),
      1,
      100,
      config.ai.aoeMinTargets,
    )),
    hitCount: Math.floor(clamp(
      firstDefined([definition], ["hitCount", "hits", "strikeCount"], 1),
      1,
      config.maxHitsPerAction,
      1,
    )),
    critChanceBonus: clamp(
      firstDefined([definition], ["critChanceBonus", "criticalChanceBonus", "bonusCritChance"], 0),
      0,
      1,
      0,
    ),
    dodgeBonus: clamp(
      firstDefined([definition], ["dodgeBonus", "evasionBonus", "bonusDodgeChance"], 0),
      0,
      config.damage.maxDodgeChance,
      0,
    ),
    triggerBelowHpRatio: clamp(
      firstDefined([definition], ["triggerBelowHpRatio", "hpThreshold", "healthThreshold"], config.ai.guardHpThreshold),
      0,
      1,
      config.ai.guardHpThreshold,
    ),
    // 召唤类字段:召唤物属性 = 施法者当前属性 × 各比例。
    summonCount: Math.floor(clamp(
      firstDefined([definition], ["summonCount", "summons", "castCount"], 1),
      1,
      config.minions.maxSummonsPerCast,
      1,
    )),
    maxMinions: Math.floor(clamp(
      firstDefined([definition], ["maxMinions", "minionCap", "maxActiveMinions"], config.minions.maxActive),
      0,
      config.minions.maxActive,
      config.minions.maxActive,
    )),
    minionName: String(definition.minionName ?? definition.minion?.name ?? "召唤物").slice(0, 20),
    minionEmoji: String(definition.minionEmoji ?? definition.minion?.emoji ?? "💀").slice(0, 8),
    minionHpRatio: clamp(
      firstDefined([definition], ["minionHpRatio"], definition.minion?.hpRatio ?? 0.3),
      0.01,
      10,
      0.3,
    ),
    minionAttackRatio: clamp(
      firstDefined([definition], ["minionAttackRatio"], definition.minion?.attackRatio ?? 0.4),
      0.01,
      10,
      0.4,
    ),
    minionDefenseRatio: clamp(
      firstDefined([definition], ["minionDefenseRatio"], definition.minion?.defenseRatio ?? 0.35),
      0,
      10,
      0.35,
    ),
    minionSpeedRatio: clamp(
      firstDefined([definition], ["minionSpeedRatio"], definition.minion?.speedRatio ?? 0.85),
      0.01,
      10,
      0.85,
    ),
    // empower 类字段:主动保持覆盖的输出增益。
    damageBonus: clamp(
      firstDefined([definition], ["damageBonus", "empowerDamageBonus", "attackBonus"], 0),
      0,
      5,
      0,
    ),
    lifestealBonus: clamp(
      firstDefined([definition], ["lifestealBonus", "empowerLifesteal"], 0),
      0,
      config.effects.maxLifesteal,
      0,
    ),
    canCrit: definition.canCrit !== false,
    ignoreDefense: Boolean(definition.ignoreDefense),
    isBasic: Boolean(definition.isBasic) || id === "basic_attack",
    aiPriority: finiteNumber(definition.aiPriority ?? definition.priority, 0),
  };
}

function normalizeSkills(raw, side, config) {
  const classDefinition = side === "player"
    ? config.classDefinitions?.[raw.classId]
    : null;
  const classSkills = Array.isArray(classDefinition?.skills)
    ? classDefinition.skills
    : null;
  const hasExplicitSkills = hasOwn(raw, "skills") || hasOwn(raw, "skillIds");
  const rawSkillSource = hasOwn(raw, "skills") ? raw.skills : raw.skillIds;
  const source = hasExplicitSkills
    ? (Array.isArray(rawSkillSource)
      ? rawSkillSource
      : isRecord(rawSkillSource)
        ? Object.entries(rawSkillSource).map(([id, skill]) =>
          isRecord(skill) ? { ...skill, id: skill.id ?? id } : id)
        : [])
    : side === "player"
      ? classSkills ?? DEFAULT_PLAYER_SKILL_IDS
      : ["basic_attack"];
  const skills = [];
  const seen = new Set();

  for (const entry of source) {
    const skill = normalizeSkill(entry, config);
    if (!skill || seen.has(skill.id)) continue;
    skills.push(skill);
    seen.add(skill.id);
  }

  if (!skills.some((skill) => skill.isBasic && skill.cooldown === 0 && skill.resourceCost === 0)) {
    const fallbackId = classDefinition?.basicSkillId ?? "basic_attack";
    const fallback = normalizeSkill(fallbackId, config)
      ?? normalizeSkill("basic_attack", config)
      ?? { ...DEFAULT_SKILLS.basic_attack };
    if (fallback) {
      fallback.cooldown = 0;
      fallback.resourceCost = 0;
      fallback.isBasic = true;
      skills.push(fallback);
    }
  }
  return skills;
}

function normalizeCooldowns(value) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([id, remaining]) => [
      id,
      Math.floor(clamp(remaining, 0, 10_000, 0)),
    ]),
  );
}

function normalizeResource(raw, stats) {
  const source = isRecord(raw.resource) ? raw.resource : {};
  const current = firstFinite(
    [source, raw, stats],
    ["current", "value", "resource", "mana", "rage"],
    0,
  );
  const maximum = firstFinite(
    [source, raw, stats],
    ["max", "maximum", "maxResource", "maxMana", "maxRage"],
    Math.max(0, current),
  );
  const maxResource = clamp(maximum, 0, MAX_STAT, Math.max(0, current));
  return {
    resource: clamp(current, 0, maxResource, 0),
    maxResource,
  };
}

function normalizeReward(raw) {
  const rewards = isRecord(raw.rewards)
    ? raw.rewards
    : isRecord(raw.reward)
      ? raw.reward
      : {};
  const sources = [rewards, raw];
  return {
    experience: Math.floor(clamp(firstDefined(
      sources,
      ["experience", "xp", "rewardExperience", "experienceReward", "rewardXp", "xpReward"],
      0,
    ), 0, MAX_STAT, 0)),
    gold: Math.floor(clamp(firstDefined(
      sources,
      ["gold", "rewardGold", "goldReward", "coins", "coinReward"],
      0,
    ), 0, MAX_STAT, 0)),
  };
}

function normalizeGuard(raw, config) {
  const status = isRecord(raw.status) ? raw.status : {};
  const supplied = isRecord(status.guard)
    ? status.guard
    : isRecord(raw.guard)
      ? raw.guard
      : null;
  if (!supplied) return null;
  const remainingTurns = Math.floor(clamp(
    supplied.remainingTurns ?? supplied.turns ?? supplied.duration,
    0,
    10_000,
    0,
  ));
  if (remainingTurns <= 0) return null;
  return {
    remainingTurns,
    reduction: clamp(
      supplied.reduction ?? supplied.damageReduction,
      0,
      config.damage.maxGuardReduction,
      0,
    ),
    dodgeBonus: clamp(
      supplied.dodgeBonus ?? supplied.evasionBonus,
      0,
      config.damage.maxDodgeChance,
      0,
    ),
    sourceSkillId: supplied.sourceSkillId ?? supplied.skillId ?? null,
  };
}

/** Empower status shape: { remainingTurns, damageBonus, lifestealBonus, sourceSkillId|null }. */
function normalizeEmpower(raw, config) {
  const status = isRecord(raw.status) ? raw.status : {};
  const supplied = isRecord(status.empower)
    ? status.empower
    : isRecord(raw.empower)
      ? raw.empower
      : null;
  if (!supplied) return null;
  const remainingTurns = Math.floor(clamp(
    supplied.remainingTurns ?? supplied.turns ?? supplied.duration,
    0,
    10_000,
    0,
  ));
  if (remainingTurns <= 0) return null;
  return {
    remainingTurns,
    damageBonus: clamp(supplied.damageBonus ?? supplied.attackBonus, 0, 5, 0),
    lifestealBonus: clamp(
      supplied.lifestealBonus ?? supplied.lifesteal,
      0,
      config.effects.maxLifesteal,
      0,
    ),
    sourceSkillId: supplied.sourceSkillId ?? supplied.skillId ?? null,
  };
}

/** Burn status shape: { remainingTurns, damagePerTurn, sourceId|null }. */
function normalizeBurn(raw) {
  const status = isRecord(raw.status) ? raw.status : {};
  const supplied = isRecord(status.burn)
    ? status.burn
    : isRecord(raw.burn)
      ? raw.burn
      : null;
  if (!supplied) return null;
  const remainingTurns = Math.floor(clamp(
    supplied.remainingTurns ?? supplied.turns ?? supplied.duration,
    0,
    10_000,
    0,
  ));
  const damagePerTurn = Math.floor(clamp(
    supplied.damagePerTurn ?? supplied.damage,
    0,
    MAX_STAT,
    0,
  ));
  if (remainingTurns <= 0 || damagePerTurn <= 0) return null;
  return {
    remainingTurns,
    damagePerTurn,
    sourceId: supplied.sourceId ?? supplied.ownerId ?? null,
  };
}

function normalizeUnit(value, side, order, config) {
  const raw = isRecord(value) ? value : {};
  const stats = isRecord(raw.stats) ? raw.stats : {};
  const sources = [raw, stats];
  const defaultMaxHp = side === "player" ? 100 : 40;
  const maxHp = clamp(
    firstDefined(sources, ["maxHp", "maxHealth", "healthMax", "hpMax"], defaultMaxHp),
    1,
    MAX_STAT,
    defaultMaxHp,
  );
  const hp = clamp(
    firstDefined(sources, ["hp", "health", "currentHp", "currentHealth"], maxHp),
    0,
    maxHp,
    maxHp,
  );
  const critDamage = clamp(
    firstDefined(sources, ["critDamage", "criticalDamage", "critMultiplier"], config.damage.criticalMultiplier),
    1,
    10,
    config.damage.criticalMultiplier,
  );
  const { resource, maxResource } = normalizeResource(raw, stats);
  const id = String(raw.id ?? `${side}-${order + 1}`);
  const preferredTargetId = raw.targetId ?? raw.currentTargetId ?? raw.lockedTargetId;

  return {
    id,
    name: String(raw.name ?? (side === "player" ? "战士" : `敌人 ${order}`)),
    emoji: String(raw.emoji ?? raw.icon ?? (side === "player" ? "🧑‍⚔️" : "💀")),
    side,
    hp,
    maxHp,
    attack: clamp(firstDefined(sources, ["attack", "atk", "power"], side === "player" ? 12 : 8), 0, MAX_STAT, side === "player" ? 12 : 8),
    defense: clamp(firstDefined(sources, ["defense", "defence", "def"], 0), 0, MAX_STAT, 0),
    speed: clamp(firstDefined(sources, ["speed", "attackSpeed", "initiative"], 10), 0, MAX_STAT, 10),
    critChance: clamp(firstDefined(sources, ["critChance", "criticalChance", "criticalRate"], 0), 0, 1, 0),
    critDamage,
    dodgeChance: clamp(
      firstDefined(sources, ["dodgeChance", "evasion", "evadeChance"], 0),
      0,
      config.damage.maxDodgeChance,
      0,
    ),
    damageMultiplier: clamp(firstDefined(sources, ["damageMultiplier", "outgoingDamageMultiplier"], 1), 0, 100, 1),
    damageReduction: clamp(
      firstDefined(sources, ["damageReduction", "passiveDamageReduction"], 0),
      0,
      config.damage.maxPassiveReduction,
      0,
    ),
    lifesteal: clamp(
      firstDefined(sources, ["lifesteal", "lifeSteal", "lifeLeech"], 0),
      0,
      config.effects.maxLifesteal,
      0,
    ),
    thorns: clamp(
      firstDefined(sources, ["thorns", "reflectDamage", "damageReflection"], 0),
      0,
      config.effects.maxThorns,
      0,
    ),
    armorPenetration: clamp(
      firstDefined(sources, ["armorPenetration", "armorPen", "armorBreak"], 0),
      0,
      config.effects.maxArmorPenetration,
      0,
    ),
    multiHitChance: clamp(
      firstDefined(sources, ["multiHitChance", "extraStrikeChance", "doubleStrikeChance"], 0),
      0,
      config.effects.maxMultiHitChance,
      0,
    ),
    burnChance: clamp(
      firstDefined(sources, ["burnChance", "burningChance", "igniteChance", "burning"], 0),
      0,
      config.effects.maxBurnChance,
      0,
    ),
    burn: normalizeBurn(raw),
    empower: normalizeEmpower(raw, config),
    resource,
    maxResource,
    skills: normalizeSkills(raw, side, config),
    cooldowns: normalizeCooldowns(raw.cooldowns),
    guard: normalizeGuard(raw, config),
    targetId: preferredTargetId === undefined || preferredTargetId === null
      ? null
      : String(preferredTargetId),
    distance: clamp(raw.distance ?? raw.position ?? order, 0, MAX_STAT, order),
    reward: normalizeReward(raw),
    _order: order,
    _startedAlive: hp > 0,
    _defeatedRound: null,
    _deathRecorded: false,
  };
}

export function isAlive(unit) {
  return finiteNumber(unit?.hp, 0) > 0;
}

/** Stable speed ordering: initial position, then id, resolves all ties. */
export function compareTurnOrder(a, b, tieBreaker = DEFAULT_COMBAT_CONFIG.speedTieBreaker) {
  const speedDifference = finiteNumber(b?.speed, 0) - finiteNumber(a?.speed, 0);
  if (speedDifference !== 0) return speedDifference;
  if (["id", "unitid", "unit-id"].includes(String(tieBreaker).toLowerCase())) {
    const idDifference = compareStrings(a?.id, b?.id);
    if (idDifference !== 0) return idDifference;
  }
  const orderDifference = finiteNumber(
    a?._order ?? a?.initialOrder,
    Number.MAX_SAFE_INTEGER,
  ) - finiteNumber(
    b?._order ?? b?.initialOrder,
    Number.MAX_SAFE_INTEGER,
  );
  if (orderDifference !== 0) return orderDifference;
  return compareStrings(a?.id, b?.id);
}

function tieBreakTargets(a, b) {
  const orderDifference = finiteNumber(a?._order, Number.MAX_SAFE_INTEGER)
    - finiteNumber(b?._order, Number.MAX_SAFE_INTEGER);
  if (orderDifference !== 0) return orderDifference;
  return compareStrings(a?.id, b?.id);
}

/** Selects a live target without mutating the supplied list. */
export function selectTarget(targets, strategy = "lowestHp") {
  const living = Array.isArray(targets) ? targets.filter(isAlive) : [];
  if (living.length === 0) return null;
  if (typeof strategy === "function") {
    try {
      const selected = strategy([...living]);
      if (living.includes(selected)) return selected;
      if (selected !== null && selected !== undefined) {
        const byId = living.find((target) => target.id === selected || target.id === selected.id);
        if (byId) return byId;
      }
    } catch {
      // Fall through to the deterministic default strategy.
    }
  }

  const normalized = String(strategy ?? "lowestHp").toLowerCase();
  const sorted = [...living];
  if (["highestattack", "highest_attack", "highest-attack", "最高攻击", "最高攻"].includes(normalized)) {
    sorted.sort((a, b) => finiteNumber(b.attack, 0) - finiteNumber(a.attack, 0) || tieBreakTargets(a, b));
  } else if (["nearest", "closest", "最近"].includes(normalized)) {
    sorted.sort((a, b) => finiteNumber(a.distance, MAX_STAT) - finiteNumber(b.distance, MAX_STAT) || tieBreakTargets(a, b));
  } else {
    sorted.sort((a, b) => finiteNumber(a.hp, 0) - finiteNumber(b.hp, 0) || tieBreakTargets(a, b));
  }
  return sorted[0] ?? null;
}

function randomValue(rng) {
  if (typeof rng !== "function") return 0.5;
  return clamp(rng(), 0, 1 - Number.EPSILON, 0.5);
}

/** Pure damage roll; it never changes the attacker or target. */
export function calculateDamage(attacker, target, skill = DEFAULT_SKILLS.basic_attack, rng, inputConfig = {}) {
  const config = inputConfig?.skillRegistry ? inputConfig : normalizeCombatConfig(inputConfig);
  const attackerStats = isRecord(attacker?.stats) ? attacker.stats : {};
  const targetStats = isRecord(target?.stats) ? target.stats : {};
  const attackerSources = [attacker, attackerStats];
  const targetSources = [target, targetStats];
  const normalizedSkill = skill?.type
    ? {
        ...skill,
        multiplier: Math.min(
          clamp(skill.multiplier, 0, 100, 1),
          String(skill.type).toLowerCase() === "aoe"
            ? config.damage.aoeMultiplierCap
            : 100,
        ),
        flatDamage: clamp(skill.flatDamage, 0, MAX_STAT, 0),
      }
    : normalizeSkill(skill?.id ?? skill ?? "basic_attack", config);
  const targetGuard = isRecord(target?.guard)
    ? target.guard
    : isRecord(target?.status?.guard)
      ? target.status.guard
      : null;
  const guardActive = targetGuard
    && finiteNumber(targetGuard.remainingTurns ?? targetGuard.turns, 0) > 0;
  const guardDodgeBonus = guardActive
    ? clamp(
        targetGuard.dodgeBonus ?? targetGuard.evasionBonus,
        0,
        config.damage.maxDodgeChance,
        0,
      )
    : 0;
  const dodgeChance = clamp(
    finiteNumber(firstDefined(targetSources, ["dodgeChance", "evasion", "evadeChance"], 0), 0)
      + guardDodgeBonus,
    0,
    config.damage.maxDodgeChance,
    0,
  );
  if (randomValue(rng) < dodgeChance) {
    return {
      damage: 0,
      dodged: true,
      critical: false,
      variance: 1,
      reduction: 0,
      baseDamage: 0,
    };
  }

  const attack = clamp(firstDefined(attackerSources, ["attack", "atk", "power"], 0), 0, MAX_STAT, 0);
  const multiplier = clamp(normalizedSkill?.multiplier, 0, 100, 1);
  const outgoingMultiplier = clamp(
    firstDefined(attackerSources, ["damageMultiplier", "outgoingDamageMultiplier"], 1),
    0,
    100,
    1,
  );
  // empower(形态)增益提升攻方输出。
  const attackerEmpower = isRecord(attacker?.empower)
    ? attacker.empower
    : isRecord(attacker?.status?.empower)
      ? attacker.status.empower
      : null;
  const empowerBonus = attackerEmpower
    && finiteNumber(attackerEmpower.remainingTurns ?? attackerEmpower.turns, 0) > 0
    ? clamp(attackerEmpower.damageBonus ?? attackerEmpower.attackBonus, 0, 5, 0)
    : 0;
  const attackPower = Math.min(
    MAX_STAT * 100,
    (attack * multiplier + clamp(normalizedSkill?.flatDamage, 0, MAX_STAT, 0))
      * outgoingMultiplier * (1 + empowerBonus),
  );
  const armorPenetration = clamp(
    firstDefined(attackerSources, ["armorPenetration", "armorPen", "armorBreak"], 0),
    0,
    config.effects?.maxArmorPenetration ?? 1,
    0,
  );
  const defense = normalizedSkill?.ignoreDefense
    ? 0
    : clamp(
        firstDefined(targetSources, ["defense", "defence", "def", "armor"], 0),
        0,
        MAX_STAT,
        0,
      ) * (1 - armorPenetration) * config.damage.defenseCoefficient;
  const cappedDefense = Math.min(
    defense,
    attackPower * config.damage.maxDefenseReduction,
  );
  const mitigated = Math.max(config.damage.minDamage, attackPower - cappedDefense);
  const critical = normalizedSkill?.canCrit !== false
    && randomValue(rng) < clamp(
      finiteNumber(firstDefined(attackerSources, ["critChance", "criticalChance", "criticalRate"], 0), 0)
        + clamp(normalizedSkill?.critChanceBonus, 0, 1, 0),
      0,
      1,
      0,
    );
  const criticalMultiplier = critical
    ? clamp(
        firstDefined(attackerSources, ["critDamage", "criticalDamage", "critMultiplier"], config.damage.criticalMultiplier),
        1,
        10,
        config.damage.criticalMultiplier,
      )
    : 1;
  const variance = 1 + (randomValue(rng) * 2 - 1) * config.damage.variance;
  const passiveReduction = clamp(
    firstDefined(targetSources, ["damageReduction", "passiveDamageReduction"], 0),
    0,
    config.damage.maxPassiveReduction,
    0,
  );
  const guardReduction = guardActive
    ? clamp(targetGuard.reduction ?? targetGuard.damageReduction, 0, config.damage.maxGuardReduction, 0)
    : 0;
  const combinedReduction = Math.min(
    config.damage.maxTotalReduction,
    1 - (1 - passiveReduction) * (1 - guardReduction),
  );
  const rolled = mitigated * criticalMultiplier * variance * (1 - combinedReduction);
  const damage = Math.max(config.damage.minDamage, Math.round(finiteNumber(rolled, config.damage.minDamage)));

  return {
    damage,
    dodged: false,
    critical,
    variance,
    reduction: combinedReduction,
    baseDamage: mitigated,
  };
}

function skillIsReady(actor, skill) {
  return finiteNumber(actor.cooldowns?.[skill.id], 0) <= 0
    && finiteNumber(actor.resource, 0) >= finiteNumber(skill.resourceCost, 0);
}

function pickBest(skills, score) {
  return [...skills].sort((a, b) => {
    const priorityDifference = finiteNumber(b.aiPriority, 0) - finiteNumber(a.aiPriority, 0);
    if (priorityDifference !== 0) return priorityDifference;
    const scoreDifference = score(b) - score(a);
    if (scoreDifference !== 0) return scoreDifference;
    return compareStrings(a.id, b.id);
  })[0] ?? null;
}

function offensiveSkillScore(skill, config) {
  const hits = Math.floor(clamp(skill?.hitCount, 1, config.maxHitsPerAction, 1));
  return finiteNumber(skill?.multiplier, 0) * hits;
}

function survivalSkillScore(skill, actor) {
  const duration = Math.max(1, finiteNumber(skill?.duration, 1));
  return (finiteNumber(skill?.reduction, 0) + finiteNumber(skill?.dodgeBonus, 0)) * duration
    + finiteNumber(skill?.healRatio, 0)
    + finiteNumber(skill?.healAmount, 0) / Math.max(1, finiteNumber(actor?.maxHp, 1));
}

/**
 * Configurable automatic skill decision with an unconditional basic fallback.
 * `context.activeMinions` lets summon skills respect the on-field cap;
 * summons are currently a player-side ability only.
 */
export function chooseSkill(actor, opponents, inputConfig = {}, context = {}) {
  const config = inputConfig?.skillRegistry ? inputConfig : normalizeCombatConfig(inputConfig);
  const livingCount = Array.isArray(opponents) ? opponents.filter(isAlive).length : 0;
  if (livingCount === 0) return null;
  const skills = Array.isArray(actor?.skills) ? actor.skills : [];
  const ready = skills.filter((skill) => skillIsReady(actor, skill));
  const hpRatio = clamp(actor?.hp, 0, Math.max(1, finiteNumber(actor?.maxHp, 1)), 0)
    / Math.max(1, finiteNumber(actor?.maxHp, 1));
  const activeMinions = Math.max(0, Math.floor(finiteNumber(context?.activeMinions, 0)));

  const pickSummon = () => {
    if (actor?.side === "enemy") return null;
    const candidates = ready.filter((skill) =>
      skill.type === "summon"
      && activeMinions < Math.min(
        Math.floor(clamp(skill.maxMinions, 0, 100, 0)),
        config.minions.maxActive,
      ));
    return pickBest(candidates, (skill) => finiteNumber(skill.summonCount, 1));
  };
  const pickEmpower = () => {
    if (actor?.empower && finiteNumber(actor.empower.remainingTurns, 0) > 0) return null;
    const candidates = ready.filter((skill) => skill.type === "empower");
    return pickBest(candidates, (skill) =>
      (finiteNumber(skill.damageBonus, 0) + finiteNumber(skill.lifestealBonus, 0))
        * Math.max(1, finiteNumber(skill.duration, 1)));
  };

  if (config.ai.buildAwareOffense) {
    const defensive = ready.filter((skill) =>
      (skill.type === "guard" || skill.type === "heal")
      && hpRatio <= clamp(
        skill.triggerBelowHpRatio,
        0,
        1,
        config.ai.guardHpThreshold,
      ));
    const survival = pickBest(defensive, (skill) => survivalSkillScore(skill, actor));
    if (survival) return survival;

    const summon = pickSummon();
    if (summon) return summon;
    const empower = pickEmpower();
    if (empower) return empower;

    const offense = ready.filter((skill) =>
      (skill.type === "single" && !skill.isBasic)
      || (skill.type === "aoe" && livingCount >= Math.floor(clamp(
        skill.minimumTargets,
        1,
        100,
        config.ai.aoeMinTargets,
      ))));
    const selected = pickBest(offense, (skill) => skill.type === "aoe"
      ? offensiveSkillScore(skill, config) * livingCount * config.ai.aoeUtilityWeight
      : offensiveSkillScore(skill, config));
    if (selected) return selected;

    const basic = pickBest(
      ready.filter((skill) => skill.isBasic),
      (skill) => offensiveSkillScore(skill, config),
    );
    if (basic) return basic;
  }

  for (const category of config.ai.priority) {
    if (category === "summon") {
      const selected = pickSummon();
      if (selected) return selected;
    }
    if (category === "empower") {
      const selected = pickEmpower();
      if (selected) return selected;
    }
    if (category === "survival") {
      const defensive = ready.filter((skill) =>
        (skill.type === "guard" || skill.type === "heal")
        && hpRatio <= clamp(
          skill.triggerBelowHpRatio,
          0,
          1,
          config.ai.guardHpThreshold,
        ));
      const selected = pickBest(defensive, (skill) => survivalSkillScore(skill, actor));
      if (selected) return selected;
    }
    if (category === "aoe") {
      const selected = pickBest(
        ready.filter((skill) =>
          skill.type === "aoe" && livingCount >= Math.floor(clamp(
            skill.minimumTargets,
            1,
            100,
            config.ai.aoeMinTargets,
          ))),
        (skill) => offensiveSkillScore(skill, config) * livingCount,
      );
      if (selected) return selected;
    }
    if (category === "single") {
      const selected = pickBest(
        ready.filter((skill) => skill.type === "single" && !skill.isBasic),
        (skill) => offensiveSkillScore(skill, config),
      );
      if (selected) return selected;
    }
    if (category === "basic") {
      const selected = pickBest(
        ready.filter((skill) => skill.isBasic),
        (skill) => offensiveSkillScore(skill, config),
      );
      if (selected) return selected;
    }
  }

  return pickBest(ready, (skill) => offensiveSkillScore(skill, config)) ?? null;
}

function unitSummary(unit) {
  return {
    id: unit.id,
    name: unit.name,
    emoji: unit.emoji,
    side: unit.side,
  };
}

function skillSummary(skill) {
  return {
    id: skill.id,
    name: skill.name,
    emoji: skill.emoji,
    type: skill.type,
    hitCount: skill.hitCount,
    critChanceBonus: skill.critChanceBonus,
    dodgeBonus: skill.dodgeBonus,
  };
}

function publicUnit(unit) {
  const source = isRecord(unit) ? unit : {};
  const maxHp = clamp(source.maxHp, 1, MAX_STAT, 1);
  return {
    ...unitSummary(source),
    hp: clamp(source.hp, 0, maxHp, 0),
    maxHp,
    alive: isAlive(source),
    attack: clamp(source.attack, 0, MAX_STAT, 0),
    defense: clamp(source.defense, 0, MAX_STAT, 0),
    speed: clamp(source.speed, 0, MAX_STAT, 0),
    critChance: clamp(source.critChance, 0, 1, 0),
    critDamage: clamp(source.critDamage, 1, 10, DEFAULT_COMBAT_CONFIG.damage.criticalMultiplier),
    dodgeChance: clamp(source.dodgeChance, 0, 1, 0),
    damageMultiplier: clamp(source.damageMultiplier, 0, 100, 1),
    damageReduction: clamp(source.damageReduction, 0, 1, 0),
    lifesteal: clamp(source.lifesteal, 0, 1, 0),
    thorns: clamp(source.thorns, 0, 1, 0),
    armorPenetration: clamp(source.armorPenetration, 0, 1, 0),
    multiHitChance: clamp(source.multiHitChance, 0, 1, 0),
    burnChance: clamp(source.burnChance, 0, 1, 0),
    burn: isRecord(source.burn) ? { ...source.burn } : null,
    empower: isRecord(source.empower) ? { ...source.empower } : null,
    resource: clamp(source.resource, 0, MAX_STAT, 0),
    maxResource: clamp(source.maxResource, 0, MAX_STAT, 0),
    cooldowns: isRecord(source.cooldowns) ? { ...source.cooldowns } : {},
    guard: isRecord(source.guard) ? { ...source.guard } : null,
    skills: Array.isArray(source.skills)
      ? source.skills.map((skill) => isRecord(skill) ? { ...skill } : skill)
      : [],
  };
}

export function createCombatSnapshot(player, enemies, minions = []) {
  const enemySnapshots = (Array.isArray(enemies) ? enemies : []).map(publicUnit);
  return {
    player: publicUnit(player),
    minions: (Array.isArray(minions) ? minions : []).map(publicUnit),
    enemies: enemySnapshots,
    aliveEnemyCount: enemySnapshots.filter((enemy) => enemy.alive).length,
  };
}

function consumeTurn(actor, usedSkill, appliedGuard = false, appliedEmpower = false) {
  for (const [id, remaining] of Object.entries(actor.cooldowns)) {
    if (id !== usedSkill?.id) {
      actor.cooldowns[id] = Math.max(0, Math.floor(finiteNumber(remaining, 0)) - 1);
    }
  }
  if (usedSkill) {
    actor.cooldowns[usedSkill.id] = Math.max(0, Math.floor(usedSkill.cooldown));
    actor.resource = clamp(
      actor.resource - usedSkill.resourceCost,
      0,
      actor.maxResource,
      0,
    );
  }
  if (actor.guard && !appliedGuard) {
    actor.guard.remainingTurns = Math.max(0, actor.guard.remainingTurns - 1);
    if (actor.guard.remainingTurns === 0) actor.guard = null;
  }
  if (actor.empower && !appliedEmpower) {
    actor.empower.remainingTurns = Math.max(0, actor.empower.remainingTurns - 1);
    if (actor.empower.remainingTurns === 0) actor.empower = null;
  }
}

function resolveSingleTarget(actor, opponents, strategy) {
  const living = opponents.filter(isAlive);
  if (living.length === 0) return { target: null, retargetedFrom: null };
  const preferredId = actor.targetId;
  const preferred = preferredId === null || preferredId === undefined
    ? null
    : living.find((target) => target.id === preferredId);
  if (preferred) return { target: preferred, retargetedFrom: null };
  const target = selectTarget(living, strategy);
  const retargetedFrom = preferredId === null || preferredId === undefined
    ? null
    : preferredId;
  if (target) actor.targetId = target.id;
  return { target, retargetedFrom };
}

/** Folds legendary-effect outcomes into one readable log suffix. */
function formatEffectNotes(roll, targetCount = 1) {
  const parts = [];
  if (roll.extraStrike) parts.push("连击追加一击");
  if (roll.lifestealHealing > 0) parts.push(`吸血 +${roll.lifestealHealing}`);
  if (roll.burnAppliedCount > 0) {
    parts.push(targetCount > 1 ? `点燃 ${roll.burnAppliedCount} 个目标` : "目标被点燃");
  }
  if (roll.thornsDamage > 0) parts.push(`受荆棘反伤 ${roll.thornsDamage}`);
  return parts.length ? `（${parts.join("，")}）` : "";
}

function formatSingleAction(actor, target, skill, roll) {
  const notes = formatEffectNotes(roll, 1);
  if (roll.hitCount > 1) {
    const critical = roll.criticalCount ? `（${roll.criticalCount} 次暴击）` : "";
    const dodged = roll.dodgedCount ? `（${roll.dodgedCount} 次闪避）` : "";
    return `${actor.emoji} ${actor.name} 对 ${target.name} 使用 ${skill.emoji} ${skill.name}，${roll.successfulHitCount}/${roll.hitCount} 段命中，共造成 ${roll.damage} 点伤害${critical}${dodged}${notes}。`;
  }
  if (roll.dodged) {
    return `${target.emoji} ${target.name} 闪避了 ${actor.name} 的 ${skill.emoji} ${skill.name}。`;
  }
  const critical = roll.critical ? "（暴击）" : "";
  const guarded = roll.reduction > 0 ? `（减伤 ${Math.round(roll.reduction * 100)}%）` : "";
  return `${actor.emoji} ${actor.name} 对 ${target.name} 使用 ${skill.emoji} ${skill.name}，造成 ${roll.damage} 点伤害${critical}${guarded}${notes}。`;
}

function parseSimulationArgs(playerOrOptions, enemiesArg, seedArg, configArg) {
  if (isRecord(playerOrOptions) && hasOwn(playerOrOptions, "player")) {
    const secondIsConfig = isRecord(enemiesArg)
      && ["combat", "skills", "maxRounds", "maxHitsPerAction", "damage", "ai"].some((key) => hasOwn(enemiesArg, key));
    return {
      player: playerOrOptions.player,
      enemies: playerOrOptions.enemies ?? playerOrOptions.enemyGroup ?? [],
      seed: playerOrOptions.seed
        ?? playerOrOptions.randomSeed
        ?? (!secondIsConfig && enemiesArg !== undefined ? enemiesArg : seedArg)
        ?? 0,
      config: playerOrOptions.config ?? (secondIsConfig ? enemiesArg : configArg) ?? {},
    };
  }
  if (isRecord(seedArg) && (hasOwn(seedArg, "seed") || hasOwn(seedArg, "config"))) {
    return {
      player: playerOrOptions,
      enemies: enemiesArg,
      seed: seedArg.seed ?? 0,
      config: seedArg.config ?? configArg ?? {},
    };
  }
  if (isRecord(seedArg)
    && ["combat", "skills", "maxRounds", "maxHitsPerAction", "damage", "ai"].some((key) => hasOwn(seedArg, key))) {
    return {
      player: playerOrOptions,
      enemies: enemiesArg,
      seed: 0,
      config: seedArg,
    };
  }
  return {
    player: playerOrOptions,
    enemies: enemiesArg,
    seed: seedArg ?? 0,
    config: configArg ?? {},
  };
}

/**
 * Pure, deterministic player-versus-group combat simulation.
 *
 * Preferred call: simulateCombat({ player, enemies, seed, config }).
 * Positional call is also supported: simulateCombat(player, enemies, seed, config).
 */
export function simulateCombat(playerOrOptions, enemiesArg, seedArg, configArg) {
  const options = parseSimulationArgs(playerOrOptions, enemiesArg, seedArg, configArg);
  const config = normalizeCombatConfig(options.config);
  const player = normalizeUnit(options.player, "player", 0, config);
  const enemySource = isRecord(options.enemies) && Array.isArray(options.enemies.enemies)
    ? options.enemies.enemies
    : options.enemies;
  const enemyInput = Array.isArray(enemySource)
    ? enemySource
    : isRecord(enemySource)
      ? Object.values(enemySource)
      : [];
  const enemies = enemyInput.map((enemy, index) =>
    normalizeUnit(enemy, "enemy", index + 1, config));
  // 玩家侧召唤物:战斗中由召唤技能创建,阵亡后保留在数组里供结算与快照。
  const minions = [];
  let minionCounter = 0;
  const rng = createSeededRng(options.seed);
  const logs = [];
  const defeatedEnemyIds = [];
  let rounds = 0;
  let outcome = null;
  let reason = null;

  // 玩家视角的整场统计,用于结算战报。
  const statistics = {
    playerDamageDealt: 0,
    playerDamageTaken: 0,
    playerHealing: 0,
    playerCriticalHits: 0,
    playerDodges: 0,
    playerMaxHit: 0,
    lifestealHealing: 0,
    thornsDamage: 0,
    burnDamage: 0,
    burnsApplied: 0,
    extraStrikes: 0,
    minionDamageDealt: 0,
    minionDamageTaken: 0,
    minionsSummoned: 0,
    minionsLost: 0,
  };

  const snapshot = () => createCombatSnapshot(player, enemies, minions);
  const appendLog = (event) => {
    const entry = {
      sequence: logs.length + 1,
      round: rounds,
      ...event,
      turn: rounds,
      event: event.event ?? event.type,
      snapshot: snapshot(),
    };
    if (entry.targetId === undefined && Array.isArray(entry.targetIds) && entry.targetIds.length === 1) {
      entry.targetId = entry.targetIds[0];
    }
    if (entry.amount === undefined && entry.damage !== undefined) entry.amount = entry.damage;
    logs.push(entry);
    return entry;
  };

  appendLog({
    type: "battle_start",
    message: `⚔️ 战斗开始：${player.name} 对阵 ${enemies.filter(isAlive).length} 名敌人。`,
    actor: unitSummary(player),
    actorId: player.id,
    targetIds: enemies.filter(isAlive).map((enemy) => enemy.id),
  });

  if (!enemies.some(isAlive)) {
    outcome = "victory";
    reason = "all-enemies-defeated";
  } else if (!isAlive(player)) {
    outcome = "defeat";
    reason = "player-defeated";
  }

  const recordDeaths = (targets) => {
    const newlyDead = targets.filter((target) =>
      !isAlive(target)
      && !target._deathRecorded
      && (target.side === "player" || target._startedAlive));
    if (newlyDead.length === 0) return;
    for (const target of newlyDead) {
      target._deathRecorded = true;
      if (target.side === "enemy") {
        target._defeatedRound = rounds;
        defeatedEnemyIds.push(target.id);
      }
      if (target.side === "minion") statistics.minionsLost += 1;
    }
    appendLog({
      type: "defeat",
      message: newlyDead.length === 1
        ? `💀 ${newlyDead[0].name} 倒下了。`
        : `💀 ${newlyDead.map((target) => target.name).join("、")} 同时倒下了。`,
      actor: null,
      actorId: null,
      targets: newlyDead.map(unitSummary),
      targetIds: newlyDead.map((target) => target.id),
    });
  };

  if (!isAlive(player) && outcome === "defeat") recordDeaths([player]);

  const applyHits = (actor, target, skill) => {
    const hpBefore = target.hp;
    const configuredHitCount = Math.floor(clamp(
      skill.hitCount,
      1,
      config.maxHitsPerAction,
      1,
    ));
    const hits = [];

    const performHit = (index, extra) => {
      const hitHpBefore = target.hp;
      const roll = calculateDamage(actor, target, skill, rng, config);
      target.hp = clamp(target.hp - roll.damage, 0, target.maxHp, target.hp);
      const hit = {
        index,
        damage: roll.damage,
        critical: roll.critical,
        dodged: roll.dodged,
        reduction: roll.reduction,
        hpBefore: hitHpBefore,
        hpAfter: target.hp,
        extra,
        lifesteal: 0,
        thorns: 0,
        burnApplied: false,
      };
      if (roll.damage > 0) {
        // 吸血:按实际伤害回复,受自身生命上限约束;empower(形态)可附加吸血。
        const empowerLifesteal = actor.empower && actor.empower.remainingTurns > 0
          ? clamp(actor.empower.lifestealBonus, 0, config.effects.maxLifesteal, 0)
          : 0;
        const lifestealRatio = clamp(
          actor.lifesteal + empowerLifesteal,
          0,
          config.effects.maxLifesteal,
          0,
        );
        if (lifestealRatio > 0 && isAlive(actor)) {
          const before = actor.hp;
          actor.hp = clamp(actor.hp + roll.damage * lifestealRatio, 0, actor.maxHp, actor.hp);
          hit.lifesteal = Math.round(actor.hp - before);
        }
        // 点燃:命中后按概率给目标挂上燃烧,取更高的每回合伤害并刷新时长。
        if (actor.burnChance > 0 && isAlive(target) && randomValue(rng) < actor.burnChance) {
          const damagePerTurn = Math.max(1, Math.round(roll.damage * config.effects.burnDamageRatio));
          target.burn = {
            remainingTurns: config.effects.burnDuration,
            damagePerTurn: Math.max(target.burn?.damagePerTurn ?? 0, damagePerTurn),
            sourceId: actor.id,
          };
          hit.burnApplied = true;
        }
        // 荆棘:反伤是真实伤害,不可闪避,也不会再次触发吸血/荆棘。
        if (target.thorns > 0) {
          const reflected = Math.round(roll.damage * target.thorns);
          if (reflected > 0) {
            actor.hp = clamp(actor.hp - reflected, 0, actor.maxHp, actor.hp);
            hit.thorns = reflected;
          }
        }
      }
      hits.push(hit);
      return hit;
    };

    for (let index = 0; index < configuredHitCount && isAlive(target) && isAlive(actor); index += 1) {
      performHit(index + 1, false);
    }
    // 连击:每次行动至多追加一次额外打击,仍受多段数硬上限约束。
    let extraStrike = false;
    if (
      actor.multiHitChance > 0
      && hits.length > 0
      && hits.length < config.maxHitsPerAction
      && isAlive(target)
      && isAlive(actor)
      && randomValue(rng) < actor.multiHitChance
    ) {
      extraStrike = true;
      performHit(hits.length + 1, true);
    }

    const damage = hits.reduce((sum, hit) => sum + hit.damage, 0);
    const criticalCount = hits.filter((hit) => hit.critical).length;
    const dodgedCount = hits.filter((hit) => hit.dodged).length;
    const successfulHitCount = hits.length - dodgedCount;
    const lifestealHealing = hits.reduce((sum, hit) => sum + hit.lifesteal, 0);
    const thornsDamage = hits.reduce((sum, hit) => sum + hit.thorns, 0);
    const burnAppliedCount = hits.filter((hit) => hit.burnApplied).length;
    if (actor.side === "player") {
      statistics.playerDamageDealt += damage;
      statistics.playerCriticalHits += criticalCount;
      statistics.playerMaxHit = Math.max(statistics.playerMaxHit, ...hits.map((hit) => hit.damage), 0);
      statistics.lifestealHealing += lifestealHealing;
      statistics.playerHealing += lifestealHealing;
      statistics.burnsApplied += burnAppliedCount;
      statistics.extraStrikes += extraStrike ? 1 : 0;
      statistics.playerDamageTaken += thornsDamage;
    } else if (actor.side === "minion") {
      statistics.minionDamageDealt += damage;
    } else if (target.side === "player") {
      statistics.playerDamageTaken += damage;
      statistics.playerDodges += dodgedCount;
      statistics.thornsDamage += thornsDamage;
    } else {
      statistics.minionDamageTaken += damage;
    }
    return {
      ...unitSummary(target),
      damage,
      totalDamage: damage,
      critical: criticalCount > 0,
      dodged: hits.length > 0 && dodgedCount === hits.length,
      reduction: hits.reduce((maximum, hit) => Math.max(maximum, hit.reduction), 0),
      hpBefore,
      hpAfter: target.hp,
      defeated: hpBefore > 0 && target.hp === 0,
      configuredHitCount,
      hitCount: hits.length,
      successfulHitCount,
      criticalCount,
      dodgedCount,
      lifestealHealing,
      thornsDamage,
      burnAppliedCount,
      extraStrike,
      hits,
    };
  };

  /** Minions derive their sheet from the caster at cast time. */
  const createMinion = (caster, skill) => {
    minionCounter += 1;
    const raw = {
      id: `minion-${minionCounter}`,
      name: `${skill.minionName}·${minionCounter}`,
      emoji: skill.minionEmoji,
      stats: {
        maxHp: Math.max(1, Math.round(caster.maxHp * skill.minionHpRatio)),
        attack: Math.max(1, Math.round(caster.attack * skill.minionAttackRatio)),
        defense: Math.max(0, Math.round(caster.defense * skill.minionDefenseRatio)),
        speed: Math.max(1, Math.round(caster.speed * skill.minionSpeedRatio)),
        critChance: 0.05,
        critDamage: 1.5,
      },
      skills: [{
        id: "minion_attack",
        name: "撕咬",
        emoji: skill.minionEmoji,
        type: "single",
        multiplier: 1,
        cooldown: 0,
        isBasic: true,
      }],
    };
    // _order 从 100 起,避免与玩家(0)和敌人(1..20)的同速排序冲突。
    return normalizeUnit(raw, "minion", 100 + minionCounter, config);
  };

  const performAction = (actor) => {
    const opponents = actor.side === "enemy"
      ? [player, ...minions].filter(isAlive)
      : enemies.filter(isAlive);
    if (opponents.length === 0) return;
    const skill = chooseSkill(actor, opponents, config, {
      activeMinions: minions.filter(isAlive).length,
    });
    if (!skill) return;

    if (skill.type === "summon") {
      const cap = Math.min(skill.maxMinions, config.minions.maxActive);
      const living = minions.filter(isAlive).length;
      const count = Math.max(0, Math.min(
        skill.summonCount,
        cap - living,
        config.minions.maxSummonsPerCast,
      ));
      const summoned = [];
      for (let index = 0; index < count; index += 1) {
        const minion = createMinion(actor, skill);
        minions.push(minion);
        summoned.push(minion);
      }
      consumeTurn(actor, skill);
      statistics.minionsSummoned += summoned.length;
      appendLog({
        type: "action",
        actionType: "summon",
        message: summoned.length > 0
          ? `${actor.emoji} ${actor.name} 使用 ${skill.emoji} ${skill.name}，召唤了 ${summoned.length} 名${skill.minionName}加入战斗。`
          : `${actor.emoji} ${actor.name} 的 ${skill.emoji} ${skill.name} 没有唤起新的仆从。`,
        actor: unitSummary(actor),
        actorId: actor.id,
        skill: skillSummary(skill),
        skillId: skill.id,
        targets: summoned.map((minion) => ({
          ...unitSummary(minion),
          hp: minion.hp,
          maxHp: minion.maxHp,
        })),
        targetIds: summoned.map((minion) => minion.id),
        summonedCount: summoned.length,
      });
      return;
    }

    if (skill.type === "empower") {
      actor.empower = {
        remainingTurns: skill.duration,
        damageBonus: skill.damageBonus,
        lifestealBonus: skill.lifestealBonus,
        sourceSkillId: skill.id,
      };
      consumeTurn(actor, skill, false, true);
      const effects = [];
      if (skill.damageBonus > 0) effects.push(`伤害 +${Math.round(skill.damageBonus * 100)}%`);
      if (skill.lifestealBonus > 0) effects.push(`吸血 +${Math.round(skill.lifestealBonus * 100)}%`);
      appendLog({
        type: "action",
        actionType: "empower",
        message: `${actor.emoji} ${actor.name} 使用 ${skill.emoji} ${skill.name}，${effects.join("、") || "进入强化形态"}，持续 ${skill.duration} 回合。`,
        actor: unitSummary(actor),
        actorId: actor.id,
        skill: skillSummary(skill),
        skillId: skill.id,
        targetIds: [actor.id],
        damageBonus: skill.damageBonus,
        lifestealBonus: skill.lifestealBonus,
        duration: skill.duration,
      });
      return;
    }

    if (skill.type === "guard") {
      actor.guard = {
        remainingTurns: skill.duration,
        reduction: skill.reduction,
        dodgeBonus: skill.dodgeBonus,
        sourceSkillId: skill.id,
      };
      consumeTurn(actor, skill, true);
      const effects = [];
      if (skill.reduction > 0) effects.push(`${Math.round(skill.reduction * 100)}% 减伤`);
      if (skill.dodgeBonus > 0) effects.push(`${Math.round(skill.dodgeBonus * 100)}% 闪避`);
      appendLog({
        type: "action",
        actionType: "guard",
        message: `${actor.emoji} ${actor.name} 使用 ${skill.emoji} ${skill.name}，获得 ${effects.join("与") || "防御姿态"}，持续 ${skill.duration} 回合。`,
        actor: unitSummary(actor),
        actorId: actor.id,
        skill: skillSummary(skill),
        skillId: skill.id,
        targetIds: [actor.id],
        reduction: skill.reduction,
        dodgeBonus: skill.dodgeBonus,
        duration: skill.duration,
      });
      return;
    }

    if (skill.type === "heal") {
      const before = actor.hp;
      const requested = skill.healAmount + actor.maxHp * skill.healRatio;
      actor.hp = clamp(actor.hp + requested, 0, actor.maxHp, actor.hp);
      const healing = Math.max(0, Math.round(actor.hp - before));
      if (actor.side === "player") statistics.playerHealing += healing;
      consumeTurn(actor, skill);
      appendLog({
        type: "action",
        actionType: "heal",
        message: `${actor.emoji} ${actor.name} 使用 ${skill.emoji} ${skill.name}，恢复 ${healing} 点生命。`,
        actor: unitSummary(actor),
        actorId: actor.id,
        skill: skillSummary(skill),
        skillId: skill.id,
        targetIds: [actor.id],
        healing,
      });
      return;
    }

    if (skill.type === "aoe") {
      const targets = opponents.filter(isAlive);
      const details = [];
      for (const target of targets) {
        // 荆棘反伤可能在扫场途中击倒施法者,此时立即停手。
        if (!isAlive(actor)) break;
        details.push(applyHits(actor, target, skill));
      }
      consumeTurn(actor, skill);
      const totalDamage = details.reduce((sum, target) => sum + target.damage, 0);
      const hitCount = details.filter((target) => target.successfulHitCount > 0).length;
      const strikeCount = details.reduce((sum, target) => sum + target.hitCount, 0);
      const successfulHitCount = details.reduce(
        (sum, target) => sum + target.successfulHitCount,
        0,
      );
      const criticalCount = details.reduce((sum, target) => sum + target.criticalCount, 0);
      const dodgedCount = details.reduce((sum, target) => sum + target.dodgedCount, 0);
      const effectTotals = {
        extraStrike: details.some((target) => target.extraStrike),
        lifestealHealing: details.reduce((sum, target) => sum + target.lifestealHealing, 0),
        thornsDamage: details.reduce((sum, target) => sum + target.thornsDamage, 0),
        burnAppliedCount: details.filter((target) => target.burnAppliedCount > 0).length,
      };
      const segment = skill.hitCount > 1
        ? `，${successfulHitCount}/${strikeCount} 段命中`
        : "";
      appendLog({
        type: "action",
        actionType: "aoe",
        message: `${actor.emoji} ${actor.name} 使用 ${skill.emoji} ${skill.name} 命中 ${hitCount} 名敌人${segment}，共造成 ${totalDamage} 点伤害${criticalCount ? `（${criticalCount} 次暴击）` : ""}${dodgedCount ? `（${dodgedCount} 次闪避）` : ""}${formatEffectNotes(effectTotals, details.length)}。`,
        actor: unitSummary(actor),
        actorId: actor.id,
        skill: skillSummary(skill),
        skillId: skill.id,
        targets: details,
        targetIds: details.map((target) => target.id),
        damage: totalDamage,
        totalDamage,
        hitCount,
        strikeCount,
        successfulHitCount,
        criticalCount,
        dodgedCount,
        lifestealHealing: effectTotals.lifestealHealing,
        thornsDamage: effectTotals.thornsDamage,
        burnAppliedCount: effectTotals.burnAppliedCount,
      });
      recordDeaths(targets);
      if (!isAlive(actor)) recordDeaths([actor]);
      return;
    }

    const { target, retargetedFrom } = resolveSingleTarget(
      actor,
      opponents,
      actor.side === "player" ? config.ai.targetStrategy : "lowestHp",
    );
    if (!target) return;
    const detail = applyHits(actor, target, skill);
    consumeTurn(actor, skill);
    appendLog({
      type: "action",
      actionType: "single",
      message: formatSingleAction(actor, target, skill, detail),
      actor: unitSummary(actor),
      actorId: actor.id,
      skill: skillSummary(skill),
      skillId: skill.id,
      targets: [detail],
      targetIds: [target.id],
      damage: detail.damage,
      totalDamage: detail.damage,
      critical: detail.critical,
      dodged: detail.dodged,
      reduction: detail.reduction,
      hitCount: detail.hitCount,
      successfulHitCount: detail.successfulHitCount,
      criticalCount: detail.criticalCount,
      dodgedCount: detail.dodgedCount,
      lifestealHealing: detail.lifestealHealing,
      thornsDamage: detail.thornsDamage,
      burnAppliedCount: detail.burnAppliedCount,
      extraStrike: detail.extraStrike,
      hits: detail.hits,
      retargetedFrom,
    });
    recordDeaths([target]);
    if (!isAlive(actor)) recordDeaths([actor]);
    if (!isAlive(player)) recordDeaths([player]);
  };

  while (!outcome && rounds < config.maxRounds) {
    rounds += 1;
    // 本回合中途召唤出的随从不在本回合行动(下一轮才进入行动序)。
    const turnOrder = [player, ...minions, ...enemies]
      .filter(isAlive)
      .sort((a, b) => compareTurnOrder(a, b, config.speedTieBreaker));
    appendLog({
      type: "round_start",
      message: `第 ${rounds} 回合`,
      actor: null,
      actorId: null,
      targetIds: [],
      turnOrder: turnOrder.map((unit) => unit.id),
    });

    for (const actor of turnOrder) {
      if (!isAlive(player)) {
        outcome = "defeat";
        reason = "player-defeated";
        break;
      }
      if (!enemies.some(isAlive)) {
        outcome = "victory";
        reason = "all-enemies-defeated";
        break;
      }
      if (!isAlive(actor)) continue;

      // 燃烧在单位自己的回合开始时结算;被烧死则跳过其本回合行动。
      if (actor.burn) {
        const burnDamage = Math.min(
          Math.max(1, Math.floor(actor.burn.damagePerTurn)),
          Math.max(1, Math.ceil(actor.hp)),
        );
        actor.hp = clamp(actor.hp - burnDamage, 0, actor.maxHp, 0);
        actor.burn.remainingTurns -= 1;
        const expired = actor.burn.remainingTurns <= 0;
        if (expired) actor.burn = null;
        if (actor.side === "player") {
          statistics.playerDamageTaken += burnDamage;
        } else if (actor.side === "minion") {
          statistics.minionDamageTaken += burnDamage;
        } else {
          statistics.burnDamage += burnDamage;
          statistics.playerDamageDealt += burnDamage;
        }
        appendLog({
          type: "status",
          actionType: "burn",
          message: `🔥 ${actor.name} 被烈焰灼烧，损失 ${burnDamage} 点生命${expired ? "，火焰随之熄灭" : ""}。`,
          actor: unitSummary(actor),
          actorId: actor.id,
          targetIds: [actor.id],
          damage: burnDamage,
          expired,
        });
        if (!isAlive(actor)) {
          recordDeaths([actor]);
          if (!isAlive(player)) {
            outcome = "defeat";
            reason = "player-defeated";
            break;
          }
          if (!enemies.some(isAlive)) {
            outcome = "victory";
            reason = "all-enemies-defeated";
            break;
          }
          continue;
        }
      }

      performAction(actor);

      if (!isAlive(player)) {
        outcome = "defeat";
        reason = "player-defeated";
        break;
      }
      if (!enemies.some(isAlive)) {
        outcome = "victory";
        reason = "all-enemies-defeated";
        break;
      }
    }
  }

  if (!outcome) {
    outcome = "defeat";
    reason = "max-rounds";
    appendLog({
      type: "round_limit",
      message: `战斗达到 ${config.maxRounds} 回合上限，玩家撤退。`,
      actor: unitSummary(player),
      actorId: player.id,
      targetIds: enemies.filter(isAlive).map((enemy) => enemy.id),
    });
  }

  const defeatedReward = enemies
    .filter((enemy) => enemy._defeatedRound !== null)
    .reduce((total, enemy) => ({
      experience: total.experience + enemy.reward.experience,
      gold: total.gold + enemy.reward.gold,
    }), { experience: 0, gold: 0 });
  const victory = outcome === "victory";
  const rewards = {
    experience: victory ? defeatedReward.experience : 0,
    xp: victory ? defeatedReward.experience : 0,
    gold: victory ? defeatedReward.gold : 0,
    defeatedEnemyIds: victory ? [...defeatedEnemyIds] : [],
  };
  const defeatedRewards = {
    experience: defeatedReward.experience,
    xp: defeatedReward.experience,
    gold: defeatedReward.gold,
    defeatedEnemyIds: [...defeatedEnemyIds],
  };

  appendLog({
    type: "battle_end",
    message: victory ? "🏆 战斗胜利！" : "☠️ 战斗失败。",
    actor: unitSummary(player),
    actorId: player.id,
    targetIds: enemies.filter(isAlive).map((enemy) => enemy.id),
    outcome,
    reason,
    rewards: { ...rewards },
  });
  if (victory) {
    appendLog({
      type: "reward",
      message: `获得 ${rewards.experience} 点经验与 ${rewards.gold} 枚金币。`,
      actor: unitSummary(player),
      actorId: player.id,
      targetIds: [],
      rewards: { ...rewards },
    });
  }

  const playerResult = publicUnit(player);
  const enemyResults = enemies.map(publicUnit);
  const minionResults = minions.map(publicUnit);
  const finalState = {
    player: playerResult,
    minions: minionResults,
    enemies: enemyResults,
    aliveEnemyCount: enemyResults.filter((enemy) => enemy.alive).length,
  };
  const result = {
    winner: victory ? "player" : "enemies",
    winnerSide: victory ? "player" : "enemies",
    outcome,
    resultCode: victory ? "win" : "loss",
    victory,
    won: victory,
    reason,
    rounds,
    rewards: { ...rewards },
  };

  return {
    ...result,
    result,
    status: outcome,
    seed: options.seed,
    seedHash: hashSeed(options.seed),
    rngState: rng.getState(),
    logs,
    events: logs,
    rewards,
    reward: rewards,
    experience: rewards.experience,
    gold: rewards.gold,
    defeatedRewards,
    statistics: {
      ...statistics,
      rounds,
      defeatedEnemies: defeatedEnemyIds.length,
    },
    player: playerResult,
    minions: minionResults,
    enemies: enemyResults,
    finalState,
    state: finalState,
  };
}

export { createSeededRng, hashSeed };

export default simulateCombat;
