import {
  allocateSkillPoint,
  canPrestige,
  chooseSkillBranch,
  clearSkillBranches,
  getSelectedSkillBranch,
  getSkillBranchChoice,
  getSkillBranches,
  getHeroSkills,
  getPrestigeBonuses,
  getPrestigePreview,
  getSkillLevel,
  getSkillPointState,
  getSkillPointsEarnedAtLevel,
  prestigeHero,
  resetSkillPoints,
  resolveSkillAtLevel,
  upgradeSkill,
} from "../js/skills.js";
import { CONFIG } from "../js/config.js";
import { createHeroForClass } from "../js/hero.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

const makeHero = (overrides = {}) => ({
  id: "skill-test-hero",
  name: "测试角色",
  classId: "warrior",
  level: 1,
  experience: 0,
  baseStats: { strength: 10, agility: 5, intelligence: 2, vitality: 10 },
  skills: ["basic_attack", "heavy_strike", "whirlwind", "block"],
  skillLevels: {
    basic_attack: 1,
    heavy_strike: 1,
    whirlwind: 1,
    block: 1,
  },
  unspentSkillPoints: 0,
  prestigeCount: 0,
  equipment: { weapon: null, helmet: null, armor: null, accessory: null },
  inventory: [],
  gold: 0,
  ...overrides,
});

export const tests = [
  {
    name: "skill levels resolve from config and use a safe fallback",
    run() {
      const hero = makeHero({ skillLevels: { heavy_strike: 3 } });
      assert(getSkillLevel(hero, "heavy_strike") === 3);
      assert(getSkillLevel(hero, "not-a-skill") === 0);
      assert(getSkillLevel(hero, "whirlwind") >= 1);
    },
  },
  {
    name: "custom leveling data applies per-level growth and milestones immutably",
    run() {
      const definition = {
        id: "test_skill",
        type: "single",
        multiplier: 2,
        cooldown: 4,
        leveling: {
          initialLevel: 1,
          maxLevel: 8,
          perLevel: { multiplier: 0.5 },
          milestones: [{ level: 4, add: { cooldown: -1 } }],
        },
      };
      const first = resolveSkillAtLevel(definition, 5);
      const second = resolveSkillAtLevel(definition, 5);
      assert(first.multiplier === 4, `unexpected multiplier ${first.multiplier}`);
      assert(first.cooldown === 3, `unexpected cooldown ${first.cooldown}`);
      assert(first.level === 5 && first.skillLevel === 5);
      assert(JSON.stringify(first) === JSON.stringify(second));
      assert(definition.multiplier === 2 && definition.cooldown === 4);
    },
  },
  {
    name: "hero skills expose resolved objects and preserve the basic fallback",
    run() {
      const hero = makeHero({ skillLevels: { heavy_strike: 2 } });
      const skills = getHeroSkills(hero);
      assert(skills.some((skill) => skill.id === "basic_attack"));
      assert(skills.find((skill) => skill.id === "heavy_strike")?.level === 2);
      assert(skills.every((skill) => skill.id && Number.isFinite(skill.level)));

      const mageSkills = getHeroSkills(makeHero({
        classId: "mage",
        skills: ["arcane_bolt", "fireball", "chain_lightning", "mana_shield"],
        skillLevels: { arcane_bolt: 1, fireball: 2, chain_lightning: 1, mana_shield: 1 },
      }));
      assert(mageSkills.some((skill) => skill.id === "arcane_bolt" && skill.isBasic));
      assert(!mageSkills.some((skill) => skill.id === "basic_attack"));
    },
  },
  {
    name: "ranger skill resolution preserves multi-hit, aimed-crit, and evasion fields",
    run() {
      const ranger = createHeroForClass("ranger");
      const skills = getHeroSkills(ranger);
      const quick = skills.find((skill) => skill.id === "quick_shot");
      const aimed = skills.find((skill) => skill.id === "aimed_shot");
      const rain = skills.find((skill) => skill.id === "arrow_rain");
      const stance = skills.find((skill) => skill.id === "evasion_stance");

      assert(quick?.isBasic && quick.hitCount === 2);
      assert(aimed?.type === "single" && aimed.critChanceBonus > 0);
      assert(rain?.type === "aoe" && rain.hitCount >= 2);
      assert(stance?.type === "guard" && stance.dodgeBonus > 0);

      ranger.skillLevels.aimed_shot = CONFIG.skills.aimed_shot.leveling.maxLevel;
      ranger.skillLevels.evasion_stance = CONFIG.skills.evasion_stance.leveling.maxLevel;
      const maxAimed = getHeroSkills(ranger).find((skill) => skill.id === "aimed_shot");
      const maxStance = getHeroSkills(ranger).find((skill) => skill.id === "evasion_stance");
      assert(maxAimed.multiplier > aimed.multiplier);
      assert(maxAimed.critChanceBonus > aimed.critChanceBonus);
      assert(maxStance.dodgeBonus > stance.dodgeBonus);
    },
  },
  {
    name: "skill-point state counts spent points and derives missing legacy values",
    run() {
      const hero = makeHero({ level: 8, skillLevels: { heavy_strike: 3 }, unspentSkillPoints: 0 });
      const state = getSkillPointState(hero);
      assert(state.spent === 2, `spent was ${state.spent}`);
      assert(state.total === state.spent + state.unspent);
      assert(state.earned >= state.spent);

      const legacy = makeHero({ level: 8, skillLevels: { heavy_strike: 1 } });
      delete legacy.unspentSkillPoints;
      const migrated = getSkillPointState(legacy);
      assert(migrated.unspent === getSkillPointsEarnedAtLevel(8));
    },
  },
  {
    name: "upgradeSkill spends only available points and never mutates its input",
    run() {
      const hero = makeHero({
        skillLevels: { heavy_strike: 1 },
        unspentSkillPoints: 2,
      });
      const before = JSON.stringify(hero);
      const upgraded = upgradeSkill(hero, "heavy_strike", 5);
      assert(JSON.stringify(hero) === before);
      assert(getSkillLevel(upgraded, "heavy_strike") >= 2);
      assert(upgraded.unspentSkillPoints === 0);
      const basic = allocateSkillPoint(upgraded, "basic_attack", 1);
      assert(getSkillLevel(basic, "basic_attack") === 1);
    },
  },
  {
    name: "skill points are capped at thirty earned and twenty-five invested",
    run() {
      const maxLevel = CONFIG.hero.maxLevel;
      const earned = getSkillPointsEarnedAtLevel(maxLevel);
      assert(earned <= 30, `earned points exceeded cap: ${earned}`);
      assert(getSkillPointsEarnedAtLevel(Number.MAX_SAFE_INTEGER) <= 30);

      const hero = makeHero({
        level: maxLevel,
        skillLevels: { heavy_strike: 10, whirlwind: 10, block: 7 },
        unspentSkillPoints: 10,
      });
      const before = getSkillPointState(hero);
      assert(before.spent === 24, `spent was ${before.spent}`);
      assert(before.investmentCap === 25);
      assert(before.available === 1, `available was ${before.available}`);
      assert(before.reserve >= 0);
      const upgraded = upgradeSkill(hero, "block", 9);
      const after = getSkillPointState(upgraded);
      assert(after.spent === 25, `investment cap was bypassed: ${after.spent}`);
      assert(getSkillLevel(upgraded, "block") === 8);
      assert(after.available === 0 && after.atInvestmentCap);
      assert(getSkillLevel(upgradeSkill(upgraded, "block", 1), "block") === 8);
    },
  },
  {
    name: "skill branches are mutually exclusive, unlock at rank, and affect resolution",
    run() {
      const branches = [
        {
          id: "crusher",
          name: "碎甲重击",
          unlockLevel: 5,
          add: { multiplier: 0.25, armorPenetration: 0.2 },
        },
        {
          id: "executioner",
          name: "处决重击",
          unlockLevel: 5,
          changes: { critChanceBonus: 0.3 },
          set: { canCrit: true },
        },
      ];
      const branchSkill = { ...CONFIG.skills.heavy_strike, branches };
      const hero = makeHero({
        level: 10,
        skills: ["basic_attack", branchSkill, "whirlwind", "block"],
        skillLevels: { heavy_strike: 5 },
        skillBranches: {},
      });
      assert(getSkillBranches(branchSkill).length === 2);
      assert(getSkillBranchChoice(hero, "heavy_strike") === null);
      const unselected = getHeroSkills(hero).find((entry) => entry.id === "heavy_strike");
      assert(unselected?.branchUnlocked === true && unselected?.selectedBranchId === null);
      const locked = chooseSkillBranch({ ...hero, skillLevels: { heavy_strike: 4 } }, "heavy_strike", "crusher");
      assert(getSkillBranchChoice(locked, "heavy_strike") === null);

      const chosen = chooseSkillBranch(hero, "heavy_strike", "crusher");
      assert(getSkillBranchChoice(chosen, "heavy_strike") === "crusher");
      assert(getSelectedSkillBranch(chosen, "heavy_strike")?.id === "crusher");
      assert(hero.skillBranches?.heavy_strike === undefined);
      const resolved = getHeroSkills(chosen).find((entry) => entry.id === "heavy_strike");
      assert(resolved?.selectedBranchId === "crusher");
      assert(resolved?.branchUnlocked === true);
      assert(resolved?.branchUnlockLevel === 5);
      assert(resolved?.multiplier === 2.44, `branch multiplier was ${resolved?.multiplier}`);
      assert(resolved?.armorPenetration === 0.2);
      const rejected = chooseSkillBranch(chosen, "heavy_strike", "executioner");
      assert(getSkillBranchChoice(rejected, "heavy_strike") === "crusher");

      const cleared = clearSkillBranches(chosen, "heavy_strike");
      assert(getSkillBranchChoice(cleared, "heavy_strike") === null);
      assert(getHeroSkills(cleared).find((entry) => entry.id === "heavy_strike")?.selectedBranchId === null);
      assert(getSkillBranchChoice(clearSkillBranches(chosen), "heavy_strike") === null);
    },
  },
  {
    name: "resetSkillPoints refunds invested points and restores base ranks",
    run() {
      const hero = makeHero({
        skillLevels: { heavy_strike: 3, whirlwind: 2 },
        skillBranches: { heavy_strike: "crusher" },
        unspentSkillPoints: 1,
      });
      const state = getSkillPointState(hero);
      const reset = resetSkillPoints(hero);
      assert(getSkillLevel(reset, "heavy_strike") === 1);
      assert(getSkillLevel(reset, "whirlwind") === 1);
      assert(reset.unspentSkillPoints === state.unspent + state.spent);
      assert(Object.keys(reset.skillBranches).length === 0);
      assert(getSkillLevel(hero, "heavy_strike") === 3);
    },
  },
  {
    name: "prestige preview and bonuses are monotonic",
    run() {
      const base = getPrestigeBonuses(makeHero({ prestigeCount: 0 }));
      const later = getPrestigeBonuses(makeHero({ prestigeCount: 2 }));
      assert(later.count === 2);
      assert(later.multiplier >= base.multiplier);
      assert(later.floorCap >= base.floorCap);
      const preview = getPrestigePreview(makeHero({ level: CONFIG.hero.maxLevel }));
      assert(preview.nextCount === preview.currentCount + 1);
      assert(preview.nextMultiplier >= preview.currentMultiplier);
    },
  },
  {
    name: "prestige requires max level and resets progression while preserving gear",
    run() {
      const equipment = { weapon: { id: "kept-weapon" } };
      const hero = makeHero({
        level: CONFIG.hero.maxLevel,
        experience: 123,
        prestigeCount: 0,
        baseStats: { strength: 99, agility: 88, intelligence: 77, vitality: 66 },
        skillLevels: { heavy_strike: 4, whirlwind: 3 },
        unspentSkillPoints: 2,
        equipment,
        inventory: [{ id: "kept-item" }],
        gold: 987,
      });
      const before = JSON.stringify(hero);
      const next = prestigeHero(hero);
      assert(JSON.stringify(hero) === before);
      assert(next.prestigeCount === 1);
      assert(next.level === 1 && next.experience === 0);
      assert(next.baseStats.strength === CONFIG.classes.warrior.startingStats.strength);
      assert(next.equipment.weapon.id === "kept-weapon");
      assert(next.inventory[0].id === "kept-item" && next.gold === 987);
      assert(getSkillLevel(next, "heavy_strike") === 1);
      assert(next.unspentSkillPoints >= 1);

      const ineligible = prestigeHero(makeHero({ level: CONFIG.hero.maxLevel - 1 }));
      assert(ineligible.level === CONFIG.hero.maxLevel - 1);
      assert(!canPrestige(makeHero({ level: CONFIG.hero.maxLevel - 1 })));
    },
  },
];
