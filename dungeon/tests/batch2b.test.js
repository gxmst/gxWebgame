import { CONFIG } from "../js/config.js";
import {
  formatMaterialAmount,
  formatMaterialChip,
  getMaterialMeta,
  getMaterialName,
  getReforgeMaterialCost,
  listOwnedMaterials,
  pickOutdoorMaterialId,
  spendMaterial,
} from "../js/materials.js";
import {
  acceptQuest,
  canAcceptQuest,
  createDefaultQuestState,
  progressCollectQuests,
  progressDungeonQuests,
  turnInQuest,
} from "../js/quests.js";
import {
  createDefaultSave,
  sanitizeSave,
  applyVictory,
} from "../js/save.js";
import {
  isRegionUnlocked,
  syncWorldProgress,
  sanitizeWorldState,
} from "../js/world.js";
import { beginReforge } from "../js/economy.js";
import { createHeroForClass } from "../js/hero.js";
import { createCharacter } from "../js/save.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

export const tests = [
  {
    name: "material display names never expose raw English ids",
    run() {
      assert(getMaterialName("wild_essence") === "荒野精华");
      assert(getMaterialName("desert_glass") === "沙晶");
      assert(getMaterialName("totally_unknown_id_xyz") === "未鉴定材料");
      assert(!formatMaterialChip("wild_essence", 3).includes("wild_essence"));
      assert(formatMaterialAmount("desert_glass", 2).includes("沙晶"));
      assert(formatMaterialAmount("desert_glass", 2).includes("×2"));
      const meta = getMaterialMeta("bone_dust");
      assert(meta.name === "骨粉" && meta.emoji);
      const rows = listOwnedMaterials({ wild_essence: 2, desert_glass: 1, bad: 0 });
      assert(rows.length === 2);
      assert(rows.every((row) => row.name && !/^[a-z_]+$/.test(row.name)));
    },
  },
  {
    name: "region-aware outdoor material pick and reforge material cost",
    run() {
      assert(pickOutdoorMaterialId("forest", CONFIG) === "wild_essence");
      assert(pickOutdoorMaterialId("desert", CONFIG) === "desert_glass");
      const cost = getReforgeMaterialCost(null, CONFIG);
      assert(cost.required === true);
      assert(cost.materialId === "wild_essence");
      assert(cost.name === "荒野精华");
      const spent = spendMaterial({ wild_essence: 1 }, "wild_essence", 1);
      assert(spent.ok && !spent.materials.wild_essence);
      const fail = spendMaterial({}, "wild_essence", 1);
      assert(fail.ok === false);
    },
  },
  {
    name: "beginReforge consumes material when enabled",
    run() {
      let save = createDefaultSave();
      const created = createCharacter(save, { classId: "warrior", name: "重铸测试" });
      assert(created.ok);
      save = created.save;
      // give a reforgeable item + gold + material
      const item = {
        id: "test-item-1",
        name: "测试剑",
        emoji: "⚔️",
        slot: "weapon",
        rarity: "common",
        level: 3,
        baseStats: { attack: 5 },
        affixes: [{ id: "atk1", stat: "attack", value: 2 }],
        effect: null,
        power: 20,
        seed: "t",
      };
      save = {
        ...save,
        hero: {
          ...save.hero,
          gold: 9999,
          inventory: [item],
        },
        materials: { wild_essence: 2 },
      };
      const result = beginReforge(save, { location: "inventory", itemId: item.id }, "reforge-seed");
      assert(result.ok === true, result.reason);
      assert(result.save.materials.wild_essence === 1);
      assert(result.materialCost?.name === "荒野精华");

      const poor = beginReforge({
        ...save,
        materials: {},
        hero: { ...save.hero, gold: 9999, inventory: [item] },
        economy: { reforgeCounter: 0, pendingReforge: null, shop: { initialized: true, rotation: 0, lastRefreshVictory: 0, stock: [] } },
      }, { location: "inventory", itemId: item.id }, "reforge-seed-2");
      assert(poor.ok === false);
      assert(poor.reason === "insufficient-material");
    },
  },
  {
    name: "desert unlocks after clearing forest boss floor 5",
    run() {
      const locked = createDefaultSave();
      assert(isRegionUnlocked(locked, "desert") === false);
      const progressed = {
        highestUnlockedFloor: 6,
        clearedFloors: [1, 2, 3, 4, 5],
      };
      const world = syncWorldProgress(locked.world, progressed, CONFIG);
      assert(world.unlockedRegions.includes("desert"));
      assert(world.worldLevel === 6);

      // legacy sanitize also unlocks
      const migrated = sanitizeWorldState(
        { unlockedRegions: ["forest"] },
        progressed,
        CONFIG,
      );
      assert(migrated.unlockedRegions.includes("desert"));
    },
  },
  {
    name: "desert region has playable nodes in config",
    run() {
      const desert = CONFIG.world.regions.desert;
      assert(Array.isArray(desert.nodes) && desert.nodes.length >= 4);
      const types = new Set(desert.nodes.map((node) => node.type));
      assert(types.has("town") && types.has("outdoor") && types.has("dungeon"));
      assert(desert.nodes.some((node) => node.id === "desert_town"));
      assert(CONFIG.quests.npcs.desert_guide);
      assert(CONFIG.quests.quests.cull_scorpions);
    },
  },
  {
    name: "forest quest chain unlocks step by step",
    run() {
      let quests = createDefaultQuestState();
      assert(canAcceptQuest("cull_wolves", quests, CONFIG).ok);
      assert(canAcceptQuest("investigate_altar", quests, CONFIG).ok === false);
      quests = acceptQuest("cull_wolves", quests, CONFIG).quests;
      // fake complete cull
      quests = {
        ...quests,
        progress: { ...quests.progress, cull_wolves: 10 },
      };
      const turned = turnInQuest("cull_wolves", quests, CONFIG);
      assert(turned.ok);
      quests = turned.quests;
      assert(turned.unlockedQuestId === "investigate_altar");
      assert(canAcceptQuest("investigate_altar", quests, CONFIG).ok === true);

      quests = acceptQuest("investigate_altar", quests, CONFIG).quests;
      quests = {
        ...quests,
        progress: { ...quests.progress, investigate_altar: 8 },
      };
      const turned2 = turnInQuest("investigate_altar", quests, CONFIG);
      assert(turned2.ok);
      quests = turned2.quests;
      assert(canAcceptQuest("seal_corruption", quests, CONFIG).ok);

      quests = acceptQuest("seal_corruption", quests, CONFIG).quests;
      const dungeon = progressDungeonQuests(quests, 5, CONFIG);
      assert(dungeon.updates[0]?.complete === true);
      quests = dungeon.quests;
      assert(turnInQuest("seal_corruption", quests, CONFIG).ok);
    },
  },
  {
    name: "collect quest progresses with materials",
    run() {
      let quests = createDefaultQuestState();
      // force unlock retrieve_glass chain mid-way by completing prereq
      quests = {
        active: ["retrieve_glass"],
        completed: ["cull_scorpions"],
        progress: { retrieve_glass: 0 },
        flags: {},
      };
      const a = progressCollectQuests(quests, "desert_glass", 2, CONFIG);
      assert(a.updates[0].current === 2);
      const b = progressCollectQuests(a.quests, "desert_glass", 1, CONFIG);
      assert(b.updates[0].complete === true);
    },
  },
  {
    name: "victory on floor 5 unlocks desert on character save",
    run() {
      let save = createDefaultSave();
      const created = createCharacter(save, { classId: "warrior", name: "荒漠旅人" });
      assert(created.ok);
      save = created.save;
      assert(isRegionUnlocked(save, "desert") === false);
      save = applyVictory(save, {
        victory: true,
        experience: 10,
        gold: 5,
        floorId: 5,
        characterId: save.activeCharacterId,
      });
      assert(save.progress.clearedFloors.includes(5));
      assert(isRegionUnlocked(save, "desert") === true);
    },
  },
  {
    name: "legacy save still migrates materials and quests without English UI leaks in catalog",
    run() {
      const legacy = {
        version: 1,
        hero: {
          name: "老档",
          classId: "warrior",
          classChosen: true,
          level: 8,
          experience: 0,
          baseStats: { strength: 14, agility: 8, intelligence: 3, vitality: 12 },
          equipment: {},
          inventory: [],
          skills: ["basic_attack"],
          gold: 80,
        },
        progress: { highestUnlockedFloor: 12, clearedFloors: [5, 10] },
      };
      const migrated = sanitizeSave(legacy);
      assert(migrated.materials && typeof migrated.materials === "object");
      assert(migrated.quests);
      assert(isRegionUnlocked(migrated, "desert") === true);
      // every catalog entry has Chinese name
      for (const entry of Object.values(CONFIG.materials.catalog)) {
        assert(entry.name && !/^[a-z0-9_]+$/.test(entry.name), `bad name ${entry.id}`);
      }
    },
  },
];
