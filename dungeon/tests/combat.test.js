import {
  calculateDamage,
  compareTurnOrder,
  createSeededRng,
  selectTarget,
  simulateCombat,
} from "../js/combat.js";
import { CONFIG } from "../js/config.js";
import { createHeroCombatant, createHeroForClass } from "../js/hero.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

const actions = (result, actorId) => result.logs.filter((entry) =>
  entry.type === "action" && (actorId === undefined || entry.actorId === actorId));

export const tests = [
  {
    name: "same seed produces identical combat without mutating inputs",
    run() {
      const player = {
        id: "hero",
        name: "Hero",
        hp: 120,
        maxHp: 120,
        attack: 18,
        defense: 5,
        speed: 12,
        critChance: 0.25,
      };
      const enemies = [
        { id: "a", hp: 45, maxHp: 45, attack: 8, speed: 7 },
        { id: "b", hp: 50, maxHp: 50, attack: 9, speed: 8 },
        { id: "c", hp: 55, maxHp: 55, attack: 10, speed: 9 },
      ];
      const before = JSON.stringify({ player, enemies });
      const first = simulateCombat({ player, enemies, seed: "fixed-seed" });
      const second = simulateCombat({ player, enemies, seed: "fixed-seed" });
      assert(JSON.stringify(first) === JSON.stringify(second), "same seed should reproduce every event");
      assert(JSON.stringify({ player, enemies }) === before, "simulation must not mutate caller state");
      assert(first.logs.every((entry) => entry.snapshot?.player && Array.isArray(entry.snapshot.enemies)));
    },
  },
  {
    name: "speed ties use stable initial order and never consume RNG",
    run() {
      const units = [
        { id: "enemy-b", speed: 10, _order: 2 },
        { id: "hero", speed: 10, _order: 0 },
        { id: "enemy-a", speed: 10, _order: 1 },
      ];
      assert([...units].sort(compareTurnOrder).map((unit) => unit.id).join(",") === "hero,enemy-a,enemy-b");
      const result = simulateCombat({
        player: { id: "hero", hp: 100, attack: 1, defense: 0, speed: 10, skills: [] },
        enemies: [
          { id: "enemy-a", hp: 100, attack: 1, speed: 10 },
          { id: "enemy-b", hp: 100, attack: 1, speed: 10 },
        ],
        seed: "tie",
        config: { maxRounds: 1, damageVariance: 0 },
      });
      const firstRoundActors = actions(result).map((entry) => entry.actorId);
      assert(firstRoundActors.join(",") === "hero,enemy-a,enemy-b", firstRoundActors.join(","));
    },
  },
  {
    name: "round limit ends stalemates as a player defeat",
    run() {
      const result = simulateCombat({
        player: { id: "hero", hp: 1_000_000, attack: 1, defense: 1_000_000, speed: 10, skills: [] },
        enemies: [{ id: "wall", hp: 1_000_000, attack: 1, defense: 1_000_000, speed: 1 }],
        seed: 1,
        config: { maxRounds: 3, damageVariance: 0 },
      });
      assert(result.outcome === "defeat");
      assert(result.reason === "max-rounds");
      assert(result.rounds === 3);
      assert(result.logs.some((entry) => entry.type === "round_limit"));
    },
  },
  {
    name: "dead locked targets are reselected and lowest HP remains the default",
    run() {
      const result = simulateCombat({
        player: {
          id: "hero",
          hp: 100,
          attack: 20,
          speed: 20,
          targetId: "already-dead",
          skills: [],
        },
        enemies: [
          { id: "already-dead", hp: 0, maxHp: 10 },
          { id: "healthy", hp: 15, maxHp: 15, attack: 0, speed: 1 },
          { id: "weak", hp: 5, maxHp: 15, attack: 0, speed: 1 },
        ],
        seed: "retarget",
        config: { damageVariance: 0 },
      });
      const firstHeroAction = actions(result, "hero")[0];
      assert(firstHeroAction.targetIds[0] === "weak");
      assert(firstHeroAction.retargetedFrom === "already-dead");
      const heroTargets = actions(result, "hero").map((entry) => entry.targetIds[0]);
      assert(heroTargets.includes("healthy"), "hero should select another live enemy after the first dies");
      assert(selectTarget([
        { id: "x", hp: 8, attack: 99 },
        { id: "y", hp: 3, attack: 1 },
      ]).id === "y");
    },
  },
  {
    name: "AoE is one grouped action, kills every target, and sums every reward",
    run() {
      const result = simulateCombat({
        player: {
          id: "hero",
          hp: 100,
          attack: 100,
          speed: 100,
          skills: [{ id: "sweep", name: "Sweep", type: "aoe", multiplier: 2, cooldown: 0 }],
        },
        enemies: [1, 2, 3].map((index) => ({
          id: `enemy-${index}`,
          name: `Enemy ${index}`,
          hp: 20,
          maxHp: 20,
          speed: 1,
          rewards: { experience: index, gold: index * 2 },
        })),
        seed: "aoe",
        config: { damageVariance: 0 },
      });
      const heroActions = actions(result, "hero");
      assert(heroActions.length === 1, "battle must end before an enemy can act");
      assert(heroActions[0].actionType === "aoe");
      assert(heroActions[0].targets.length === 3);
      assert(result.logs.filter((entry) => entry.type === "action").length === 1);
      assert(result.victory && result.enemies.every((enemy) => !enemy.alive));
      assert(result.rewards.experience === 6 && result.rewards.gold === 12);
      assert(result.rewards.defeatedEnemyIds.length === 3);
    },
  },
  {
    name: "successful hits respect the minimum damage floor under extreme defense",
    run() {
      const roll = calculateDamage(
        { attack: 0, critChance: 0, critDamage: 1.5, damageMultiplier: 1 },
        { defense: Number.MAX_VALUE, dodgeChance: 0, damageReduction: 1 },
        { id: "tap", type: "single", multiplier: 1, flatDamage: 0, canCrit: true },
        createSeededRng("floor"),
        { damageVariance: 0, minDamage: 1 },
      );
      assert(roll.damage === 1, `expected one damage, got ${roll.damage}`);
      assert(Number.isFinite(roll.damage));
    },
  },
  {
    name: "skill cooldowns fall back to basic attacks for the full wait",
    run() {
      const result = simulateCombat({
        player: {
          id: "hero",
          hp: 1_000,
          attack: 1,
          speed: 20,
          skills: [{ id: "heavy", name: "Heavy", type: "single", multiplier: 2, cooldown: 2 }],
        },
        enemies: [{ id: "target", hp: 1_000, attack: 0, defense: 0, speed: 1 }],
        seed: "cooldown",
        config: { maxRounds: 4, damageVariance: 0 },
      });
      const used = actions(result, "hero").map((entry) => entry.skillId);
      assert(used.join(",") === "heavy,basic_attack,basic_attack,heavy", used.join(","));
    },
  },
  {
    name: "guard is prioritized at low health and reduces incoming damage",
    run() {
      const result = simulateCombat({
        player: {
          id: "hero",
          hp: 30,
          maxHp: 100,
          attack: 1,
          speed: 20,
          skills: ["block"],
        },
        enemies: [{ id: "brute", hp: 500, attack: 60, defense: 0, speed: 1 }],
        seed: "guard",
        config: { maxRounds: 1, damageVariance: 0 },
      });
      const heroAction = actions(result, "hero")[0];
      const enemyAction = actions(result, "brute")[0];
      assert(heroAction.actionType === "guard");
      assert(enemyAction.damage < 60, `guarded damage was ${enemyAction.damage}`);
      assert(enemyAction.reduction > 0.5);
    },
  },
  {
    name: "empty waves and already-dead players end immediately",
    run() {
      const empty = simulateCombat({
        player: { id: "hero", hp: "NaN", maxHp: undefined, attack: undefined },
        enemies: [],
        seed: "empty",
      });
      assert(empty.victory && empty.rounds === 0);
      assert(Number.isFinite(empty.player.hp) && empty.player.hp >= 0);
      assert(actions(empty).length === 0);

      const dead = simulateCombat({
        player: { id: "hero", hp: -5, maxHp: 100 },
        enemies: [{ id: "enemy", hp: 10 }],
        seed: "dead",
      });
      assert(!dead.victory && dead.reason === "player-defeated" && dead.rounds === 0);
      assert(actions(dead).length === 0);
    },
  },
  {
    name: "nested stats, skill ids, resource shortage, and target strategy aliases work",
    run() {
      const result = simulateCombat({
        player: {
          id: "hero",
          stats: { maxHp: 100, hp: 100, attack: 100, defense: 0, speed: 50 },
          resource: 0,
          skills: [
            { id: "expensive", type: "single", multiplier: 10, manaCost: 20 },
          ],
        },
        enemies: [
          { id: "weak", stats: { maxHp: 20, hp: 20, attack: 1, speed: 1 } },
          { id: "threat", stats: { maxHp: 20, hp: 20, attack: 99, speed: 1 } },
        ],
        seed: "aliases",
        config: { combat: { targetStrategy: "highestAttack", damageVariance: 0 } },
      });
      const first = actions(result, "hero")[0];
      assert(first.skillId === "basic_attack", "resource-starved skills must fall back to basic");
      assert(first.targetIds[0] === "threat", "highestAttack strategy alias was ignored");
    },
  },
  {
    name: "game CONFIG aliases and per-skill AI thresholds are honored",
    run() {
      const result = simulateCombat({
        player: {
          id: "hero",
          stats: { maxHp: 100, hp: 100, attack: 100, speed: 50 },
          skills: ["sweep"],
        },
        enemies: [
          { id: "a", stats: { maxHp: 10, hp: 10, speed: 1 } },
          { id: "b", stats: { maxHp: 10, hp: 10, speed: 1 } },
        ],
        seed: "config-shape",
        config: {
          skills: {
            sweep: {
              id: "sweep",
              name: "Sweep",
              type: "aoe",
              multiplier: 0.8,
              cooldown: 0,
              minimumTargets: 2,
            },
          },
          combat: {
            randomVariance: 0,
            baseCritDamage: 2,
            aoeMinimumTargets: 4,
          },
        },
      });
      assert(actions(result, "hero")[0].skillId === "sweep");

      const critical = calculateDamage(
        { attack: 10, critChance: 1, damageMultiplier: 1 },
        { defense: 0, dodgeChance: 0, damageReduction: 0 },
        { id: "hit", type: "single", multiplier: 1 },
        createSeededRng("critical"),
        { combat: { randomVariance: 0, baseCritDamage: 2 } },
      );
      assert(critical.critical && critical.damage === 20, `critical damage was ${critical.damage}`);
    },
  },
  {
    name: "configured id tie-break and player death both produce immediate deterministic events",
    run() {
      const result = simulateCombat({
        player: { id: "z-hero", hp: 10, maxHp: 10, attack: 100, speed: 10, skills: [] },
        enemies: [{ id: "a-enemy", hp: 10, maxHp: 10, attack: 100, speed: 10 }],
        seed: "id-tie",
        config: { combat: { speedTieBreaker: "id", randomVariance: 0 } },
      });
      assert(actions(result)[0].actorId === "a-enemy");
      assert(result.reason === "player-defeated" && result.rounds === 1);
      const death = result.logs.find((entry) => entry.type === "defeat");
      assert(death?.targetIds[0] === "z-hero", "player death must be a structured log event");
      assert(actions(result, "z-hero").length === 0, "dead player must not take its queued turn");
    },
  },
  {
    name: "mage AI uses shield, fireball, and chain lightning for their intended situations",
    run() {
      const mage = createHeroCombatant(createHeroForClass("mage"));
      const enemies = (count) => Array.from({ length: count }, (_, index) => ({
        id: `mage-target-${index}`,
        hp: 10_000,
        maxHp: 10_000,
        attack: 0,
        defense: 0,
        speed: 1,
      }));
      const run = (player, count, seed) => simulateCombat({
        player,
        enemies: enemies(count),
        seed,
        config: { ...CONFIG, combat: { ...CONFIG.combat, maxRounds: 1, randomVariance: 0 } },
      });

      const single = run(mage, 1, "mage-single");
      assert(actions(single, mage.id)[0]?.skillId === "fireball");

      const group = run(mage, 3, "mage-group");
      assert(actions(group, mage.id)[0]?.skillId === "chain_lightning");

      const lowHealth = {
        ...mage,
        stats: { ...mage.stats, hp: Math.floor(mage.stats.maxHp * 0.4) },
      };
      const guarded = run(lowHealth, 3, "mage-shield");
      assert(actions(guarded, mage.id)[0]?.skillId === "mana_shield");
    },
  },
  {
    name: "warrior single-target and AoE builds change automatic skill choice",
    run() {
      const makeEnemies = () => [0, 1, 2].map((index) => ({
        id: `build-target-${index}`,
        hp: 100_000,
        maxHp: 100_000,
        attack: 0,
        speed: 1,
      }));
      const firstSkill = (hero, seed) => {
        const player = createHeroCombatant(hero);
        const result = simulateCombat({
          player,
          enemies: makeEnemies(),
          seed,
          config: { ...CONFIG, combat: { ...CONFIG.combat, maxRounds: 1, randomVariance: 0 } },
        });
        return actions(result, player.id)[0]?.skillId;
      };
      const heavy = createHeroForClass("warrior");
      heavy.skillLevels.heavy_strike = CONFIG.skills.heavy_strike.leveling.maxLevel;
      const whirlwind = createHeroForClass("warrior");
      whirlwind.skillLevels.whirlwind = CONFIG.skills.whirlwind.leveling.maxLevel;

      assert(firstSkill(heavy, "heavy-build") === "heavy_strike");
      assert(firstSkill(whirlwind, "whirlwind-build") === "whirlwind");
    },
  },
];
