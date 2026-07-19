import { CONFIG } from "../js/config.js";
import {
  FLOORS,
  createEnemyWave,
  getAvailableFloors,
  getFloor,
  getFloorCap,
  getFloorStatus,
  isFloorUnlocked,
} from "../js/dungeon.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

const expectedCap = (prestigeCount) => Math.min(
  CONFIG.dungeon.maxFloor,
  CONFIG.prestige.initialFloorCap + prestigeCount * CONFIG.prestige.floorsPerCount,
);

const assertFiniteWave = (wave) => {
  assert(Number.isFinite(wave.rewards.experience) && wave.rewards.experience >= 0);
  assert(Number.isFinite(wave.rewards.gold) && wave.rewards.gold >= 0);
  for (const enemy of wave.enemies) {
    for (const key of ["maxHp", "hp", "attack", "defense", "speed", "critChance", "critDamage"]) {
      assert(Number.isFinite(enemy.stats[key]), `${enemy.id}.${key} must be finite`);
    }
    assert(enemy.stats.maxHp >= 1 && enemy.stats.hp === enemy.stats.maxHp);
    assert(enemy.stats.attack >= 1 && enemy.stats.defense >= 0 && enemy.stats.speed >= 1);
    assert(Number.isFinite(enemy.rewards.experience) && enemy.rewards.experience >= 0);
    assert(Number.isFinite(enemy.rewards.gold) && enemy.rewards.gold >= 0);
  }
};

export const tests = [
  {
    name: "floor catalog is contiguous through 100 with a boss every five floors",
    run() {
      assert(CONFIG.dungeon.maxFloor === 100, "second batch should expose 100 floors");
      assert(FLOORS.length === CONFIG.dungeon.maxFloor);
      assert(new Set(FLOORS.map((floor) => floor.id)).size === FLOORS.length);
      for (let id = 1; id <= CONFIG.dungeon.maxFloor; id += 1) {
        const floor = getFloor(id);
        assert(floor?.id === id, `missing floor ${id}`);
        assert(floor.boss === (id % CONFIG.dungeon.bossEveryFloors === 0), `incorrect boss flag on floor ${id}`);
      }
      assert(getFloor(0) === null && getFloor(101) === null);
    },
  },
  {
    name: "prestige cap limits selection without erasing deeper saved progression",
    run() {
      const save = {
        hero: { prestigeCount: 0 },
        progress: {
          highestUnlockedFloor: 100,
          clearedFloors: Array.from({ length: 99 }, (_, index) => index + 1),
        },
      };
      const before = JSON.stringify(save);
      assert(getFloorCap(save) === expectedCap(0));
      assert(getAvailableFloors(save).at(-1)?.id === expectedCap(0));
      assert(isFloorUnlocked(save, expectedCap(0)));
      assert(!isFloorUnlocked(save, expectedCap(0) + 1));
      const cappedStatus = getFloorStatus(save, expectedCap(0) + 1);
      assert(cappedStatus?.cleared === true);
      assert(cappedStatus?.unlocked === false && cappedStatus?.lockedByPrestige === true);
      assert(save.progress.highestUnlockedFloor === 100);
      assert(JSON.stringify(save) === before, "cap reads must not mutate deeper progress");
    },
  },
  {
    name: "floor cap grows with canonical and legacy prestige counts and clamps globally",
    run() {
      assert(getFloorCap() === expectedCap(0));
      assert(getFloorCap({ hero: { prestigeCount: 1 } }) === expectedCap(1));
      assert(getFloorCap({ hero: { prestige: { count: 2 } } }) === expectedCap(2));
      assert(getFloorCap({ prestigeCount: 3 }) === expectedCap(3));
      assert(getFloorCap({ hero: { prestigeCount: Number.MAX_SAFE_INTEGER } }) === CONFIG.dungeon.maxFloor);
      assert(getFloorCap({ hero: { prestigeCount: -5 } }) === expectedCap(0));
    },
  },
  {
    name: "floor 100 boss wave is finite, seeded, and smoothly scaled from floor 95",
    run() {
      const first = createEnemyWave(100, "floor-100-fixed-seed");
      const repeated = createEnemyWave(100, "floor-100-fixed-seed");
      assert(JSON.stringify(first) === JSON.stringify(repeated), "deep waves must be reproducible");
      assert(first.isBoss && first.enemies.length === 1);
      assert(first.enemies[0].isBoss === true);
      assertFiniteWave(first);

      const previousBoss = createEnemyWave(95, "floor-100-fixed-seed");
      assert(previousBoss.isBoss && previousBoss.enemies.length === 1);
      assertFiniteWave(previousBoss);
      assert(getFloor(100).enemyScale >= getFloor(95).enemyScale, "configured deep scaling must be monotonic");
      for (const key of ["maxHp", "attack", "defense"]) {
        const previous = previousBoss.enemies[0].stats[key];
        const current = first.enemies[0].stats[key];
        assert(current >= previous * 0.75, `floor 100 ${key} should stay within the variance band`);
        assert(current <= previous * 1.5, `floor 100 ${key} growth should stay smooth`);
      }
    },
  },
  {
    name: "deep normal waves retain bounded group size and deterministic rewards",
    run() {
      const first = createEnemyWave(99, "floor-99-fixed-seed");
      const repeated = createEnemyWave(99, "floor-99-fixed-seed");
      assert(JSON.stringify(first) === JSON.stringify(repeated));
      assert(!first.isBoss);
      const [minimum, maximum] = getFloor(99).enemyCount;
      assert(first.enemies.length >= minimum && first.enemies.length <= maximum);
      assert(new Set(first.enemies.map((enemy) => enemy.id)).size === first.enemies.length);
      assertFiniteWave(first);
      assert(first.rewards.experience === first.enemies.reduce((sum, enemy) => sum + enemy.rewards.experience, 0));
      assert(first.rewards.gold === first.enemies.reduce((sum, enemy) => sum + enemy.rewards.gold, 0));
    },
  },
];
