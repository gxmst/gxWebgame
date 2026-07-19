import { CONFIG } from "../js/config.js";
import {
  addExperience,
  applyAutoAllocation,
  createDefaultHero,
  createHeroCombatant,
  createHeroForClass,
  getExperienceRequirement,
  getHeroStats,
  sanitizeHero,
} from "../js/hero.js";
import {
  getSkillPointsEarnedAtLevel,
  prestigeHero,
  resolveSkillAtLevel,
} from "../js/skills.js";

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
];

