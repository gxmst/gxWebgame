import { CONFIG, createSeededRng } from "../js/config.js";
import {
  addExperience,
  applyAutoAllocation,
  createDefaultHero,
  createHeroCombatant,
  createHeroForClass,
  getExperienceRequirement,
  getHeroStats,
  sanitizeHero,
  getEquipUpgradeDelta,
  getPower,
} from "../js/hero.js";
import {
  getSkillPointsEarnedAtLevel,
  prestigeHero,
  resolveSkillAtLevel,
} from "../js/skills.js";
import { rollAffixes } from "../js/loot.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

function experienceToReach(level) {
  let total = 0;
  for (let current = 1; current < level; current += 1) {
    total += getExperienceRequirement(current);
  }
  return total;
}

function investedStats(hero, classId) {
  const starting = CONFIG.classes[classId].startingStats;
  return Object.fromEntries(Object.keys(starting).map((stat) => [
    stat,
    hero.baseStats[stat] - starting[stat],
  ]));
}

export const tests = [
  {
    name: "warrior and mage creation use independent class definitions",
    run() {
      const warrior = createHeroForClass("warrior");
      const mage = createHeroForClass("mage");

      assert(warrior.classId === "warrior" && mage.classId === "mage");
      assert(warrior.classChosen && mage.classChosen);
      assert(JSON.stringify(warrior.baseStats) === JSON.stringify(CONFIG.classes.warrior.startingStats));
      assert(JSON.stringify(mage.baseStats) === JSON.stringify(CONFIG.classes.mage.startingStats));
      assert(warrior.skills.join(",") === CONFIG.classes.warrior.skills.join(","));
      assert(mage.skills.join(",") === CONFIG.classes.mage.skills.join(","));
      assert(warrior.skills.includes(CONFIG.classes.warrior.basicSkillId));
      assert(mage.skills.includes(CONFIG.classes.mage.basicSkillId));

      warrior.baseStats.strength += 1;
      const freshWarrior = createDefaultHero("warrior");
      assert(freshWarrior.baseStats.strength === CONFIG.classes.warrior.startingStats.strength);
    },
  },
  {
    name: "ranger creation uses agility as its primary stat and keeps its own skill kit",
    run() {
      const ranger = createHeroForClass("ranger");
      assert(ranger.classId === "ranger" && ranger.classChosen);
      assert(ranger.baseStats.agility === CONFIG.classes.ranger.startingStats.agility);
      assert(ranger.skills.join(",") === CONFIG.classes.ranger.skills.join(","));
      assert(ranger.skills[0] === CONFIG.classes.ranger.basicSkillId);
      assert(ranger.skills.includes("aimed_shot"));
      assert(ranger.skills.includes("arrow_rain"));
      assert(ranger.skills.includes("evasion_stance"));
    },
  },
  {
    name: "hero sanitization filters cross-class skills and restores each class basic skill",
    run() {
      const mage = sanitizeHero({
        classId: "mage",
        classChosen: true,
        level: -10,
        baseStats: { strength: Number.NaN },
        skills: ["basic_attack", "fireball", "not-a-skill"],
        skillLevels: {
          arcane_bolt: 99,
          fireball: 99,
          heavy_strike: 99,
        },
        unexpected: "drop me",
      });
      const mageSkills = CONFIG.classes.mage.skills;

      assert(mage.classId === "mage" && mage.classChosen);
      assert(mage.level === 1);
      assert(mage.baseStats.strength === CONFIG.classes.mage.startingStats.strength);
      assert(mage.skills[0] === CONFIG.classes.mage.basicSkillId);
      assert(mage.skills.includes("fireball"));
      assert(!mage.skills.includes("basic_attack") && !mage.skills.includes("not-a-skill"));
      assert(Object.keys(mage.skillLevels).every((id) => mageSkills.includes(id)));
      assert(Object.keys(mage.skillLevels).length === mageSkills.length);
      assert(mage.skillLevels.arcane_bolt === CONFIG.skills.arcane_bolt.leveling.maxLevel);
      assert(mage.skillLevels.fireball === CONFIG.skills.fireball.leveling.maxLevel);
      assert(!Object.hasOwn(mage, "unexpected"));

      for (const classId of Object.keys(CONFIG.classes)) {
        const clean = sanitizeHero({ ...createHeroForClass(classId), skills: [] });
        assert(
          clean.skills.includes(CONFIG.classes[classId].basicSkillId),
          `${classId} lost its basic skill fallback`,
        );
      }
    },
  },
  {
    name: "class-derived stats make warriors tougher and mages faster and harder-hitting",
    run() {
      const warrior = getHeroStats(createHeroForClass("warrior"));
      const mage = getHeroStats(createHeroForClass("mage"));

      assert(warrior.classId === "warrior" && mage.classId === "mage");
      assert(warrior.maxHp > mage.maxHp, `${warrior.maxHp} should exceed ${mage.maxHp}`);
      assert(warrior.defense > mage.defense, `${warrior.defense} should exceed ${mage.defense}`);
      assert(mage.attack > warrior.attack, `${mage.attack} should exceed ${warrior.attack}`);
      assert(mage.speed > warrior.speed, `${mage.speed} should exceed ${warrior.speed}`);
    },
  },
  {
    name: "ranger stats emphasize speed, criticals, and evasion with medium survival",
    run() {
      const warrior = getHeroStats(createHeroForClass("warrior"));
      const mage = getHeroStats(createHeroForClass("mage"));
      const ranger = getHeroStats(createHeroForClass("ranger"));

      assert(ranger.speed > warrior.speed && ranger.speed > mage.speed);
      assert(ranger.critChance > warrior.critChance && ranger.critChance > mage.critChance);
      assert(ranger.dodgeChance > warrior.dodgeChance && ranger.dodgeChance > mage.dodgeChance);
      assert(ranger.maxHp < warrior.maxHp && ranger.maxHp > mage.maxHp);
      assert(ranger.defense < warrior.defense && ranger.defense > mage.defense);
      assert(ranger.critDamage > warrior.critDamage);
    },
  },
  {
    name: "ranger auto-allocation favors agility before support attributes",
    run() {
      const ranger = createHeroForClass("ranger");
      const allocated = applyAutoAllocation({ ...ranger, unspentStatPoints: 30 });
      const invested = investedStats(allocated, "ranger");
      assert(invested.agility > invested.vitality);
      assert(invested.agility > invested.strength);
      assert(invested.strength > 0 && invested.vitality > 0);
      assert(invested.intelligence === 0);
    },
  },
  {
    name: "ranger loot rolls prefer agility, critical, and speed affixes deterministically",
    run() {
      const preferred = new Set(["agility", "critChance", "critDamage", "speed"]);
      let rangerPreferred = 0;
      let warriorPreferred = 0;
      let rangerTotal = 0;
      let warriorTotal = 0;
      for (let index = 0; index < 240; index += 1) {
        const seed = `affix-bias-${index}`;
        const rangerAffixes = rollAffixes(
          "accessory",
          20,
          "legendary",
          CONFIG.rarities.legendary,
          createSeededRng(seed),
          "ranger",
        );
        const warriorAffixes = rollAffixes(
          "accessory",
          20,
          "legendary",
          CONFIG.rarities.legendary,
          createSeededRng(seed),
          "warrior",
        );
        rangerPreferred += rangerAffixes.filter((affix) => preferred.has(affix.id)).length;
        warriorPreferred += warriorAffixes.filter((affix) => preferred.has(affix.id)).length;
        rangerTotal += rangerAffixes.length;
        warriorTotal += warriorAffixes.length;
      }
      assert(rangerTotal > 0 && warriorTotal > 0);
      assert(
        rangerPreferred / rangerTotal > warriorPreferred / warriorTotal * 1.35,
        `${rangerPreferred}/${rangerTotal} should exceed ${warriorPreferred}/${warriorTotal}`,
      );
    },
  },
  {
    name: "mage auto-allocation follows intelligence-first class weights",
    run() {
      const mage = createHeroForClass("mage");
      const source = { ...mage, unspentStatPoints: 20 };
      const before = JSON.stringify(source);
      const allocated = applyAutoAllocation(source);
      const invested = investedStats(allocated, "mage");
      const spent = Object.values(invested).reduce((sum, value) => sum + value, 0);

      assert(JSON.stringify(source) === before, "auto-allocation mutated its input");
      assert(allocated.unspentStatPoints === 0 && spent === 20);
      assert(invested.strength === 0, `mage invested ${invested.strength} in strength`);
      assert(invested.intelligence > invested.agility);
      assert(invested.intelligence > invested.vitality);
    },
  },
  {
    name: "leveling awards configured skill points at every milestone",
    run() {
      const hero = createHeroForClass("warrior");
      const targetLevel = Math.min(5, CONFIG.hero.maxLevel);
      const before = JSON.stringify(hero);
      const next = addExperience(hero, experienceToReach(targetLevel));

      assert(JSON.stringify(hero) === before, "addExperience mutated its input");
      assert(next.level === targetLevel);
      assert(next.unspentSkillPoints === getSkillPointsEarnedAtLevel(targetLevel));
      assert(next.unspentStatPoints === (targetLevel - 1) * CONFIG.hero.statPointsPerLevel);

      const migrated = sanitizeHero({
        classId: "warrior",
        classChosen: true,
        level: targetLevel,
        skills: CONFIG.classes.warrior.skills,
      });
      assert(migrated.unspentSkillPoints === getSkillPointsEarnedAtLevel(targetLevel));
    },
  },
  {
    name: "hero combatants receive effective leveled skill objects",
    run() {
      const mage = createHeroForClass("mage");
      const maxLevel = CONFIG.skills.fireball.leveling.maxLevel;
      mage.skillLevels.fireball = maxLevel;
      const before = JSON.stringify(mage);
      const combatant = createHeroCombatant(mage);
      const fireball = combatant.skills.find((skill) => skill.id === "fireball");
      const expected = resolveSkillAtLevel("fireball", maxLevel);

      assert(JSON.stringify(mage) === before, "combatant conversion mutated the hero");
      assert(combatant.classId === "mage" && combatant.emoji === CONFIG.classes.mage.emoji);
      assert(combatant.skills.every((skill) => skill && typeof skill === "object"));
      assert(combatant.skills.some((skill) => skill.id === "arcane_bolt" && skill.isBasic));
      assert(!combatant.skills.some((skill) => skill.id === "basic_attack"));
      assert(fireball?.level === maxLevel);
      assert(fireball?.multiplier === expected.multiplier);
      assert(fireball?.cooldown === expected.cooldown);
      assert(combatant.stats.hp === getHeroStats(mage).maxHp);
    },
  },
  {
    name: "prestige resets the run and grants permanent combat-stat growth",
    run() {
      const fresh = createHeroForClass("warrior");
      const maxed = { ...fresh, level: CONFIG.hero.maxLevel, experience: 0 };
      const before = JSON.stringify(maxed);
      const prestiged = prestigeHero(maxed);
      const baseStats = getHeroStats(fresh);
      const prestigeStats = getHeroStats(prestiged);

      assert(JSON.stringify(maxed) === before, "prestige mutated its input");
      assert(prestiged.level === 1 && prestiged.experience === 0);
      assert(prestiged.prestigeCount === 1);
      assert(prestigeStats.prestigeCount === 1);
      for (const stat of CONFIG.prestige.affectedStats) {
        assert(
          prestigeStats[stat] > baseStats[stat],
          `${stat} did not increase after prestige`,
        );
      }
      assert(prestigeStats.speed === baseStats.speed, "prestige changed an unaffected stat");
      assert(prestigeStats.power > baseStats.power);
    },
  },
  {
    name: "equip upgrade delta is positive for a strong weapon, and class-aware",
    run() {
      const warrior = createHeroForClass("warrior");
      const mage = createHeroForClass("mage");
      // 一件纯力量武器:对战士应是明显升级,对法师增益远小。
      const strengthWeapon = {
        id: "test-str-weapon",
        slot: "weapon",
        rarity: "rare",
        level: 5,
        affixes: [
          { id: "strength", name: "蛮力", stat: "strength", value: 30 },
          { id: "attack", name: "锋锐", stat: "attack", value: 20 },
        ],
      };
      const before = JSON.stringify(warrior);
      const warriorDelta = getEquipUpgradeDelta(warrior, strengthWeapon);
      const mageDelta = getEquipUpgradeDelta(mage, strengthWeapon);

      assert(JSON.stringify(warrior) === before, "upgrade delta mutated the hero");
      assert(warriorDelta > 0, "strength weapon should be an upgrade for a bare warrior");
      assert(
        warriorDelta > mageDelta,
        "class weighting: strength weapon should help the warrior more than the mage",
      );
      assert(getEquipUpgradeDelta(warrior, null) === 0, "null item yields zero delta");
    },
  },
];
