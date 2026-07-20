import { CONFIG } from "../js/config.js";
import { createHeroForClass } from "../js/hero.js";
import {
  createDefaultOutdoorState,
  createOutdoorWave,
  getOutdoorFloorRange,
  pauseOutdoorRun,
  resumeOutdoorRun,
  sanitizeOutdoorState,
  selectOutdoorFloor,
  settleOutdoorWave,
  startOutdoorRun,
  stopOutdoorRun,
} from "../js/outdoor.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

const TEST_CONFIG = {
  ...CONFIG,
  outdoor: {
    floorOffsetRange: [-2, 0],
    excludeBossFloors: true,
    enemyStatMultiplier: 0.9,
    experienceMultiplier: 0.8,
    goldMultiplier: 0.75,
    lootChancePerEnemy: 1,
    lootFloorOffset: -1,
    materialsEnabled: true,
    materialDropChancePerEnemy: 1,
    materialId: "wild_essence",
  },
};

function makeProgress(highestUnlockedFloor = 18) {
  return {
    hero: { prestigeCount: CONFIG.prestige.maxCount },
    progress: { highestUnlockedFloor, clearedFloors: [] },
  };
}

export const tests = [
  {
    name: "outdoor floor selection stays near unlocked progress and avoids bosses deterministically",
    run() {
      const source = makeProgress(20);
      const before = JSON.stringify(source);
      const range = getOutdoorFloorRange(source, TEST_CONFIG);
      const first = selectOutdoorFloor(source, "outdoor-floor-seed", TEST_CONFIG);
      const repeated = selectOutdoorFloor(source, "outdoor-floor-seed", TEST_CONFIG);

      assert(range.highestUnlockedFloor === 20);
      assert(range.candidates.every((floor) => floor >= 18 && floor <= 20));
      assert(range.candidates.every((floor) => floor % CONFIG.dungeon.bossEveryFloors !== 0));
      assert(first?.id === repeated?.id, "same seed must select the same outdoor floor");
      assert(range.candidates.includes(first.id));
      assert(JSON.stringify(source) === before, "floor selection must not mutate progression");

      const bossOnlyConfig = {
        ...TEST_CONFIG,
        outdoor: { ...TEST_CONFIG.outdoor, floorOffsetRange: [0, 0] },
      };
      assert(selectOutdoorFloor(makeProgress(5), "boss-fallback", bossOnlyConfig)?.id === 4);
    },
  },
  {
    name: "outdoor waves reuse seeded dungeon groups with configured strength and reward scaling",
    run() {
      const source = makeProgress(18);
      const state = startOutdoorRun(null, "outdoor-session");
      const before = JSON.stringify({ source, state });
      const first = createOutdoorWave(source, state, TEST_CONFIG);
      const repeated = createOutdoorWave(source, state, TEST_CONFIG);

      assert(JSON.stringify(first) === JSON.stringify(repeated), "same run state must reproduce a wave");
      assert(first.mode === "outdoor" && first.waveIndex === 0 && !first.isBoss);
      assert(first.floorId >= 16 && first.floorId <= 18);
      assert(first.enemies.length >= 1);
      assert(first.enemies.every((enemy) => !enemy.isBoss));
      assert(first.enemies.every((enemy) =>
        enemy.stats.hp === enemy.stats.maxHp
          && enemy.stats.health === enemy.stats.maxHp
          && enemy.stats.armor === enemy.stats.defense));
      assert(first.rewards.experience === first.enemies.reduce(
        (sum, enemy) => sum + enemy.rewards.experience,
        0,
      ));
      assert(first.rewards.gold === first.enemies.reduce(
        (sum, enemy) => sum + enemy.rewards.gold,
        0,
      ));
      assert(JSON.stringify({ source, state }) === before, "wave generation must be pure");
    },
  },
  {
    name: "outdoor settlement is deterministic per enemy and manual stop returns all pending rewards",
    run() {
      const hero = createHeroForClass("warrior");
      const state = startOutdoorRun(createDefaultOutdoorState(), "settlement-session");
      const wave = createOutdoorWave(makeProgress(12), state, TEST_CONFIG);
      const combatResult = {
        victory: true,
        outcome: "victory",
        rewards: {
          experience: wave.rewards.experience,
          gold: wave.rewards.gold,
        },
      };
      const before = JSON.stringify({ state, wave, combatResult, hero });
      const first = settleOutdoorWave(state, wave, combatResult, hero, TEST_CONFIG);
      const repeated = settleOutdoorWave(state, wave, combatResult, hero, TEST_CONFIG);

      assert(JSON.stringify(first) === JSON.stringify(repeated), "settlement must be seeded and reproducible");
      assert(first.earned.experience === wave.rewards.experience);
      assert(first.earned.gold === wave.rewards.gold);
      assert(first.earned.items.length === wave.enemies.length, "100% chance should drop once per enemy");
      assert(new Set(first.earned.items.map((item) => item.id)).size === wave.enemies.length);
      assert(first.earned.materials.wild_essence === wave.enemies.length);
      assert(first.state.completedWaves === 1 && first.state.nextWaveIndex === 1);
      assert(first.state.status === "running");
      assert(JSON.stringify({ state, wave, combatResult, hero }) === before, "settlement must not mutate inputs");

      const stopped = stopOutdoorRun(first.state);
      assert(stopped.state.status === "idle" && stopped.state.rewards.items.length === 0);
      assert(stopped.settlement.items.length === wave.enemies.length);
      assert(stopped.summary.itemCount === wave.enemies.length);
      assert(stopped.summary.materialCount === wave.enemies.length);
    },
  },
  {
    name: "outdoor pause has no elapsed-time fields and defeats award nothing",
    run() {
      const dirty = {
        ...startOutdoorRun(null, "visibility-session"),
        startedAt: 100,
        lastActiveAt: 200,
        offlineSeconds: 999_999,
      };
      const clean = sanitizeOutdoorState(dirty);
      const paused = pauseOutdoorRun(clean);
      const resumed = resumeOutdoorRun(paused);
      assert(paused.status === "paused" && resumed.status === "running");
      for (const key of ["startedAt", "lastActiveAt", "offlineSeconds"]) {
        assert(!Object.hasOwn(clean, key), `${key} must never enter outdoor state`);
      }

      const wave = createOutdoorWave(makeProgress(8), resumed, TEST_CONFIG);
      const lost = settleOutdoorWave(
        resumed,
        wave,
        { victory: false, outcome: "defeat", rewards: { experience: 999, gold: 999 } },
        createHeroForClass("warrior"),
        TEST_CONFIG,
      );
      assert(lost.earned.experience === 0 && lost.earned.gold === 0);
      assert(lost.earned.items.length === 0);
      assert(lost.state.status === "idle" && lost.state.defeats === 1);
    },
  },
];
