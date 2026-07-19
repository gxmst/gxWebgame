import {
  applyDefeat,
  applyPrestige,
  applyVictory,
  clearProgress,
  createDefaultSave,
  getDefeatPenalty,
  loadSave,
  saveSave,
  sanitizeSave,
  selectStartingClass,
} from "../js/save.js";
import { CONFIG } from "../js/config.js";
import { createEnemyWave, getAvailableFloors, isFloorUnlocked } from "../js/dungeon.js";
import { generateLoot } from "../js/loot.js";
import { getExperienceRequirement } from "../js/hero.js";
import { getSellValue, resolveLootDelivery } from "../js/game.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(String(key), String(value));
  }

  removeItem(key) {
    this.values.delete(String(key));
  }
}

export const tests = [
  {
    name: "v1 saves migrate to a chosen warrior with skill and economy defaults",
    run() {
      const legacy = {
        version: 1,
        hero: {
          id: "legacy-hero",
          name: "旧档战士",
          classId: "warrior",
          level: 6,
          experience: 12,
          baseStats: { strength: 18, agility: 7, intelligence: 2, vitality: 14 },
          equipment: {},
          inventory: [],
          skills: ["basic_attack", "heavy_strike", "whirlwind", "block"],
          gold: 321,
        },
        progress: { highestUnlockedFloor: 5, clearedFloors: [1, 2, 3, 4] },
      };
      const migrated = sanitizeSave(legacy);
      assert(migrated.version === CONFIG.save.version);
      assert(migrated.hero.classId === "warrior" && migrated.hero.classChosen === true);
      assert(migrated.hero.gold === 321 && migrated.hero.level === 6);
      assert(migrated.hero.unspentSkillPoints > 0);
      assert(migrated.economy?.shop && migrated.economy.pendingReforge === null);
      assert(migrated.progress.highestUnlockedFloor === 5);
    },
  },
  {
    name: "class selection resets a run and prestige preserves equipment and economy",
    run() {
      const source = createDefaultSave();
      source.hero.gold = 900;
      source.progress.highestUnlockedFloor = 7;
      const mageSave = selectStartingClass(source, "mage");
      assert(mageSave.hero.classId === "mage" && mageSave.hero.classChosen);
      assert(mageSave.hero.gold === 0 && mageSave.progress.highestUnlockedFloor === 1);

      const item = generateLoot(3, "prestige-save-item", mageSave.hero);
      mageSave.hero.inventory = [item];
      mageSave.hero.gold = 777;
      mageSave.hero.level = CONFIG.hero.maxLevel;
      mageSave.progress.highestUnlockedFloor = 12;
      const economyBefore = JSON.stringify(mageSave.economy);
      const next = applyPrestige(mageSave);
      assert(next.hero.level === 1 && next.hero.prestigeCount === 1);
      assert(next.hero.gold === 777 && next.hero.inventory[0].id === item.id);
      assert(next.progress.highestUnlockedFloor === 12);
      assert(JSON.stringify(next.economy) === economyBefore);

      const cleared = clearProgress(next);
      assert(cleared.hero.classChosen === false && cleared.hero.prestigeCount === 0);
      assert(cleared.economy.pendingReforge === null && !cleared.economy.shop.initialized);
    },
  },
  {
    name: "save round-trips through localStorage-shaped storage and strips unknown fields",
    run() {
      const storage = new MemoryStorage();
      const save = createDefaultSave();
      save.hero.name = "Round Trip Hero";
      save.hero.gold = 1234;
      save.hero.experience = 17;
      save.progress.highestUnlockedFloor = 2;
      save.progress.clearedFloors = [1];
      save.progress.totalVictories = 3;
      save.settings = { autoAllocate: false, battleSpeed: 3 };
      save.unexpected = "discard me";

      const expected = sanitizeSave(save);
      assert(saveSave(save, storage), "saveSave should report a successful write");
      const loaded = loadSave(storage);
      assert(JSON.stringify(loaded) === JSON.stringify(expected), "stored save should survive a clean round trip");
      assert(!Object.hasOwn(loaded, "unexpected"), "unknown top-level fields must not persist");
      assert(storage.getItem(CONFIG.save.key), "the configured save key should be used");

      storage.setItem(CONFIG.save.key, "{not valid json");
      const recovered = loadSave(storage);
      assert(recovered.hero.id === createDefaultSave().hero.id, "corrupt JSON should recover to defaults");

      const failingStorage = {
        getItem() { throw new Error("blocked"); },
        setItem() { throw new Error("blocked"); },
      };
      assert(!saveSave(save, failingStorage), "blocked storage should return false");
      assert(loadSave(failingStorage).version === CONFIG.save.version, "blocked reads should not throw");
    },
  },
  {
    name: "victory applies rewards, stores loot, and unlocks the next floor immutably",
    run() {
      const save = createDefaultSave();
      const before = JSON.stringify(save);
      const loot = generateLoot(1, "victory-loot", save.hero);
      const next = applyVictory(save, {
        floorId: 1,
        rewards: { experience: 10, gold: 77 },
        loot,
      });

      assert(next !== save, "victory should return a new save object");
      assert(next.hero.experience === 10, "experience reward should be applied");
      assert(next.hero.gold === 77, "gold reward should be applied");
      assert(next.hero.inventory.some((item) => item.id === loot.id), "loot should enter the inventory");
      assert(next.progress.clearedFloors.includes(1), "the cleared floor should be recorded");
      assert(next.progress.highestUnlockedFloor === Math.min(CONFIG.dungeon.maxFloor, 2));
      assert(next.progress.totalVictories === 1);
      assert(JSON.stringify(save) === before, "applyVictory must not mutate the source save");

      const repeated = applyVictory(next, { floorId: 1, experience: 1, gold: 1 });
      assert(repeated.progress.clearedFloors.filter((floor) => floor === 1).length === 1, "cleared floors should stay unique");
    },
  },
  {
    name: "defeat penalty reduces current resources but preserves level and progression",
    run() {
      const save = createDefaultSave();
      save.hero.level = 4;
      save.hero.experience = Math.floor(getExperienceRequirement(4) / 2);
      save.hero.gold = 1000;
      save.progress.highestUnlockedFloor = 3;
      save.progress.clearedFloors = [1, 2];
      const beforeLevel = save.hero.level;
      const beforeExperience = save.hero.experience;
      const beforeGold = save.hero.gold;
      const penalty = getDefeatPenalty(save);
      const next = applyDefeat(save, { outcome: "defeat", reason: "player-defeated" });

      assert(next.hero.level === beforeLevel, "death must never de-level the hero");
      assert(next.hero.experience === Math.max(0, beforeExperience - penalty.experience));
      assert(next.hero.gold === Math.max(0, beforeGold - penalty.gold));
      assert(next.progress.highestUnlockedFloor === 3, "death must not lock cleared floors");
      assert(next.progress.clearedFloors.join(",") === "1,2");
      assert(next.progress.totalDefeats === 1);
      assert(save.hero.level === beforeLevel && save.hero.gold === beforeGold, "applyDefeat must not mutate the source save");
    },
  },
  {
    name: "pending battles survive a save round trip and interrupted runs use retreat rates",
    run() {
      const storage = new MemoryStorage();
      const save = createDefaultSave();
      save.hero.experience = 200;
      save.hero.gold = 500;
      save.pendingBattle = { floorId: 3, seed: "pending-seed", startedAt: 123 };
      saveSave(save, storage);
      const loaded = loadSave(storage);
      assert(loaded.pendingBattle?.floorId === 3, "active battle marker should survive persistence");
      const penalty = getDefeatPenalty(loaded, true);
      const next = applyDefeat({ ...loaded, pendingBattle: null }, {
        retreat: true,
        reason: "retreat",
        floorId: 3,
      });
      assert(next.hero.experience === loaded.hero.experience - penalty.experience);
      assert(next.hero.gold === loaded.hero.gold - penalty.gold);
      assert(next.pendingBattle === null, "settled interruption must clear the marker");
    },
  },
  {
    name: "full inventory salvages only the new drop without deleting old equipment",
    run() {
      const save = createDefaultSave();
      save.hero.inventory = Array.from({ length: CONFIG.save.maxInventoryItems }, (_, index) =>
        generateLoot(1, `full-${index}`, save.hero));
      const beforeIds = save.hero.inventory.map((item) => item.id);
      const loot = generateLoot(5, "overflow-drop", save.hero);
      const delivery = resolveLootDelivery(save, loot);
      assert(delivery.storedLoot === null, "a full inventory should not pretend to store another item");
      assert(delivery.salvagedItem.id === loot.id);
      assert(delivery.salvageGold === getSellValue(loot));
      assert(delivery.save.hero.inventory.map((item) => item.id).join(",") === beforeIds.join(","));
      assert(delivery.save.hero.gold === delivery.salvageGold);
      assert(save.hero.gold === 0, "overflow handling must not mutate the source save");
    },
  },
  {
    name: "loot generation is deterministic, valid, and independent of hero mutation",
    run() {
      const hero = createDefaultSave().hero;
      const before = JSON.stringify(hero);
      const first = generateLoot(3, "loot-seed-17", hero);
      const second = generateLoot(3, "loot-seed-17", hero);
      const different = generateLoot(3, "loot-seed-18", hero);

      assert(JSON.stringify(first) === JSON.stringify(second), "same floor and seed must produce the same item");
      assert(first.id !== different.id, "different seeds should produce independent item ids");
      assert(CONFIG.equipmentSlots[first.slot], "loot slot must be an equipment slot");
      assert(CONFIG.rarities[first.rarity], "loot rarity must be configured");
      assert(first.affixes.length >= CONFIG.rarities[first.rarity].minAffixes);
      assert(first.affixes.length <= CONFIG.rarities[first.rarity].maxAffixes);
      assert(Number.isFinite(first.power) && first.power >= 0, "loot power must be finite");
      assert(JSON.stringify(hero) === before, "loot generation must not mutate the hero");
    },
  },
  {
    name: "enemy waves and floor availability are seeded and progression-aware",
    run() {
      const first = createEnemyWave(2, "wave-seed-5");
      const second = createEnemyWave(2, "wave-seed-5");
      assert(JSON.stringify(first) === JSON.stringify(second), "same wave seed must reproduce enemies and rewards");
      const floor = CONFIG.floors.find((entry) => entry.id === 2);
      assert(first.enemies.length >= floor.enemyCount[0] && first.enemies.length <= floor.enemyCount[1]);
      assert(new Set(first.enemies.map((enemy) => enemy.id)).size === first.enemies.length, "enemy ids must be unique");
      assert(first.rewards.experience === first.enemies.reduce((sum, enemy) => sum + enemy.rewards.experience, 0));
      assert(first.rewards.gold === first.enemies.reduce((sum, enemy) => sum + enemy.rewards.gold, 0));

      const boss = createEnemyWave(5, "boss-seed");
      assert(boss.isBoss && boss.enemies.length === 1, "the fifth floor should be a single boss wave");

      const save = createDefaultSave();
      save.progress.highestUnlockedFloor = 2;
      save.progress.clearedFloors = [1];
      const available = getAvailableFloors(save).map((entry) => entry.id);
      assert(available.join(",") === "1,2");
      assert(isFloorUnlocked(save, 2) && !isFloorUnlocked(save, 3));
    },
  },
];
