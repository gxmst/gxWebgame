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
    priority: Object.freeze(["survival", "aoe", "single", "basic"]),
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
  const known = new Set(["survival", "aoe", "single", "basic"]);
  const normalized = value
    .map((item) => String(item ?? "").toLowerCase())
    .map((item) => {
      if (["guard", "defense", "defensive", "heal", "self"].includes(item)) {
        return "survival";
      }
      if (["area", "group", "all"].includes(item)) return "aoe";
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

  return {
    maxRounds: Math.floor(configNumber(
      [combat, root],
      ["maxRounds", "roundLimit", "maximumRounds"],
      DEFAULT_COMBAT_CONFIG.maxRounds,
      1,
      100_000,
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
    triggerBelowHpRatio: clamp(
      firstDefined([definition], ["triggerBelowHpRatio", "hpThreshold", "healthThreshold"], config.ai.guardHpThreshold),
      0,
      1,
      config.ai.guardHpThreshold,
    ),
    canCrit: definition.canCrit !== false,
    ignoreDefense: Boolean(definition.ignoreDefense),
    isBasic: Boolean(definition.isBasic) || id === "basic_attack",
    aiPriority: finiteNumber(definition.aiPriority ?? definition.priority, 0),
  };
}

function normalizeSkills(raw, side, config) {
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
      ? DEFAULT_PLAYER_SKILL_IDS
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
    const fallback = normalizeSkill("basic_attack", config)
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
    sourceSkillId: supplied.sourceSkillId ?? supplied.skillId ?? null,
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
  const dodgeChance = clamp(
    firstDefined(targetSources, ["dodgeChance", "evasion", "evadeChance"], 0),
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
  const attackPower = Math.min(
    MAX_STAT * 100,
    (attack * multiplier + clamp(normalizedSkill?.flatDamage, 0, MAX_STAT, 0))
      * outgoingMultiplier,
  );
  const defense = normalizedSkill?.ignoreDefense
    ? 0
    : clamp(
        firstDefined(targetSources, ["defense", "defence", "def", "armor"], 0),
        0,
        MAX_STAT,
        0,
      ) * config.damage.defenseCoefficient;
  const cappedDefense = Math.min(
    defense,
    attackPower * config.damage.maxDefenseReduction,
  );
  const mitigated = Math.max(config.damage.minDamage, attackPower - cappedDefense);
  const critical = normalizedSkill?.canCrit !== false
    && randomValue(rng) < clamp(
      firstDefined(attackerSources, ["critChance", "criticalChance", "criticalRate"], 0),
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
  const targetGuard = isRecord(target?.guard)
    ? target.guard
    : isRecord(target?.status?.guard)
      ? target.status.guard
      : null;
  const guardReduction = targetGuard
    && finiteNumber(targetGuard.remainingTurns ?? targetGuard.turns, 0) > 0
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

/** Configurable automatic skill decision with an unconditional basic fallback. */
export function chooseSkill(actor, opponents, inputConfig = {}) {
  const config = inputConfig?.skillRegistry ? inputConfig : normalizeCombatConfig(inputConfig);
  const livingCount = Array.isArray(opponents) ? opponents.filter(isAlive).length : 0;
  if (livingCount === 0) return null;
  const skills = Array.isArray(actor?.skills) ? actor.skills : [];
  const ready = skills.filter((skill) => skillIsReady(actor, skill));
  const hpRatio = clamp(actor?.hp, 0, Math.max(1, finiteNumber(actor?.maxHp, 1)), 0)
    / Math.max(1, finiteNumber(actor?.maxHp, 1));

  if (config.ai.buildAwareOffense) {
    const defensive = ready.filter((skill) =>
      (skill.type === "guard" || skill.type === "heal")
      && hpRatio <= clamp(
        skill.triggerBelowHpRatio,
        0,
        1,
        config.ai.guardHpThreshold,
      ));
    const survival = pickBest(defensive, (skill) =>
      skill.reduction * Math.max(1, skill.duration)
        + skill.healRatio
        + skill.healAmount / Math.max(1, actor.maxHp));
    if (survival) return survival;

    const offense = ready.filter((skill) =>
      (skill.type === "single" && !skill.isBasic)
      || (skill.type === "aoe" && livingCount >= Math.floor(clamp(
        skill.minimumTargets,
        1,
        100,
        config.ai.aoeMinTargets,
      ))));
    const selected = pickBest(offense, (skill) => skill.type === "aoe"
      ? skill.multiplier * livingCount * config.ai.aoeUtilityWeight
      : skill.multiplier);
    if (selected) return selected;

    const basic = pickBest(ready.filter((skill) => skill.isBasic), (skill) => skill.multiplier);
    if (basic) return basic;
  }

  for (const category of config.ai.priority) {
    if (category === "survival") {
      const defensive = ready.filter((skill) =>
        (skill.type === "guard" || skill.type === "heal")
        && hpRatio <= clamp(
          skill.triggerBelowHpRatio,
          0,
          1,
          config.ai.guardHpThreshold,
        ));
      const selected = pickBest(defensive, (skill) =>
        skill.reduction * Math.max(1, skill.duration)
          + skill.healRatio
          + skill.healAmount / Math.max(1, actor.maxHp));
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
        (skill) => skill.multiplier * livingCount,
      );
      if (selected) return selected;
    }
    if (category === "single") {
      const selected = pickBest(
        ready.filter((skill) => skill.type === "single" && !skill.isBasic),
        (skill) => skill.multiplier,
      );
      if (selected) return selected;
    }
    if (category === "basic") {
      const selected = pickBest(
        ready.filter((skill) => skill.isBasic),
        (skill) => skill.multiplier,
      );
      if (selected) return selected;
    }
  }

  return pickBest(ready, (skill) => skill.multiplier) ?? null;
}

function unitSummary(unit) {
  return {
    id: unit.id,
    name: unit.name,
    emoji: unit.emoji,
    side: unit.side,
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
    resource: clamp(source.resource, 0, MAX_STAT, 0),
    maxResource: clamp(source.maxResource, 0, MAX_STAT, 0),
    cooldowns: isRecord(source.cooldowns) ? { ...source.cooldowns } : {},
    guard: isRecord(source.guard) ? { ...source.guard } : null,
    skills: Array.isArray(source.skills)
      ? source.skills.map((skill) => isRecord(skill) ? { ...skill } : skill)
      : [],
  };
}

export function createCombatSnapshot(player, enemies) {
  const enemySnapshots = (Array.isArray(enemies) ? enemies : []).map(publicUnit);
  return {
    player: publicUnit(player),
    enemies: enemySnapshots,
    aliveEnemyCount: enemySnapshots.filter((enemy) => enemy.alive).length,
  };
}

function consumeTurn(actor, usedSkill, appliedGuard = false) {
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

function formatSingleAction(actor, target, skill, roll) {
  if (roll.dodged) {
    return `${target.emoji} ${target.name} 闪避了 ${actor.name} 的 ${skill.emoji} ${skill.name}。`;
  }
  const critical = roll.critical ? "（暴击）" : "";
  const guarded = roll.reduction > 0 ? `（减伤 ${Math.round(roll.reduction * 100)}%）` : "";
  return `${actor.emoji} ${actor.name} 对 ${target.name} 使用 ${skill.emoji} ${skill.name}，造成 ${roll.damage} 点伤害${critical}${guarded}。`;
}

function parseSimulationArgs(playerOrOptions, enemiesArg, seedArg, configArg) {
  if (isRecord(playerOrOptions) && hasOwn(playerOrOptions, "player")) {
    const secondIsConfig = isRecord(enemiesArg)
      && ["combat", "skills", "maxRounds", "damage", "ai"].some((key) => hasOwn(enemiesArg, key));
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
    && ["combat", "skills", "maxRounds", "damage", "ai"].some((key) => hasOwn(seedArg, key))) {
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
  const rng = createSeededRng(options.seed);
  const logs = [];
  const defeatedEnemyIds = [];
  let rounds = 0;
  let outcome = null;
  let reason = null;

  const snapshot = () => createCombatSnapshot(player, enemies);
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

  const performAction = (actor) => {
    const opponents = actor.side === "player"
      ? enemies.filter(isAlive)
      : isAlive(player)
        ? [player]
        : [];
    if (opponents.length === 0) return;
    const skill = chooseSkill(actor, opponents, config);
    if (!skill) return;

    if (skill.type === "guard") {
      actor.guard = {
        remainingTurns: skill.duration,
        reduction: skill.reduction,
        sourceSkillId: skill.id,
      };
      consumeTurn(actor, skill, true);
      appendLog({
        type: "action",
        actionType: "guard",
        message: `${actor.emoji} ${actor.name} 使用 ${skill.emoji} ${skill.name}，获得 ${Math.round(skill.reduction * 100)}% 减伤，持续 ${skill.duration} 回合。`,
        actor: unitSummary(actor),
        actorId: actor.id,
        skill: { id: skill.id, name: skill.name, emoji: skill.emoji, type: skill.type },
        skillId: skill.id,
        targetIds: [actor.id],
        reduction: skill.reduction,
        duration: skill.duration,
      });
      return;
    }

    if (skill.type === "heal") {
      const before = actor.hp;
      const requested = skill.healAmount + actor.maxHp * skill.healRatio;
      actor.hp = clamp(actor.hp + requested, 0, actor.maxHp, actor.hp);
      const healing = Math.max(0, Math.round(actor.hp - before));
      consumeTurn(actor, skill);
      appendLog({
        type: "action",
        actionType: "heal",
        message: `${actor.emoji} ${actor.name} 使用 ${skill.emoji} ${skill.name}，恢复 ${healing} 点生命。`,
        actor: unitSummary(actor),
        actorId: actor.id,
        skill: { id: skill.id, name: skill.name, emoji: skill.emoji, type: skill.type },
        skillId: skill.id,
        targetIds: [actor.id],
        healing,
      });
      return;
    }

    if (skill.type === "aoe") {
      const targets = opponents.filter(isAlive);
      const details = targets.map((target) => {
        const roll = calculateDamage(actor, target, skill, rng, config);
        const hpBefore = target.hp;
        target.hp = clamp(target.hp - roll.damage, 0, target.maxHp, target.hp);
        return {
          ...unitSummary(target),
          damage: roll.damage,
          critical: roll.critical,
          dodged: roll.dodged,
          hpBefore,
          hpAfter: target.hp,
          defeated: hpBefore > 0 && target.hp === 0,
        };
      });
      consumeTurn(actor, skill);
      const totalDamage = details.reduce((sum, target) => sum + target.damage, 0);
      const hitCount = details.filter((target) => !target.dodged).length;
      const criticalCount = details.filter((target) => target.critical).length;
      const dodgedCount = details.filter((target) => target.dodged).length;
      appendLog({
        type: "action",
        actionType: "aoe",
        message: `${actor.emoji} ${actor.name} 使用 ${skill.emoji} ${skill.name} 命中 ${hitCount} 名敌人，共造成 ${totalDamage} 点伤害${criticalCount ? `（${criticalCount} 次暴击）` : ""}${dodgedCount ? `（${dodgedCount} 次闪避）` : ""}。`,
        actor: unitSummary(actor),
        actorId: actor.id,
        skill: { id: skill.id, name: skill.name, emoji: skill.emoji, type: skill.type },
        skillId: skill.id,
        targets: details,
        targetIds: details.map((target) => target.id),
        damage: totalDamage,
        totalDamage,
        hitCount,
        criticalCount,
        dodgedCount,
      });
      recordDeaths(targets);
      return;
    }

    const { target, retargetedFrom } = resolveSingleTarget(
      actor,
      opponents,
      actor.side === "player" ? config.ai.targetStrategy : "lowestHp",
    );
    if (!target) return;
    const hpBefore = target.hp;
    const roll = calculateDamage(actor, target, skill, rng, config);
    target.hp = clamp(target.hp - roll.damage, 0, target.maxHp, target.hp);
    consumeTurn(actor, skill);
    appendLog({
      type: "action",
      actionType: "single",
      message: formatSingleAction(actor, target, skill, roll),
      actor: unitSummary(actor),
      actorId: actor.id,
      skill: { id: skill.id, name: skill.name, emoji: skill.emoji, type: skill.type },
      skillId: skill.id,
      targets: [{
        ...unitSummary(target),
        damage: roll.damage,
        critical: roll.critical,
        dodged: roll.dodged,
        hpBefore,
        hpAfter: target.hp,
        defeated: hpBefore > 0 && target.hp === 0,
      }],
      targetIds: [target.id],
      damage: roll.damage,
      totalDamage: roll.damage,
      critical: roll.critical,
      dodged: roll.dodged,
      reduction: roll.reduction,
      retargetedFrom,
    });
    recordDeaths([target]);
    if (!isAlive(player)) recordDeaths([player]);
  };

  while (!outcome && rounds < config.maxRounds) {
    rounds += 1;
    const turnOrder = [player, ...enemies]
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
  const finalState = {
    player: playerResult,
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
    player: playerResult,
    enemies: enemyResults,
    finalState,
    state: finalState,
  };
}

export { createSeededRng, hashSeed };

export default simulateCombat;
