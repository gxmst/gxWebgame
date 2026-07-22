import {
  applyBattleResult,
  applyDefeat,
  applyPrestige,
  applyVictory,
  clearProgress,
  createCharacter,
  createDefaultSave,
  deleteCharacter,
  getDefeatPenalty,
  getActiveCharacter,
  loadSave,
  projectActiveCharacter,
  saveSave,
  setPendingBattle,
  sanitizeSave,
  selectStartingClass,
  switchCharacter,
  updateActiveCharacter,
} from "../js/save.js";
import { CONFIG } from "../js/config.js";
import { createEnemyWave, getAvailableFloors, isFloorUnlocked } from "../js/dungeon.js";
import { generateLoot } from "../js/loot.js";
import { getExperienceRequirement } from "../js/hero.js";
import {
  DungeonGame,
  getSellValue,
  resolveImportedPendingBattle,
  resolveLootBatch,
  resolveLootDelivery,
} from "../js/game.js";

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
      assert(migrated.characters.length === 1);
      assert(migrated.activeCharacterId === migrated.characters[0].id);
      assert(migrated.hero === migrated.characters[0].hero, "top-level hero must project the active record");
    },
  },
  {
    name: "v2 single-character saves migrate without losing equipment prestige economy or progress",
    run() {
      const legacyWeapon = {
        id: "legacy-v2-weapon",
        name: "旧档长剑",
        emoji: "⚔️",
        slot: "weapon",
        rarity: "rare",
        level: 12,
        baseStats: { attack: 27 },
        affixes: [],
        effect: null,
        power: 27,
        seed: "legacy-v2-weapon-seed",
      };
      const legacyPackItem = {
        ...legacyWeapon,
        id: "legacy-v2-pack",
        name: "旧档备用剑",
        seed: "legacy-v2-pack-seed",
      };
      const legacy = {
        version: 2,
        hero: {
          id: "legacy-v2-hero",
          name: "二批老角色",
          classId: "warrior",
          classChosen: true,
          level: 19,
          experience: 234,
          totalExperience: 8_765,
          prestigeCount: 3,
          baseStats: { strength: 42, agility: 14, intelligence: 2, vitality: 31 },
          equipment: { weapon: legacyWeapon },
          inventory: [legacyPackItem],
          skills: ["basic_attack", "heavy_strike", "whirlwind", "block"],
          gold: 54_321,
        },
        progress: {
          highestUnlockedFloor: 28,
          clearedFloors: Array.from({ length: 27 }, (_, index) => index + 1),
          totalVictories: 90,
          totalDefeats: 7,
        },
        settings: { autoAllocate: false, battleSpeed: 3 },
        economy: {
          reforgeCounter: 6,
          pendingReforge: null,
          shop: {
            initialized: true,
            rotation: 4,
            lastRefreshVictory: 88,
            stock: [],
          },
        },
        pendingBattle: { floorId: 28, seed: "legacy-v2-battle", startedAt: 456 },
      };

      const migrated = sanitizeSave(legacy);
      const character = migrated.characters[0];
      assert(migrated.version === CONFIG.save.version && migrated.characters.length === 1);
      assert(character.name === "二批老角色" && character.hero.level === 19);
      assert(character.hero.gold === 54_321 && character.hero.prestigeCount === 3);
      assert(character.hero.equipment.weapon?.id === legacyWeapon.id);
      assert(character.hero.inventory[0]?.id === legacyPackItem.id);
      assert(character.progress.highestUnlockedFloor === 28);
      assert(character.progress.clearedFloors.length === 27);
      assert(character.progress.totalVictories === 90 && character.progress.totalDefeats === 7);
      assert(character.economy.reforgeCounter === 6 && character.economy.shop.rotation === 4);
      assert(character.outdoor?.status === "idle");
      assert(character.pendingBattle?.characterId === character.id);
      assert(character.pendingBattle.floorId === 28 && character.pendingBattle.seed === "legacy-v2-battle");

      const storage = new MemoryStorage();
      assert(saveSave(migrated, storage));
      const stored = JSON.parse(storage.getItem(CONFIG.save.key));
      assert(Array.isArray(stored.characters) && stored.activeCharacterId === character.id);
      assert(!Object.hasOwn(stored, "hero") && !Object.hasOwn(stored, "economy"), "disk schema must be canonical");
      const loaded = loadSave(storage);
      assert(loaded.hero.equipment.weapon?.id === legacyWeapon.id);
      assert(loaded.hero.gold === 54_321 && loaded.progress.highestUnlockedFloor === 28);
    },
  },
  {
    name: "character creation reuses the initial placeholder and enforces the configured limit",
    run() {
      const initial = createDefaultSave();
      assert(initial.characters.length === 1 && initial.hero.classChosen === false);
      let created = createCharacter(initial, { classId: "warrior", name: "守门人" });
      assert(created.ok, created.reason);
      assert(created.save.characters.length === 1, "first creation should replace the placeholder");
      assert(created.save.hero.classChosen && created.save.hero.name === "守门人");

      let save = created.save;
      for (let index = 1; index < CONFIG.save.maxCharacters; index += 1) {
        created = createCharacter(save, { classId: "mage", name: `法师${index}` });
        assert(created.ok, created.reason);
        save = created.save;
      }
      assert(save.characters.length === CONFIG.save.maxCharacters);
      const blocked = createCharacter(save, { classId: "warrior", name: "超额角色" });
      assert(!blocked.ok && blocked.reason === "character-limit");
      assert(blocked.save.characters.length === CONFIG.save.maxCharacters);
    },
  },
  {
    name: "switching deleting and battle ownership keep character state isolated",
    run() {
      let result = createCharacter(createDefaultSave(), { classId: "warrior", name: "甲" });
      let save = updateActiveCharacter(result.save, (character) => ({
        ...character,
        hero: { ...character.hero, gold: 111 },
        progress: { ...character.progress, highestUnlockedFloor: 6 },
      }));
      const firstId = save.activeCharacterId;

      result = createCharacter(save, { classId: "mage", name: "乙" });
      assert(result.ok && result.save.characters.length === 2);
      save = updateActiveCharacter(result.save, (character) => ({
        ...character,
        hero: { ...character.hero, gold: 222 },
        progress: { ...character.progress, highestUnlockedFloor: 3 },
      }));
      const secondId = save.activeCharacterId;
      save = setPendingBattle(save, { floorId: 3, seed: "second-battle", startedAt: 99 });
      assert(save.pendingBattle?.characterId === secondId);

      const staleSpread = { ...save, activeCharacterId: firstId };
      const safelySwitched = sanitizeSave(staleSpread);
      assert(safelySwitched.hero.gold === 111, "stale top-level projection must not overwrite a new active id");

      const switched = switchCharacter(save, firstId);
      assert(switched.ok && switched.save.hero.gold === 111);
      assert(switched.save.progress.highestUnlockedFloor === 6);
      assert(switched.save.pendingBattle === null, "another character's battle marker must stay hidden");
      assert(switched.save.characters.find((entry) => entry.id === secondId).pendingBattle?.characterId === secondId);

      const projected = projectActiveCharacter({
        ...switched.save,
        economy: { ...switched.save.economy, reforgeCounter: 9 },
      });
      assert(projected.economy.reforgeCounter === 9);
      assert(getActiveCharacter(projected).economy.reforgeCounter === 9);

      const beforeWrongOwner = JSON.stringify(projected);
      const rejected = applyBattleResult(projected, {
        characterId: secondId,
        outcome: "victory",
        experience: 50,
        gold: 50,
        floorId: 1,
      });
      assert(JSON.stringify(rejected) === beforeWrongOwner, "stale combat must not settle onto the active character");

      const selectedSecond = switchCharacter(projected, secondId);
      const deleted = deleteCharacter(selectedSecond.save, secondId);
      assert(deleted.ok && deleted.save.activeCharacterId === firstId);
      assert(deleted.save.characters.length === 1 && deleted.save.hero.gold === 111);
      const refused = deleteCharacter(deleted.save, firstId);
      assert(!refused.ok && refused.reason === "last-character");
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
      save.hero.skillLevels.heavy_strike = 5;
      save.hero.skillBranches = { heavy_strike: "heavy_strike_crusher" };
      save.progress.highestUnlockedFloor = 2;
      save.progress.clearedFloors = [1];
      save.progress.totalVictories = 3;
      save.settings = { autoAllocate: false, battleSpeed: 3 };
      save.settings.language = "en-US";
      save.unexpected = "discard me";

      const expected = sanitizeSave(save);
      assert(saveSave(save, storage), "saveSave should report a successful write");
      const loaded = loadSave(storage);
      assert(JSON.stringify(loaded) === JSON.stringify(expected), "stored save should survive a clean round trip");
      assert(loaded.hero.skillBranches.heavy_strike === "heavy_strike_crusher",
        "skill branch choice must survive storage");
      assert(loaded.settings.language === "en-US", "language preference must survive storage");
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
    name: "multi-item drops reserve inventory slots and salvage only overflow",
    run() {
      const save = createDefaultSave();
      save.hero.inventory = Array.from({ length: CONFIG.save.maxInventoryItems - 1 }, (_, index) =>
        generateLoot(1, `nearly-full-${index}`, save.hero));
      const first = generateLoot(5, "batch-first", save.hero);
      const second = generateLoot(5, "batch-second", save.hero);
      const result = resolveLootBatch(save, [first, second]);
      assert(result.storedItems.length === 1, "one remaining slot should store exactly one drop");
      assert(result.salvagedItems.length === 1, "the second drop should be salvaged");
      assert(result.salvageGold === getSellValue(second));
      assert(result.save.hero.inventory.length === CONFIG.save.maxInventoryItems - 1,
        "delivery must not mutate inventory before applyVictory");
      assert(result.save.hero.gold === getSellValue(second));
    },
  },
  {
    name: "imported pending battles settle immediately as retreat",
    run() {
      const save = createDefaultSave();
      save.hero.gold = 100;
      save.pendingBattle = {
        floorId: 4,
        characterId: save.activeCharacterId,
        seed: "import-pending",
        startedAt: 1,
      };
      const result = resolveImportedPendingBattle(save);
      assert(result.interrupted?.floorId === 4);
      assert(result.save.pendingBattle === null);
      assert(result.save.progress.totalDefeats === 1);
      assert(result.save.hero.gold < 100, "retreat penalty should apply during import");
      assert(save.pendingBattle?.floorId === 4, "import settlement must not mutate source save");
    },
  },
  {
    name: "locked equipment cannot be sold through the game handler",
    run() {
      const save = createDefaultSave();
      const item = generateLoot(2, "locked-sale", save.hero);
      save.hero.inventory = [{ ...item, locked: true }];
      const game = Object.create(DungeonGame.prototype);
      game.save = save;
      game.battle = null;
      game.ui = { showToast() {} };
      game.persist = () => { throw new Error("locked item should return before persist"); };
      game.render = () => {};
      const before = JSON.stringify(save);
      game.sellItem(item.id);
      assert(JSON.stringify(save) === before, "locked item must remain untouched");
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
