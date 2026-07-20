import { CONFIG } from "../js/config.js";
import {
  extractEquipmentBaseName,
  generateEquipmentName,
  generateLoot,
  getEquipmentPrefix,
  getMostSignificantAffix,
  rerollItemAffixes,
} from "../js/loot.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

const NAMING_CONFIG = {
  ...CONFIG,
  equipmentNaming: {
    affixPrefixes: {
      strength: "狂暴的",
      agility: "迅捷的",
      critChance: "致命的",
      critDamage: "毁灭的",
    },
    effectPrefixes: {
      burning: "灼热的",
      lifesteal: "嗜血的",
    },
  },
};

export const tests = [
  {
    name: "equipment naming picks a deterministic significant affix and prioritizes effects",
    run() {
      const item = {
        level: 10,
        affixes: [
          { id: "strength", stat: "strength", value: 9 },
          { id: "critChance", stat: "critChance", value: 0.03 },
        ],
      };
      const significant = getMostSignificantAffix(item, NAMING_CONFIG);
      assert(significant?.id === "critChance", "rarer crit affix should outrank common stat affix");
      assert(getEquipmentPrefix(item, NAMING_CONFIG) === "致命的");
      assert(generateEquipmentName("黑铁战斧", item, NAMING_CONFIG) === "致命的黑铁战斧");
      assert(getEquipmentPrefix({
        ...item,
        effect: { id: "lifesteal", type: "lifesteal" },
      }, NAMING_CONFIG) === "嗜血的");
    },
  },
  {
    name: "unmapped and empty affixes keep the base equipment name",
    run() {
      const plain = { level: 1, affixes: [] };
      assert(generateEquipmentName("旧铁盔", plain, NAMING_CONFIG) === "旧铁盔");
      assert(generateEquipmentName("旧铁盔", {
        level: 1,
        affixes: [{ id: "vitality", stat: "vitality", value: 3 }],
      }, NAMING_CONFIG) === "旧铁盔");
      assert(extractEquipmentBaseName("稀有致命的旧铁盔", NAMING_CONFIG) === "旧铁盔");
    },
  },
  {
    name: "generated and reforged names are deterministic and derived from their current affixes",
    run() {
      const first = generateLoot(30, "prefix-seed-0", null, { forcedSlot: "weapon" });
      const second = generateLoot(30, "prefix-seed-0", null, { forcedSlot: "weapon" });
      assert(JSON.stringify(first) === JSON.stringify(second));
      const base = extractEquipmentBaseName(first.name);
      assert(first.affixes.length > 0 && getEquipmentPrefix(first).length > 0);
      assert(first.name.startsWith(getEquipmentPrefix(first)));
      assert(first.name === generateEquipmentName(base, first));

      const rerolled = rerollItemAffixes(first, "naming-reforge-seed");
      const rerolledAgain = rerollItemAffixes(first, "naming-reforge-seed");
      assert(JSON.stringify(rerolled) === JSON.stringify(rerolledAgain));
      assert(rerolled.name === generateEquipmentName(
        extractEquipmentBaseName(first.name),
        rerolled,
      ));
      assert(first.name === generateEquipmentName(base, first));
    },
  },
  {
    name: "generated affix ranges use the rolled item level",
    run() {
      let observedVariance = false;
      for (let index = 0; index < 120; index += 1) {
        const floor = 30;
        const item = generateLoot(floor, `level-alignment-${index}`, null, {
          minimumRarity: "rare",
          forcedSlot: "weapon",
        });
        if (item.level !== floor) observedVariance = true;
        for (const affix of item.affixes) {
          const definition = CONFIG.affixes[affix.id];
          if (!definition) continue;
          const bonus = (item.level - 1) * (definition.perFloor ?? 0);
          const minimum = definition.min + bonus;
          const maximum = definition.max + bonus;
          const factor = 10 ** (Number.isInteger(definition.decimals) ? definition.decimals : 0);
          const roundedMinimum = Math.round(minimum * factor) / factor;
          const roundedMaximum = Math.round(maximum * factor) / factor;
          assert(affix.value >= roundedMinimum && affix.value <= roundedMaximum,
            `${affix.id} roll must use item level ${item.level}`);
        }
      }
      assert(observedVariance, "test seeds should cover an item-level variance");
    },
  },
];
