import { CONFIG } from "../js/config.js";
import {
  createDefaultSave,
  sanitizeSave,
  applyVictory,
  createCharacter,
} from "../js/save.js";
import {
  createDefaultWorldState,
  sanitizeWorldState,
  getWorldLevel,
  isRegionUnlocked,
  isNodeUnlocked,
  getNode,
  getRegion,
  listRegions,
  enterNode,
  leaveToMap,
  syncWorldProgress,
} from "../js/world.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

export const tests = [
  {
    name: "default world unlocks only the starter forest region",
    run() {
      const world = createDefaultWorldState();
      assert(world.unlockedRegions.includes("forest"));
      assert(world.unlockedRegions.length === 1);
      assert(world.currentRegionId === "forest");
      assert(world.currentNodeId === null);
      assert(world.worldLevel === CONFIG.dungeon.minFloor);
    },
  },
  {
    name: "world level tracks highest unlocked floor",
    run() {
      assert(getWorldLevel({ progress: { highestUnlockedFloor: 12 } }) === 12);
      assert(getWorldLevel({ highestUnlockedFloor: 3 }) === 3);
      const synced = syncWorldProgress(
        createDefaultWorldState(),
        { highestUnlockedFloor: 25 },
      );
      assert(synced.worldLevel === 25);
    },
  },
  {
    name: "legacy saves without world migrate with forest unlocked",
    run() {
      const legacy = {
        version: 1,
        hero: {
          name: "老冒险者",
          classId: "warrior",
          classChosen: true,
          level: 10,
          experience: 0,
          baseStats: { strength: 20, agility: 8, intelligence: 3, vitality: 16 },
          equipment: {},
          inventory: [],
          skills: ["basic_attack"],
          gold: 100,
        },
        progress: { highestUnlockedFloor: 18, clearedFloors: [1, 5, 10, 15] },
      };
      const migrated = sanitizeSave(legacy);
      assert(migrated.world, "world field missing after migration");
      assert(migrated.world.unlockedRegions.includes("forest"));
      assert(migrated.world.worldLevel === 18);
      assert(migrated.progress.highestUnlockedFloor === 18);
      assert(migrated.hero.gold === 100);
      assert(migrated.hero.level === 10);
    },
  },
  {
    name: "new default save includes world projection on active character",
    run() {
      const save = createDefaultSave();
      assert(save.world);
      assert(save.world.unlockedRegions.includes("forest"));
      assert(isRegionUnlocked(save, "forest") === true);
      assert(isRegionUnlocked(save, "desert") === false);
      assert(isRegionUnlocked(save, "abyss") === false);
      assert(isRegionUnlocked(save, "void") === false);
    },
  },
  {
    name: "forest nodes are enterable; locked region nodes are not",
    run() {
      const save = createDefaultSave();
      assert(isNodeUnlocked(save, "forest_town") === true);
      assert(isNodeUnlocked(save, "forest_wild_path") === true);
      assert(isNodeUnlocked(save, "forest_wild_vale") === true);
      assert(isNodeUnlocked(save, "forest_dungeon") === true);
      assert(isNodeUnlocked(save, "missing_node") === false);

      const town = enterNode(save, "forest_town");
      assert(town.ok === true);
      assert(town.node.type === "town");
      assert(town.world.currentNodeId === "forest_town");

      const outdoor = enterNode(save, "forest_wild_path");
      assert(outdoor.ok === true);
      assert(outdoor.node.type === "outdoor");

      const dungeon = enterNode(save, "forest_dungeon");
      assert(dungeon.ok === true);
      assert(dungeon.node.type === "dungeon");
    },
  },
  {
    name: "leaveToMap clears current node",
    run() {
      const entered = enterNode(createDefaultSave(), "forest_town");
      const left = leaveToMap(entered.world);
      assert(left.currentNodeId === null);
      assert(left.unlockedRegions.includes("forest"));
    },
  },
  {
    name: "listRegions marks locked placeholders for batch-2 areas",
    run() {
      const regions = listRegions(createDefaultSave());
      assert(regions.length === 4);
      const forest = regions.find((region) => region.id === "forest");
      const desert = regions.find((region) => region.id === "desert");
      assert(forest?.unlocked === true);
      assert(forest?.nodes?.length >= 4);
      assert(desert?.unlocked === false);
      assert(Array.isArray(desert?.nodes));
    },
  },
  {
    name: "sanitizeWorldState recovers from malformed input",
    run() {
      const cleaned = sanitizeWorldState(
        {
          unlockedRegions: ["forest", "nope", 12, "desert"],
          currentRegionId: "bogus",
          currentNodeId: "also-bogus",
          worldLevel: -5,
        },
        { highestUnlockedFloor: 7 },
      );
      assert(cleaned.unlockedRegions.includes("forest"));
      assert(!cleaned.unlockedRegions.includes("nope"));
      // desert is a known region id, so it may remain if present; first batch
      // does not auto-unlock it, but sanitize keeps explicit valid ids.
      assert(cleaned.worldLevel === 7);
      assert(cleaned.currentNodeId === null);
      assert(getRegion(cleaned.currentRegionId) || cleaned.currentRegionId === "forest");
    },
  },
  {
    name: "sanitizeWorldState rejects locked current regions and nodes",
    run() {
      const cleaned = sanitizeWorldState({
        unlockedRegions: ["forest"],
        currentRegionId: "desert",
        currentNodeId: "desert_town",
      }, { highestUnlockedFloor: 1, clearedFloors: [] });
      assert(cleaned.currentRegionId === "forest");
      assert(cleaned.currentNodeId === null);

      const unlocked = sanitizeWorldState({
        unlockedRegions: ["forest", "desert"],
        currentRegionId: "forest",
        currentNodeId: "desert_town",
      }, { highestUnlockedFloor: 6, clearedFloors: [5] });
      assert(unlocked.currentRegionId === "desert");
      assert(unlocked.currentNodeId === "desert_town");
    },
  },
  {
    name: "applyVictory refreshes world level from floor progress",
    run() {
      let save = createDefaultSave();
      const created = createCharacter(save, { classId: "warrior", name: "地图旅人" });
      assert(created.ok);
      save = created.save;
      assert(save.world.worldLevel === 1);

      save = applyVictory(save, {
        victory: true,
        experience: 10,
        gold: 5,
        floorId: 3,
        characterId: save.activeCharacterId,
      });
      assert(save.progress.highestUnlockedFloor >= 4);
      assert(save.world.worldLevel === save.progress.highestUnlockedFloor);
    },
  },
  {
    name: "config world nodes have required fields",
    run() {
      const regions = CONFIG.world?.regions || {};
      assert(CONFIG.world?.starterRegionId === "forest");
      const forest = regions.forest;
      assert(forest && Array.isArray(forest.nodes) && forest.nodes.length >= 4);
      for (const node of forest.nodes) {
        assert(typeof node.id === "string" && node.id.length > 0);
        assert(["town", "outdoor", "dungeon"].includes(node.type), `bad type ${node.type}`);
        assert(typeof node.name === "string");
        assert(getNode(node.id)?.id === node.id);
      }
    },
  },
];
