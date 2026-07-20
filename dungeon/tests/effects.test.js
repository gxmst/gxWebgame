import { CONFIG } from "../js/config.js";
import {
  calculateDamage,
  createSeededRng,
  simulateCombat,
} from "../js/combat.js";
import { createEnemyWave, getFloor } from "../js/dungeon.js";
import { generateLoot } from "../js/loot.js";
import {
  createHeroCombatant,
  createHeroForClass,
  equipItem,
  getHeroStats,
} from "../js/hero.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

const actions = (result, actorId) => result.logs.filter((entry) =>
  entry.type === "action" && (actorId === undefined || entry.actorId === actorId));

export const tests = [
  {
    name: "lifesteal heals the attacker and is reported in logs and statistics",
    run() {
      const result = simulateCombat({
        player: {
          id: "drainer",
          hp: 50,
          maxHp: 100,
          attack: 30,
          speed: 100,
          lifesteal: 0.5,
          skills: [],
        },
        enemies: [{ id: "sack", hp: 200, maxHp: 200, attack: 0, defense: 0, speed: 1 }],
        seed: "lifesteal",
        config: { maxRounds: 2, damageVariance: 0 },
      });
      const first = actions(result, "drainer")[0];
      assert(first.lifestealHealing > 0, "lifesteal amount must be logged");
      assert(first.message.includes("吸血"), first.message);
      assert(result.statistics.lifestealHealing > 0);
      assert(result.statistics.playerHealing >= result.statistics.lifestealHealing);
      const heroHp = first.snapshot.player.hp;
      assert(heroHp > 50, `attacker should heal above its starting hp, got ${heroHp}`);
    },
  },
  {
    name: "thorns reflects true damage and can defeat the attacker",
    run() {
      const result = simulateCombat({
        player: { id: "reckless", hp: 5, maxHp: 100, attack: 10, speed: 100, skills: [] },
        enemies: [{ id: "bramble", hp: 500, maxHp: 500, attack: 0, defense: 0, speed: 1, thorns: 0.6 }],
        seed: "thorns",
        config: { maxRounds: 3, damageVariance: 0 },
      });
      assert(!result.victory && result.reason === "player-defeated");
      const first = actions(result, "reckless")[0];
      assert(first.thornsDamage >= 5, `expected lethal reflection, got ${first.thornsDamage}`);
      assert(first.message.includes("荆棘"), first.message);
      assert(result.logs.some((entry) =>
        entry.type === "defeat" && entry.targetIds.includes("reckless")));
      assert(result.statistics.playerDamageTaken >= first.thornsDamage);
    },
  },
  {
    name: "armor penetration ignores the configured share of defense",
    run() {
      const flat = () => 0.5;
      const base = calculateDamage(
        { attack: 100, critChance: 0 },
        { defense: 100, dodgeChance: 0 },
        { id: "hit", type: "single", multiplier: 1 },
        flat,
        { damageVariance: 0 },
      );
      const pierced = calculateDamage(
        { attack: 100, critChance: 0, armorPenetration: 0.5 },
        { defense: 100, dodgeChance: 0 },
        { id: "hit", type: "single", multiplier: 1 },
        flat,
        { damageVariance: 0 },
      );
      assert(base.damage === 50, `plain damage was ${base.damage}`);
      assert(pierced.damage === 75, `pierced damage was ${pierced.damage}`);
    },
  },
  {
    name: "multi-hit chance appends exactly one extra strike within the hit cap",
    run() {
      const result = simulateCombat({
        player: {
          id: "striker",
          hp: 100,
          maxHp: 100,
          attack: 10,
          speed: 100,
          multiHitChance: 1,
          skills: [],
        },
        enemies: [{ id: "post", hp: 10_000, maxHp: 10_000, attack: 0, defense: 0, speed: 1 }],
        seed: "double-strike",
        config: { maxRounds: 1, damageVariance: 0, effects: { maxMultiHitChance: 1 } },
      });
      const first = actions(result, "striker")[0];
      assert(first.extraStrike === true, "extra strike must be flagged");
      assert(first.hitCount === 2, `expected 2 hits, got ${first.hitCount}`);
      assert(first.hits[1].extra === true);
      assert(first.message.includes("连击"), first.message);
      assert(result.statistics.extraStrikes === 1);

      const capped = simulateCombat({
        player: {
          id: "burst",
          hp: 100,
          maxHp: 100,
          attack: 10,
          speed: 100,
          multiHitChance: 1,
          skills: [{ id: "volley", name: "Volley", type: "single", multiplier: 0.2, hitCount: 12, cooldown: 0 }],
        },
        enemies: [{ id: "post", hp: 100_000, maxHp: 100_000, attack: 0, defense: 0, speed: 1 }],
        seed: "capped-strike",
        config: { maxRounds: 1, maxHitsPerAction: 12, damageVariance: 0, effects: { maxMultiHitChance: 1 } },
      });
      const volley = actions(capped, "burst")[0];
      assert(volley.hitCount === 12, "hit cap must also bound extra strikes");
      assert(volley.extraStrike !== true);
    },
  },
  {
    name: "burn applies on hit, ticks on the victim's turn, and can finish it",
    run() {
      const result = simulateCombat({
        player: {
          id: "igniter",
          hp: 100,
          maxHp: 100,
          attack: 10,
          speed: 100,
          burnChance: 1,
          skills: [],
        },
        enemies: [{ id: "tinder", hp: 12, maxHp: 12, attack: 0, defense: 0, speed: 1 }],
        seed: "burn-kill",
        config: { maxRounds: 5, damageVariance: 0, effects: { maxBurnChance: 1 } },
      });
      const first = actions(result, "igniter")[0];
      assert(first.burnAppliedCount === 1, "burn application must be logged");
      const tick = result.logs.find((entry) => entry.type === "status");
      assert(tick, "burn tick must produce a status log entry");
      assert(tick.damage === 2, `burn should finish the last 2 hp, got ${tick.damage}`);
      assert(result.victory && result.rounds === 1, "burn kill should end the fight in round one");
      assert(result.statistics.burnDamage === 2);
      assert(result.logs.filter((entry) =>
        entry.type === "defeat" && entry.targetIds.includes("tinder")).length === 1);
    },
  },
  {
    name: "effect-heavy battles stay deterministic and never mutate inputs",
    run() {
      const player = {
        id: "hybrid",
        hp: 400,
        maxHp: 400,
        attack: 25,
        speed: 90,
        lifesteal: 0.2,
        burnChance: 0.5,
        multiHitChance: 0.4,
        armorPenetration: 0.3,
        critChance: 0.3,
        skills: [],
      };
      const enemies = [0, 1, 2].map((index) => ({
        id: `thornling-${index}`,
        hp: 80,
        maxHp: 80,
        attack: 8,
        defense: 6,
        speed: 20 + index,
        thorns: 0.25,
      }));
      const before = JSON.stringify({ player, enemies });
      const first = simulateCombat({ player, enemies, seed: "effects-mix", config: CONFIG });
      const second = simulateCombat({ player, enemies, seed: "effects-mix", config: CONFIG });
      assert(JSON.stringify(first) === JSON.stringify(second));
      assert(JSON.stringify({ player, enemies }) === before, "effects must not mutate inputs");
      assert(Number.isFinite(first.statistics.playerDamageDealt));
      assert(first.statistics.playerDamageDealt > 0);
    },
  },
  {
    name: "elites spawn deterministically with prefix, budget, and boosted rewards",
    run() {
      const tuning = CONFIG.dungeon.elites;
      const prefixes = tuning.modifiers.map((modifier) => modifier.prefix);
      for (let seed = 0; seed < 30; seed += 1) {
        const shallow = createEnemyWave(2, `elite-shallow-${seed}`);
        assert(shallow.enemies.every((enemy) => enemy.isElite !== true),
          "floors below minFloor must never spawn elites");
      }

      let eliteSeen = null;
      for (let seed = 0; seed < 80 && !eliteSeen; seed += 1) {
        const wave = createEnemyWave(33, `elite-hunt-${seed}`);
        const elites = wave.enemies.filter((enemy) => enemy.isElite === true);
        assert(elites.length <= tuning.maxPerWave, "elite budget per wave exceeded");
        for (const elite of elites) {
          assert(prefixes.some((prefix) => elite.name.startsWith(prefix)), elite.name);
          assert(elite.stats.hp === elite.stats.maxHp);
          assert(typeof elite.eliteModifierId === "string" && elite.eliteModifierId.length > 0);
        }
        if (elites.length > 0) eliteSeen = { wave, seed };
      }
      assert(eliteSeen, "no elite found on floor 33 across 80 seeds");

      const repeat = createEnemyWave(33, `elite-hunt-${eliteSeen.seed}`);
      assert(JSON.stringify(repeat) === JSON.stringify(eliteSeen.wave),
        "elite waves must be reproducible");

      const elite = eliteSeen.wave.enemies.find((enemy) => enemy.isElite);
      const normal = eliteSeen.wave.enemies.find((enemy) =>
        !enemy.isElite && enemy.templateId === elite.templateId);
      if (normal) {
        assert(elite.rewards.experience > normal.rewards.experience,
          "elites must reward more experience than同层同种普通怪");
      }
    },
  },
  {
    name: "boss bands change by depth while adjacent deep bosses stay smooth",
    run() {
      assert(getFloor(5).enemyPool[0] === "crypt_warden");
      assert(getFloor(15).enemyPool[0] === "crypt_warden");
      assert(getFloor(20).enemyPool[0] === "plague_herald");
      assert(getFloor(50).enemyPool[0] === "flame_tyrant");
      assert(getFloor(80).enemyPool[0] === "void_sovereign");
      assert(getFloor(95).enemyPool[0] === getFloor(100).enemyPool[0],
        "the deepest two boss floors must share a template for smooth scaling");

      const wave = createEnemyWave(20, "boss-band-20");
      const boss = wave.enemies[0];
      assert(boss.templateId === "plague_herald");
      assert(boss.skills.includes("boss_smash") && boss.skills.includes("boss_devour"));
      assert(boss.stats.lifesteal > 0, "plague herald should keep its lifesteal trait");

      const hero = createHeroCombatant(createHeroForClass("warrior"));
      const result = simulateCombat({
        player: { ...hero, stats: { ...hero.stats, hp: 100_000, maxHp: 100_000, attack: 5_000 } },
        enemies: wave.enemies,
        seed: "boss-fight-20",
        config: CONFIG,
      });
      assert(result.victory, "a vastly stronger hero must still defeat the boss");
    },
  },
  {
    name: "loot honors minimum rarity floors and rolls live legendary effects",
    run() {
      assert(CONFIG.loot.enableLegendaryEffects === true, "legendary effects must be live");
      for (let seed = 0; seed < 12; seed += 1) {
        const item = generateLoot(1, `rarity-floor-${seed}`, null, { minimumRarity: "rare" });
        assert(["rare", "legendary"].includes(item.rarity), item.rarity);
      }
      const plain = generateLoot(1, "rarity-floor-3");
      const floored = generateLoot(1, "rarity-floor-3", null, { minimumRarity: "rare" });
      assert(plain.id !== floored.id || plain.rarity === floored.rarity,
        "floored roll must stay deterministic");

      let legendary = null;
      for (let seed = 0; seed < 300 && !legendary; seed += 1) {
        const item = generateLoot(90, `legendary-hunt-${seed}`);
        if (item.rarity === "legendary") legendary = item;
      }
      assert(legendary, "no legendary dropped on floor 90 across 300 seeds");
      assert(legendary.effect && CONFIG.legendaryEffects[legendary.effect.id],
        "legendary items must roll a known effect");
    },
  },
  {
    name: "hero stats aggregate legendary effects into combat and power",
    run() {
      const hero = createHeroForClass("warrior");
      const baseline = getHeroStats(hero);
      const weapon = {
        id: "test-ember-blade",
        name: "灼热的试验之刃",
        slot: "weapon",
        rarity: "legendary",
        level: 10,
        baseStats: { attack: 20 },
        affixes: [],
        effect: { id: "burning", type: "burning", value: 0.18 },
      };
      const armed = equipItem(hero, weapon);
      const stats = getHeroStats(armed);
      assert(stats.burnChance === 0.18, `burn chance was ${stats.burnChance}`);
      assert(stats.power > baseline.power, "legendary effect must raise power");

      const combatant = createHeroCombatant(armed);
      const result = simulateCombat({
        player: combatant,
        enemies: [{ id: "dummy", hp: 10, maxHp: 10, attack: 0, defense: 0, speed: 1 }],
        seed: "hero-burn",
        config: CONFIG,
      });
      assert(result.player.burnChance === 0.18, "combat unit must carry the burn chance");
    },
  },
];
