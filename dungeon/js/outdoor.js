import { CONFIG, createSeededRng } from "./config.js";
import { createEnemyWave, getFloor, getFloorCap } from "./dungeon.js";
import { sanitizeItem } from "./hero.js";
import { generateLoot } from "./loot.js";

const MAX_REWARD = Number.MAX_SAFE_INTEGER;
const OUTDOOR_STAT_KEYS = Object.freeze(["maxHp", "attack", "defense"]);

/**
 * Runtime-only outdoor state. It deliberately contains no timestamps, so a
 * hidden or closed page can never be converted into offline rewards.
 */
export function createDefaultOutdoorState() {
  return {
    status: "idle",
    sessionSeed: null,
    nextWaveIndex: 0,
    completedWaves: 0,
    defeats: 0,
    rewards: createEmptyRewards(),
  };
}

/** Drops unknown fields and, in particular, any legacy timing fields. */
export function sanitizeOutdoorState(candidate) {
  const source = isRecord(candidate) ? candidate : {};
  const status = ["idle", "running", "paused"].includes(source.status)
    ? source.status
    : source.active === true
      ? "running"
      : "idle";
  return {
    status,
    sessionSeed: normalizeNullableSeed(source.sessionSeed ?? source.seed),
    nextWaveIndex: clampInteger(source.nextWaveIndex ?? source.waveIndex, 0, MAX_REWARD, 0),
    completedWaves: clampInteger(source.completedWaves, 0, MAX_REWARD, 0),
    defeats: clampInteger(source.defeats, 0, MAX_REWARD, 0),
    rewards: sanitizeRewards(source.rewards ?? source.pendingRewards),
  };
}

/** Starts a new foreground run and clears any already-settled session data. */
export function startOutdoorRun(state = null, seed = 0) {
  // Sanitize first so this remains a safe reducer even for malformed saves.
  sanitizeOutdoorState(state);
  return {
    ...createDefaultOutdoorState(),
    status: "running",
    sessionSeed: normalizeSeed(seed),
  };
}

/** Visibility handlers can pause without introducing elapsed-time accounting. */
export function pauseOutdoorRun(state) {
  const current = sanitizeOutdoorState(state);
  return current.status === "running" ? { ...current, status: "paused" } : current;
}

export function resumeOutdoorRun(state) {
  const current = sanitizeOutdoorState(state);
  return current.status === "paused" ? { ...current, status: "running" } : current;
}

/**
 * Returns the configured, unlocked non-progression range used by outdoor
 * encounters. A prestige cap is honored when the caller supplies a hero.
 */
export function getOutdoorFloorRange(saveOrProgress, inputConfig = CONFIG) {
  const tuning = normalizeOutdoorConfig(inputConfig);
  const highestUnlocked = readHighestUnlockedFloor(saveOrProgress, inputConfig);
  const context = getCharacterContext(saveOrProgress);
  const cappedHighest = hasHeroContext(context)
    ? Math.min(highestUnlocked, getFloorCap(context))
    : highestUnlocked;
  const minimum = clampInteger(
    cappedHighest + tuning.floorOffsetRange[0],
    tuning.minimumFloor,
    cappedHighest,
    tuning.minimumFloor,
  );
  const maximum = clampInteger(
    cappedHighest + tuning.floorOffsetRange[1],
    minimum,
    cappedHighest,
    cappedHighest,
  );
  let candidates = range(minimum, maximum).filter((floorId) => {
    const floor = getFloor(floorId);
    return floor && (!tuning.excludeBossFloors || !isBossFloor(floor, inputConfig));
  });

  // A one-floor range can land exactly on a boss. Outdoor mode must not become
  // an alternate boss farm, so fall back to the nearest earlier normal floor.
  if (candidates.length === 0 && tuning.excludeBossFloors) {
    for (let floorId = cappedHighest; floorId >= tuning.minimumFloor; floorId -= 1) {
      const floor = getFloor(floorId);
      if (floor && !isBossFloor(floor, inputConfig)) {
        candidates = [floorId];
        break;
      }
    }
  }
  if (candidates.length === 0 && getFloor(tuning.minimumFloor)) {
    candidates = [tuning.minimumFloor];
  }

  return {
    highestUnlockedFloor: highestUnlocked,
    effectiveHighestFloor: cappedHighest,
    minimumFloor: candidates[0] ?? tuning.minimumFloor,
    maximumFloor: candidates.at(-1) ?? tuning.minimumFloor,
    candidates,
  };
}

/** Picks a nearby unlocked floor using only the supplied seed. */
export function selectOutdoorFloor(saveOrProgress, seed = 0, inputConfig = CONFIG) {
  const floorRange = getOutdoorFloorRange(saveOrProgress, inputConfig);
  if (floorRange.candidates.length === 0) return null;
  const rng = createSeededRng(`${normalizeSeed(seed)}|outdoor-floor`);
  const floorId = rng.pick(floorRange.candidates) ?? floorRange.candidates[0];
  return getFloor(floorId);
}

/**
 * Builds a deterministic outdoor wave by reusing the dungeon wave generator,
 * then applying only outdoor-specific strength and reward coefficients.
 */
export function createOutdoorWave(saveOrProgress, stateOrSeed = 0, inputConfig = CONFIG) {
  const tuning = normalizeOutdoorConfig(inputConfig);
  const state = isRecord(stateOrSeed) ? sanitizeOutdoorState(stateOrSeed) : null;
  const waveIndex = state?.nextWaveIndex ?? 0;
  const sessionSeed = state
    ? (state.sessionSeed ?? "0")
    : normalizeSeed(stateOrSeed);
  const waveSeed = `${sessionSeed ?? "0"}|outdoor-wave|${waveIndex}`;
  const floor = selectOutdoorFloor(saveOrProgress, waveSeed, inputConfig);
  if (!floor) return createEmptyOutdoorWave(waveSeed, waveIndex, tuning.minimumFloor);
  const source = createEnemyWave(floor.id, `${waveSeed}|enemies`);
  const enemies = source.enemies.map((enemy) => scaleOutdoorEnemy(enemy, tuning));
  const rewards = sumEnemyRewards(enemies);

  return {
    ...source,
    id: `outdoor-${source.id}-${waveIndex}`,
    mode: "outdoor",
    waveIndex,
    seed: waveSeed,
    isBoss: false,
    enemies,
    rewards: { ...rewards, lootCount: 0 },
    experienceReward: rewards.experience,
    goldReward: rewards.gold,
  };
}

/**
 * Accumulates one finished wave. Drops are rolled independently per defeated
 * enemy, so adding another enemy cannot change earlier enemies' items.
 */
export function settleOutdoorWave(
  state,
  wave,
  combatResult,
  hero = null,
  inputConfig = CONFIG,
) {
  const current = sanitizeOutdoorState(state);
  const sourceWave = isRecord(wave) ? wave : createEmptyOutdoorWave("0", current.nextWaveIndex, 1);
  const tuning = normalizeOutdoorConfig(inputConfig);
  const victory = isVictory(combatResult);
  const waveRewards = victory
    ? readVictoryRewards(combatResult, sourceWave)
    : { experience: 0, gold: 0 };
  const items = [];
  const materials = {};

  if (victory) {
    for (const enemy of Array.isArray(sourceWave.enemies) ? sourceWave.enemies : []) {
      const enemyId = String(enemy?.id ?? "enemy");
      const dropSeed = `${normalizeSeed(sourceWave.seed)}|drop|${enemyId}`;
      const rng = createSeededRng(dropSeed);
      if (rng() < tuning.lootChancePerEnemy) {
        const lootFloor = clampInteger(
          finiteInteger(sourceWave.floorId, tuning.minimumFloor) + tuning.lootFloorOffset,
          tuning.minimumFloor,
          tuning.maximumFloor,
          tuning.minimumFloor,
        );
        const item = generateLoot(lootFloor, `${dropSeed}|equipment`, hero, {
          idPrefix: "outdoor",
          classId: typeof hero?.classId === "string" ? hero.classId : undefined,
        });
        if (item) items.push(item);
      }
      if (tuning.materialsEnabled && rng() < tuning.materialDropChancePerEnemy) {
        materials[tuning.materialId] = safeAdd(materials[tuning.materialId], 1);
      }
    }
  }

  const earned = {
    experience: waveRewards.experience,
    gold: waveRewards.gold,
    items,
    materials,
  };
  const rewards = mergeRewards(current.rewards, earned);
  const next = {
    ...current,
    status: victory && current.status !== "paused" ? "running" : "idle",
    nextWaveIndex: safeAdd(current.nextWaveIndex, 1),
    completedWaves: safeAdd(current.completedWaves, victory ? 1 : 0),
    defeats: safeAdd(current.defeats, victory ? 0 : 1),
    rewards,
  };
  return { state: next, earned: cloneRewards(earned), rewards: cloneRewards(rewards) };
}

/** Stops a run and atomically hands its pending rewards to the caller. */
export function stopOutdoorRun(state) {
  const current = sanitizeOutdoorState(state);
  return {
    state: createDefaultOutdoorState(),
    settlement: cloneRewards(current.rewards),
    summary: {
      completedWaves: current.completedWaves,
      defeats: current.defeats,
      experience: current.rewards.experience,
      gold: current.rewards.gold,
      itemCount: current.rewards.items.length,
      materialCount: Object.values(current.rewards.materials)
        .reduce((sum, amount) => safeAdd(sum, amount), 0),
    },
  };
}

function normalizeOutdoorConfig(inputConfig) {
  const root = isRecord(inputConfig) ? inputConfig : {};
  const source = isRecord(root.outdoor) ? root.outdoor : root;
  const dungeon = isRecord(root.dungeon) ? root.dungeon : CONFIG.dungeon;
  const minimumFloor = clampInteger(dungeon?.minFloor, 1, 1_000_000, 1);
  const maximumFloor = clampInteger(
    dungeon?.maxFloor,
    minimumFloor,
    1_000_000,
    Math.max(minimumFloor, finiteInteger(CONFIG.dungeon?.maxFloor, minimumFloor)),
  );
  const rawOffsets = Array.isArray(source.floorOffsetRange)
    ? source.floorOffsetRange
    : [source.minimumFloorOffset ?? source.minFloorOffset, source.maximumFloorOffset ?? source.maxFloorOffset];
  const firstOffset = clampInteger(rawOffsets[0], -maximumFloor, 0, 0);
  const secondOffset = clampInteger(rawOffsets[1], -maximumFloor, 0, 0);
  const materials = isRecord(source.materials) ? source.materials : {};
  return {
    minimumFloor,
    maximumFloor,
    floorOffsetRange: [Math.min(firstOffset, secondOffset), Math.max(firstOffset, secondOffset)],
    excludeBossFloors: source.excludeBossFloors !== false,
    enemyStatMultiplier: clampNumber(source.enemyStatMultiplier, 0.01, 10, 1),
    experienceMultiplier: clampNumber(source.experienceMultiplier, 0, 10, 1),
    goldMultiplier: clampNumber(source.goldMultiplier, 0, 10, 1),
    lootChancePerEnemy: clampNumber(
      source.lootChancePerEnemy ?? source.equipmentDropChancePerEnemy,
      0,
      1,
      0,
    ),
    lootFloorOffset: clampInteger(
      source.lootFloorOffset ?? source.lootQualityFloorOffset,
      -maximumFloor,
      0,
      0,
    ),
    materialsEnabled: source.materialsEnabled === true || materials.enabled === true,
    materialDropChancePerEnemy: clampNumber(
      source.materialDropChancePerEnemy ?? materials.dropChancePerEnemy,
      0,
      1,
      0,
    ),
    materialId: safeString(source.materialId ?? materials.id, "wild_essence", 60),
  };
}

function scaleOutdoorEnemy(enemy, tuning) {
  const source = isRecord(enemy) ? enemy : {};
  const sourceStats = isRecord(source.stats) ? source.stats : {};
  const stats = { ...sourceStats };
  for (const key of OUTDOOR_STAT_KEYS) {
    const minimum = key === "defense" ? 0 : 1;
    stats[key] = Math.max(minimum, Math.round(
      clampNumber(sourceStats[key], minimum, 1_000_000_000, minimum)
        * tuning.enemyStatMultiplier,
    ));
  }
  stats.hp = stats.maxHp;
  stats.health = stats.maxHp;
  stats.armor = stats.defense;
  const sourceRewards = isRecord(source.rewards) ? source.rewards : {};
  const experience = scaleReward(sourceRewards.experience, tuning.experienceMultiplier);
  const gold = scaleReward(sourceRewards.gold, tuning.goldMultiplier);
  return {
    ...source,
    isBoss: false,
    stats,
    rewards: { experience, gold },
    experienceReward: experience,
    rewardExperience: experience,
    rewardXp: experience,
    goldReward: gold,
    rewardGold: gold,
  };
}

function sumEnemyRewards(enemies) {
  return enemies.reduce((total, enemy) => ({
    experience: safeAdd(total.experience, enemy?.rewards?.experience),
    gold: safeAdd(total.gold, enemy?.rewards?.gold),
  }), { experience: 0, gold: 0 });
}

function readVictoryRewards(result, wave) {
  const source = isRecord(result) ? result : {};
  const rewards = isRecord(source.rewards) ? source.rewards : {};
  const fallback = isRecord(wave?.rewards) ? wave.rewards : {};
  return {
    experience: clampInteger(
      rewards.experience ?? rewards.xp ?? source.experience,
      0,
      MAX_REWARD,
      clampInteger(fallback.experience, 0, MAX_REWARD, 0),
    ),
    gold: clampInteger(
      rewards.gold ?? source.gold,
      0,
      MAX_REWARD,
      clampInteger(fallback.gold, 0, MAX_REWARD, 0),
    ),
  };
}

function isVictory(result) {
  const source = isRecord(result) ? result : {};
  return source.victory === true
    || source.won === true
    || ["victory", "win", "won"].includes(source.outcome)
    || ["player", "hero"].includes(source.winner);
}

function readHighestUnlockedFloor(source, inputConfig) {
  const root = getCharacterContext(source);
  const progress = isRecord(root.progress) ? root.progress : root;
  const dungeon = isRecord(inputConfig?.dungeon) ? inputConfig.dungeon : CONFIG.dungeon;
  const minimum = clampInteger(dungeon?.minFloor, 1, 1_000_000, 1);
  const maximum = clampInteger(dungeon?.maxFloor, minimum, 1_000_000, minimum);
  const configured = clampInteger(
    progress.highestUnlockedFloor
      ?? progress.unlockedFloor
      ?? progress.maxUnlockedFloor
      ?? root.highestUnlockedFloor,
    minimum,
    maximum,
    minimum,
  );
  const cleared = Array.isArray(progress.clearedFloors)
    ? progress.clearedFloors
      .map((floor) => finiteInteger(floor, 0))
      .filter((floor) => floor >= minimum && floor <= maximum)
    : [];
  return Math.max(
    configured,
    cleared.length > 0 ? Math.min(maximum, Math.max(...cleared) + 1) : minimum,
  );
}

function hasHeroContext(source) {
  return isRecord(source)
    && isRecord(source.hero);
}

function getCharacterContext(source) {
  if (Number.isFinite(source)) return { highestUnlockedFloor: source };
  const root = isRecord(source) ? source : {};
  if (isRecord(root.hero) || isRecord(root.progress)) return root;
  if (isRecord(root.activeCharacter)) return root.activeCharacter;
  if (Array.isArray(root.characters)) {
    const selected = root.characters.find((character) =>
      character?.id === root.activeCharacterId,
    );
    if (isRecord(selected)) return selected;
    if (isRecord(root.characters[0])) return root.characters[0];
  }
  return root;
}

function isBossFloor(floor, inputConfig = CONFIG) {
  if (floor?.boss === true || floor?.isBoss === true) return true;
  const interval = clampInteger(
    inputConfig?.dungeon?.bossEveryFloors ?? CONFIG.dungeon?.bossEveryFloors,
    1,
    1_000_000,
    5,
  );
  return Number.isFinite(floor?.id) && floor.id % interval === 0;
}

function createEmptyOutdoorWave(seed, waveIndex, floorId) {
  return {
    id: `outdoor-empty-${waveIndex}`,
    mode: "outdoor",
    waveIndex,
    floorId,
    floor: floorId,
    name: "寂静荒野",
    seed,
    isBoss: false,
    enemies: [],
    rewards: { experience: 0, gold: 0, lootCount: 0 },
    experienceReward: 0,
    goldReward: 0,
  };
}

function createEmptyRewards() {
  return { experience: 0, gold: 0, items: [], materials: {} };
}

function sanitizeRewards(candidate) {
  const source = isRecord(candidate) ? candidate : {};
  const rawItems = Array.isArray(source.items)
    ? source.items
    : Array.isArray(source.loot)
      ? source.loot
      : [];
  const items = rawItems.map((item) => sanitizeItem(item)).filter(Boolean);
  const materials = {};
  if (isRecord(source.materials)) {
    for (const [id, amount] of Object.entries(source.materials)) {
      const cleanId = safeString(id, "", 60);
      const cleanAmount = clampInteger(amount, 0, MAX_REWARD, 0);
      if (cleanId && cleanAmount > 0) materials[cleanId] = cleanAmount;
    }
  }
  return {
    experience: clampInteger(source.experience ?? source.xp, 0, MAX_REWARD, 0),
    gold: clampInteger(source.gold, 0, MAX_REWARD, 0),
    items,
    materials,
  };
}

function mergeRewards(left, right) {
  const first = sanitizeRewards(left);
  const second = sanitizeRewards(right);
  const materials = { ...first.materials };
  for (const [id, amount] of Object.entries(second.materials)) {
    materials[id] = safeAdd(materials[id], amount);
  }
  return {
    experience: safeAdd(first.experience, second.experience),
    gold: safeAdd(first.gold, second.gold),
    items: [...first.items, ...second.items],
    materials,
  };
}

function cloneRewards(rewards) {
  const clean = sanitizeRewards(rewards);
  return {
    ...clean,
    items: clean.items.map((item) => ({
      ...item,
      baseStats: { ...item.baseStats },
      affixes: item.affixes.map((affix) => ({ ...affix })),
      effect: item.effect ? { ...item.effect } : null,
    })),
    materials: { ...clean.materials },
  };
}

function scaleReward(value, multiplier) {
  return clampInteger(
    Math.round(clampNumber(value, 0, MAX_REWARD, 0) * multiplier),
    0,
    MAX_REWARD,
    0,
  );
}

function range(first, last) {
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => first + index);
}

function normalizeSeed(seed) {
  if (typeof seed === "number" && Number.isFinite(seed)) return String(seed);
  if (typeof seed === "string" && seed.length > 0) return seed.slice(0, 120);
  return String(seed ?? "0").slice(0, 120);
}

function normalizeNullableSeed(seed) {
  return seed === null || seed === undefined || seed === "" ? null : normalizeSeed(seed);
}

function safeAdd(left, right) {
  const first = clampInteger(left, 0, MAX_REWARD, 0);
  const second = clampInteger(right, 0, MAX_REWARD, 0);
  return Math.min(MAX_REWARD, first + second);
}

function safeString(value, fallback, maxLength) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : fallback;
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

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
