import { CONFIG } from "../js/config.js";
import { calculateDamage, simulateCombat } from "../js/combat.js";
import {
  createHeroCombatant,
  createHeroForClass,
  equipItem,
  getHeroStats,
  sanitizeHero,
} from "../js/hero.js";
import { resolveSkillAtLevel } from "../js/skills.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

const actions = (result, actorId) => result.logs.filter((entry) =>
  entry.type === "action" && (actorId === undefined || entry.actorId === actorId));

const bigEnemy = (overrides = {}) => ({
  id: "colossus",
  hp: 100_000,
  maxHp: 100_000,
  attack: 0,
  defense: 0,
  speed: 1,
  ...overrides,
});

export const tests = [
  {
    name: "necromancer opens with a summon and skeletons fight on the player's side",
    run() {
      const necromancer = createHeroCombatant(createHeroForClass("necromancer"));
      const result = simulateCombat({
        player: necromancer,
        enemies: [bigEnemy()],
        seed: "necro-open",
        config: { ...CONFIG, combat: { ...CONFIG.combat, maxRounds: 4, randomVariance: 0 } },
      });
      const first = actions(result, necromancer.id)[0];
      assert(first?.skillId === "raise_skeleton", `first action was ${first?.skillId}`);
      assert(first.actionType === "summon" && first.summonedCount === 2);
      assert(first.snapshot.minions.length === 2, "snapshot must include summoned minions");
      assert(first.snapshot.minions.every((minion) => minion.side === "minion" && minion.alive));
      const minionActions = result.logs.filter((entry) =>
        entry.type === "action" && entry.actor?.side === "minion");
      assert(minionActions.length > 0, "minions must take their own turns");
      assert(result.statistics.minionsSummoned === 2);
      assert(result.statistics.minionDamageDealt > 0);
    },
  },
  {
    name: "enemies target the weakest ally, so skeletons soak hits and get resummoned",
    run() {
      const necromancer = createHeroCombatant(createHeroForClass("necromancer"));
      const result = simulateCombat({
        player: necromancer,
        enemies: [bigEnemy({ id: "bruiser", attack: 40, speed: 1 })],
        seed: "necro-resummon",
        config: { ...CONFIG, combat: { ...CONFIG.combat, maxRounds: 10, randomVariance: 0 } },
      });
      const enemyHits = actions(result, "bruiser");
      assert(enemyHits.some((entry) => String(entry.targetIds[0]).startsWith("minion-")),
        "enemies must be able to target minions");
      assert(result.statistics.minionsLost >= 1, "skeletons should fall while tanking");
      const summons = actions(result, necromancer.id)
        .filter((entry) => entry.actionType === "summon" && entry.summonedCount > 0);
      assert(summons.length >= 2, `expected a resummon, got ${summons.length} casts`);
    },
  },
  {
    name: "the on-field minion cap is respected in every snapshot",
    run() {
      const necromancer = createHeroCombatant(createHeroForClass("necromancer"));
      const cap = Math.min(
        CONFIG.skills.raise_skeleton.maxMinions,
        CONFIG.combat.minions.maxActive,
      );
      const result = simulateCombat({
        player: necromancer,
        enemies: [bigEnemy()],
        seed: "necro-cap",
        config: { ...CONFIG, combat: { ...CONFIG.combat, maxRounds: 12, randomVariance: 0 } },
      });
      for (const entry of result.logs) {
        const living = entry.snapshot.minions.filter((minion) => minion.alive).length;
        assert(living <= cap, `living minions ${living} exceeded cap ${cap}`);
      }
      assert(result.statistics.minionsSummoned <= cap + result.statistics.minionsLost,
        "summons may only exceed the cap by replacing losses");
    },
  },
  {
    name: "summoned battles stay deterministic and never mutate inputs",
    run() {
      const necromancer = createHeroCombatant(createHeroForClass("necromancer"));
      const enemies = [bigEnemy({ id: "a", attack: 25 }), bigEnemy({ id: "b", attack: 25, speed: 2 })];
      const before = JSON.stringify({ necromancer, enemies });
      const first = simulateCombat({
        player: necromancer,
        enemies,
        seed: "necro-deterministic",
        config: { ...CONFIG, combat: { ...CONFIG.combat, maxRounds: 12 } },
      });
      const second = simulateCombat({
        player: necromancer,
        enemies,
        seed: "necro-deterministic",
        config: { ...CONFIG, combat: { ...CONFIG.combat, maxRounds: 12 } },
      });
      assert(JSON.stringify(first) === JSON.stringify(second));
      assert(JSON.stringify({ necromancer, enemies }) === before);
    },
  },
  {
    name: "druid opens with wolf form; the empower bonus scales damage rolls",
    run() {
      const druid = createHeroCombatant(createHeroForClass("druid"));
      const result = simulateCombat({
        player: druid,
        enemies: [bigEnemy()],
        seed: "druid-form",
        config: { ...CONFIG, combat: { ...CONFIG.combat, maxRounds: 3, randomVariance: 0 } },
      });
      const first = actions(result, druid.id)[0];
      assert(first?.skillId === "wolf_form", `first action was ${first?.skillId}`);
      const configuredDamageBonus = Math.round(CONFIG.skills.wolf_form.damageBonus * 100);
      const configuredLifestealBonus = Math.round(CONFIG.skills.wolf_form.lifestealBonus * 100);
      assert(
        first.actionType === "empower"
          && first.message.includes(`伤害 +${configuredDamageBonus}%`)
          && first.message.includes(`吸血 +${configuredLifestealBonus}%`),
        first.message,
      );
      assert(first.snapshot.player.empower?.remainingTurns > 0,
        "empower status must appear in snapshots");
      const strike = actions(result, druid.id)[1];
      assert(strike && strike.lifestealHealing > 0,
        "wolf form must grant lifesteal to later strikes");

      const flat = () => 0.5;
      const plain = calculateDamage(
        { attack: 100, critChance: 0 },
        { defense: 0, dodgeChance: 0 },
        { id: "hit", type: "single", multiplier: 1 },
        flat,
        { damageVariance: 0 },
      );
      const empowered = calculateDamage(
        { attack: 100, critChance: 0, empower: { remainingTurns: 2, damageBonus: 0.5 } },
        { defense: 0, dodgeChance: 0 },
        { id: "hit", type: "single", multiplier: 1 },
        flat,
        { damageVariance: 0 },
      );
      assert(plain.damage === 100 && empowered.damage === 150,
        `empower scaling was ${plain.damage} → ${empowered.damage}`);
    },
  },
  {
    name: "druid casts rejuvenation below the trigger threshold and heals",
    run() {
      const druid = createHeroCombatant(createHeroForClass("druid"));
      const wounded = {
        ...druid,
        stats: { ...druid.stats, hp: Math.floor(druid.stats.maxHp * 0.3) },
      };
      const result = simulateCombat({
        player: wounded,
        enemies: [bigEnemy()],
        seed: "druid-heal",
        config: { ...CONFIG, combat: { ...CONFIG.combat, maxRounds: 1, randomVariance: 0 } },
      });
      const first = actions(result, druid.id)[0];
      assert(first?.skillId === "rejuvenation", `first action was ${first?.skillId}`);
      assert(first.actionType === "heal" && first.healing > 0);
      assert(result.statistics.playerHealing >= first.healing);
    },
  },
  {
    name: "class sheets, damage types, and skill leveling resolve for both new classes",
    run() {
      for (const classId of ["necromancer", "druid"]) {
        const hero = createHeroForClass(classId);
        assert(hero.classId === classId);
        const restored = sanitizeHero(JSON.parse(JSON.stringify(hero)));
        assert(restored.classId === classId, "class must survive a save round trip");
        assert(getHeroStats(hero).power > 0);
      }

      const necromancer = createHeroForClass("necromancer");
      const magicItem = {
        id: "test-grimoire",
        name: "奥秘的黯淡护符",
        slot: "accessory",
        rarity: "rare",
        level: 5,
        baseStats: {},
        affixes: [{ id: "magicDamagePercent", stat: "magicDamagePercent", value: 0.06 }],
        effect: null,
      };
      const armedNecromancer = getHeroStats(equipItem(necromancer, magicItem));
      assert(armedNecromancer.damageMultiplier > 1,
        "necromancer must consume magic damage affixes");

      const druid = createHeroForClass("druid");
      const physicalItem = {
        ...magicItem,
        id: "test-claw",
        affixes: [{ id: "physicalDamagePercent", stat: "physicalDamagePercent", value: 0.06 }],
      };
      const armedDruid = getHeroStats(equipItem(druid, physicalItem));
      assert(armedDruid.damageMultiplier > 1,
        "druid must consume physical damage affixes");

      const maxedSummon = resolveSkillAtLevel(
        "raise_skeleton",
        CONFIG.skills.raise_skeleton.leveling.maxLevel,
      );
      const expectedMaxMinions = CONFIG.skills.raise_skeleton.maxMinions
        + CONFIG.skills.raise_skeleton.leveling.milestones
          .filter((milestone) => milestone.level <= CONFIG.skills.raise_skeleton.leveling.maxLevel)
          .reduce((sum, milestone) => sum + Number(milestone.add?.maxMinions ?? 0), 0);
      const expectedSummonCount = CONFIG.skills.raise_skeleton.summonCount
        + CONFIG.skills.raise_skeleton.leveling.milestones
          .filter((milestone) => milestone.level <= CONFIG.skills.raise_skeleton.leveling.maxLevel)
          .reduce((sum, milestone) => sum + Number(milestone.add?.summonCount ?? 0), 0);
      assert(maxedSummon.maxMinions === expectedMaxMinions
        && maxedSummon.summonCount === expectedSummonCount,
      `summon milestones were ${maxedSummon.maxMinions}/${maxedSummon.summonCount}`);
      assert(maxedSummon.minionAttackRatio > CONFIG.skills.raise_skeleton.minionAttackRatio);

      const maxedForm = resolveSkillAtLevel(
        "wolf_form",
        CONFIG.skills.wolf_form.leveling.maxLevel,
      );
      const formLeveling = CONFIG.skills.wolf_form.leveling;
      const expectedFormDamage = CONFIG.skills.wolf_form.damageBonus
        + Number(formLeveling.perLevel?.damageBonus ?? 0)
          * (formLeveling.maxLevel - formLeveling.initialLevel)
        + formLeveling.milestones
          .filter((milestone) => milestone.level <= formLeveling.maxLevel)
          .reduce((sum, milestone) => sum + Number(milestone.add?.damageBonus ?? 0), 0);
      assert(Math.abs(maxedForm.damageBonus - expectedFormDamage) < 1e-9,
        `wolf form max bonus was ${maxedForm.damageBonus}`);
      assert(maxedForm.cooldown === CONFIG.skills.wolf_form.cooldown - 1);
    },
  },
];
