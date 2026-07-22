export function diagnoseDefeat({ heroStats = {}, skillPointState = {}, statistics = {}, floor = {} } = {}) {
  const power = finite(heroStats.power);
  const targetPower = finite(floor.recommendedPower);
  const damage = finite(statistics.playerDamageDealt) + finite(statistics.minionDamageDealt);
  const taken = finite(statistics.playerDamageTaken);
  const healing = finite(statistics.playerHealing);
  const rounds = Math.max(1, finite(statistics.rounds ?? statistics.totalRounds, 1));
  const suggestions = [];

  if (targetPower > 0 && power < targetPower * 0.88) {
    suggestions.push({
      id: "power",
      severity: "high",
      title: "战力低于门槛",
      detail: `当前战力 ${Math.round(power)}，建议达到约 ${Math.round(targetPower)} 后再挑战。`,
      action: "优先刷上一阶段 Boss、商店和野外精英，替换武器与最低战力部位。",
    });
  }
  if (damage / rounds < Math.max(25, targetPower * 0.055)) {
    suggestions.push({
      id: "output", severity: "medium", title: "输出不足",
      detail: "战斗拖得太久，敌人的防御或回复逐渐压过了你的伤害。",
      action: "升级核心伤害技能，选择伤害派生，并优先提升武器、暴击或破甲。",
    });
  }
  if (taken > finite(heroStats.maxHp) * 1.35 && healing < taken * 0.18) {
    suggestions.push({
      id: "survival", severity: "medium", title: "生存不足",
      detail: "承受伤害远高于生命池，恢复和减伤覆盖不够。",
      action: "补生命、防御和减伤装备，或投入护盾、格挡、闪避、召唤与恢复技能。",
    });
  }
  if (finite(skillPointState.available) > 0 || finite(skillPointState.spent) < 12) {
    suggestions.push({
      id: "build", severity: "low", title: "构筑尚未成形",
      detail: `仍有 ${Math.round(finite(skillPointState.available))} 点可以投入当前构筑。`,
      action: "先把一个主力技能升到 Lv.5 并选择派生，再补第二个核心技能。",
    });
  }
  if (suggestions.length === 0) {
    suggestions.push({
      id: "refine", severity: "low", title: "接近通关",
      detail: "你的基础构筑已经达到本层要求，失败更可能来自装备词条或技能路线不匹配。",
      action: "比较战报中的最大承伤和输出，重铸最弱部位或尝试另一条互斥派生。",
    });
  }
  return {
    primary: suggestions[0],
    suggestions: suggestions.slice(0, 3),
    powerRatio: targetPower > 0 ? power / targetPower : 1,
  };
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
}
