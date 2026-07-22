import { CONFIG } from "../js/config.js";
import { simulateCombat } from "../js/combat.js";
import { applyAutoAllocation, createHeroCombatant, createHeroForClass, getHeroStats } from "../js/hero.js";

const samples = positiveInteger(process.argv[2], 80);
const scenarios = [
  { id: "midgame", enemyCount: 3, hp: 850, attack: 72, defense: 58 },
  { id: "boss", enemyCount: 1, hp: 3200, attack: 105, defense: 92 },
];

const report = [];
for (const classId of Object.keys(CONFIG.classes)) {
  const hero = buildReferenceHero(classId);
  const stats = getHeroStats(hero);
  const row = { classId, power: stats.power, maxHp: stats.maxHp, attack: stats.attack, defense: stats.defense, scenarios: {} };
  for (const scenario of scenarios) {
    let wins = 0; let rounds = 0; let damage = 0; let remainingHp = 0;
    for (let index = 0; index < samples; index += 1) {
      const result = simulateCombat({
        player: createHeroCombatant(hero),
        enemies: createEnemies(scenario),
        seed: `balance|${scenario.id}|${classId}|${index}`,
        config: { ...CONFIG, combat: { ...CONFIG.combat, maxRounds: 36 } },
      });
      wins += result.victory ? 1 : 0;
      rounds += result.rounds;
      damage += result.statistics.playerDamageDealt + result.statistics.minionDamageDealt;
      const player = result.finalState?.player;
      remainingHp += player ? Math.max(0, player.hp) / Math.max(1, player.maxHp) : 0;
    }
    row.scenarios[scenario.id] = {
      winRate: Number((wins / samples).toFixed(3)),
      averageRounds: Number((rounds / samples).toFixed(2)),
      averageDamage: Math.round(damage / samples),
      averageRemainingHp: Number((remainingHp / samples).toFixed(3)),
    };
  }
  report.push(row);
}

console.log(JSON.stringify({ samples, generatedAt: new Date().toISOString(), report }, null, 2));

function buildReferenceHero(classId) {
  let hero = { ...createHeroForClass(classId), level: CONFIG.hero.maxLevel, unspentStatPoints: (CONFIG.hero.maxLevel - 1) * CONFIG.hero.statPointsPerLevel };
  hero = applyAutoAllocation(hero);
  let remaining = CONFIG.skillProgression.investmentCap;
  const skillLevels = { ...hero.skillLevels };
  const skillBranches = {};
  for (const skillId of CONFIG.classes[classId].skills) {
    const skill = CONFIG.skills[skillId];
    if (skill.isBasic) continue;
    const maximumSpend = Math.max(0, (skill.leveling?.maxLevel ?? 1) - (skill.leveling?.initialLevel ?? 1));
    const spent = Math.min(maximumSpend, remaining);
    skillLevels[skillId] = (skill.leveling?.initialLevel ?? 1) + spent;
    remaining -= spent;
    if (skillLevels[skillId] >= 5 && skill.branches?.[0]) skillBranches[skillId] = skill.branches[0].id;
  }
  return { ...hero, skillLevels, skillBranches, unspentSkillPoints: CONFIG.skillProgression.totalPointCap - CONFIG.skillProgression.investmentCap };
}

function createEnemies(scenario) {
  return Array.from({ length: scenario.enemyCount }, (_, index) => ({
    id: `benchmark-${index}`, name: "Benchmark", emoji: "◆", level: 30,
    stats: { maxHp: scenario.hp, hp: scenario.hp, attack: scenario.attack, defense: scenario.defense, speed: 78, critChance: 0.08, critDamage: 1.5, dodgeChance: 0.04, damageMultiplier: 1, damageReduction: 0, lifesteal: 0, thorns: 0, armorPenetration: 0, multiHitChance: 0, burnChance: 0 },
    skills: [CONFIG.skills.enemy_attack], rewards: { experience: 0, gold: 0 },
  }));
}

function positiveInteger(value, fallback) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
