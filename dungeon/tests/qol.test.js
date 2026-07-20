import { CONFIG } from "../js/config.js";
import { equipItem, sanitizeItem, unequipItem, createHeroForClass } from "../js/hero.js";
import { getAffixRollQuality } from "../js/loot.js";
import { sanitizeSave } from "../js/save.js";
import { GameAudio } from "../js/audio.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

const sampleItem = (overrides = {}) => ({
  id: "qol-item",
  name: "测试之刃",
  slot: "weapon",
  rarity: "rare",
  level: 10,
  baseStats: { attack: 10 },
  affixes: [],
  effect: null,
  ...overrides,
});

export const tests = [
  {
    name: "item locks default to false, survive sanitize, equip, and unequip",
    run() {
      assert(sanitizeItem(sampleItem()).locked === false);
      assert(sanitizeItem(sampleItem({ locked: true })).locked === true);
      assert(sanitizeItem(sampleItem({ locked: "yes" })).locked === false,
        "non-boolean lock flags must be dropped");

      let hero = createHeroForClass("warrior");
      hero = equipItem(hero, sampleItem({ locked: true }));
      assert(hero.equipment.weapon.locked === true, "equipping must keep the lock");
      hero = unequipItem(hero, "weapon");
      assert(hero.inventory[0].locked === true, "unequipping must keep the lock");
    },
  },
  {
    name: "sound setting defaults on and round-trips through sanitizeSave",
    run() {
      assert(sanitizeSave({}).settings.soundEnabled === true);
      assert(sanitizeSave({ settings: { soundEnabled: false } }).settings.soundEnabled === false);
      assert(sanitizeSave({ settings: { soundEnabled: "no" } }).settings.soundEnabled === true,
        "non-boolean sound flags must fall back to enabled");
    },
  },
  {
    name: "affix roll quality maps min/max rolls to 0%/100% at the item level",
    run() {
      const definition = CONFIG.affixes.attack;
      const level = 10;
      const floorBonus = (level - 1) * definition.perFloor;
      const low = getAffixRollQuality(
        { id: "attack", stat: "attack", value: definition.min + floorBonus },
        level,
      );
      const high = getAffixRollQuality(
        { id: "attack", stat: "attack", value: definition.max + floorBonus },
        level,
      );
      assert(low.percent === 0, `minimum roll was ${low.percent}%`);
      assert(high.percent === 100, `maximum roll was ${high.percent}%`);
      const overflow = getAffixRollQuality(
        { id: "attack", stat: "attack", value: definition.max + floorBonus + 999 },
        level,
      );
      assert(overflow.percent === 100, "quality must clamp above the range");
      assert(getAffixRollQuality({ id: "unknown-affix", stat: "nope", value: 1 }, 1) === null);
    },
  },
  {
    name: "first sound waits for AudioContext resume instead of being dropped",
    async run() {
      let tones = 0;
      const audio = new GameAudio();
      audio.context = {
        state: "suspended",
        currentTime: 0,
        resume: async () => { audio.context.state = "running"; },
      };
      audio.tone = () => { tones += 1; };
      audio.play("coin");
      assert(tones === 0, "suspended contexts should wait for resume");
      await Promise.resolve();
      await Promise.resolve();
      assert(tones === 1, "the first sound should play after resume");
    },
  },
];
