import { CONFIG } from "../js/config.js";
import { diagnoseDefeat } from "../js/diagnostics.js";
import {
  getItemDisplayName, getRarityLabel, getSlotLabel, getStatLabel, localizeAffix,
  localizeBattleLog, localizeContent, localizeDiagnosis, localizeEffect, localizeMaterial, normalizeLanguage, t,
} from "../js/i18n.js";
import { applyBossSignature } from "../js/game.js";
import { createDefaultSave, sanitizeSave } from "../js/save.js";
import { enterNode, getNode, isRegionUnlocked, syncWorldProgress } from "../js/world.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

export const tests = [
  {
    name: "equipment stats affixes effects materials and logs localize without mutating saves",
    run() {
      const item = {
        name: "坚壁的墓穴胸甲", slot: "armor", rarity: "legendary",
        affixes: [{ id: "defense", name: "守护", stat: "defense" }],
        effect: { id: "burning", name: "余烬", description: "中文" },
      };
      assert(getSlotLabel("footwear", "en-US") === "Boots");
      assert(getStatLabel("strength", "en-US") === "Strength");
      assert(getRarityLabel("legendary", "en-US") === "Legendary");
      assert(localizeAffix(item.affixes[0], "en-US").name === "Guarding");
      assert(localizeEffect(item.effect, "en-US").name === "Embers");
      assert(localizeMaterial({ id: "wild_essence", name: "荒野精华" }, "en-US").name === "Wild Essence");
      assert(getItemDisplayName(item, "en-US") === "Guarding Crypt Cuirass");
      assert(item.name === "坚壁的墓穴胸甲", "presentation localization must not rewrite saved item names");
      assert(localizeBattleLog({ type: "round_start", round: 3, message: "第 3 回合" }, "en-US") === "Round 3");
      assert(localizeBattleLog({ type: "battle_end", outcome: "victory" }, "en-US").includes("Victory"));
    },
  },
  {
    name: "language preference sanitizes and survives save migration",
    run() {
      assert(createDefaultSave().settings.language === "zh-CN");
      assert(sanitizeSave({ settings: { language: "en-US" } }).settings.language === "en-US");
      assert(sanitizeSave({ settings: { language: "invalid" } }).settings.language === "zh-CN");
      assert(normalizeLanguage("en") === "en-US");
      assert(t("app.title", "en-US") === "Text Dungeon");
    },
  },
  {
    name: "core classes skills branches and regions have English projections",
    run() {
      for (const definition of Object.values(CONFIG.classes)) {
        const localized = localizeContent(definition, "class", "en-US");
        assert(localized.name && localized.name !== definition.name, `${definition.id} class was not localized`);
      }
      for (const classDefinition of Object.values(CONFIG.classes)) {
        for (const skillId of classDefinition.skills) {
          const skill = CONFIG.skills[skillId];
          const localized = localizeContent(skill, "skill", "en-US");
          assert(localized.name && localized.name !== skill.name, `${skillId} was not localized`);
          if (skill.isBasic) continue;
          assert(localized.branches.length === 2);
          assert(localized.branches.every((branch, index) => branch.name !== skill.branches[index].name));
        }
      }
      for (const region of Object.values(CONFIG.world.regions)) {
        assert(localizeContent(region, "region", "en-US").name !== region.name);
        for (const node of region.nodes) {
          assert(localizeContent(node, "node", "en-US").name !== node.name);
        }
      }
    },
  },
  {
    name: "defeat diagnosis identifies power survival and unfinished builds",
    run() {
      const result = diagnoseDefeat({
        heroStats: { power: 500, maxHp: 400 },
        skillPointState: { available: 7, spent: 8 },
        statistics: { playerDamageDealt: 200, playerDamageTaken: 800, playerHealing: 20, rounds: 12 },
        floor: { recommendedPower: 1000 },
      });
      const ids = new Set(result.suggestions.map((entry) => entry.id));
      assert(ids.has("power"));
      assert(ids.has("survival") || ids.has("build"));
      assert(result.powerRatio === 0.5);
      const english = localizeDiagnosis(result, "en-US");
      assert(english.suggestions[0].title !== result.suggestions[0].title);
    },
  },
  {
    name: "abyss and void are playable regions with endgame objectives",
    run() {
      assert(CONFIG.endgame.objectives.map((entry) => entry.floor).join(",") === "50,85,100");
      for (const regionId of ["abyss", "void"]) {
        const region = CONFIG.world.regions[regionId];
        assert(region.nodes.length >= 4, `${regionId} must be playable`);
        assert(region.nodes.some((node) => node.type === "town"));
        assert(region.nodes.some((node) => node.type === "outdoor"));
        assert(region.nodes.some((node) => node.type === "dungeon"));
        assert(region.nodes.every((node) => getNode(node.id)?.id === node.id));
      }
      const unlocked = syncWorldProgress(createDefaultSave(), { highestUnlockedFloor: 100, clearedFloors: [20, 45] });
      assert(isRegionUnlocked(unlocked, "abyss"));
      assert(isRegionUnlocked(unlocked, "void"));
      assert(enterNode(unlocked, "void_dungeon").ok);
    },
  },
  {
    name: "boss signatures are deterministic and identify endgame drops",
    run() {
      const item = { id: "test-drop", name: "余烬徽记", power: 100 };
      const signed = applyBossSignature(item, 100, 0);
      assert(signed !== item);
      assert(signed.id === "test-drop-boss-100-0");
      assert(signed.name.startsWith("虚空君王的"));
      assert(JSON.stringify(applyBossSignature(item, 100, 0)) === JSON.stringify(signed));
      assert(item.name === "余烬徽记");
    },
  },
];
