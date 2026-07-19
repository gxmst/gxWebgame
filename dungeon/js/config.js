/**
 * 文字地牢的集中配置。这里仅保存数据和数值，不读取 DOM，也不读写存档。
 * 调平衡时优先修改本文件，其他模块不应散落同一份“魔法数字”。
 */

export const STAT_KEYS = Object.freeze([
  "strength",
  "agility",
  "intelligence",
  "vitality",
]);

export const EQUIPMENT_SLOT_IDS = Object.freeze([
  "weapon",
  "helmet",
  "armor",
  "accessory",
]);

export const RARITY_IDS = Object.freeze([
  "common",
  "uncommon",
  "rare",
  "legendary",
]);

const EQUIPMENT_SLOTS = {
  weapon: { id: "weapon", name: "武器", emoji: "⚔️" },
  helmet: { id: "helmet", name: "头盔", emoji: "⛑️" },
  armor: { id: "armor", name: "护甲", emoji: "🛡️" },
  accessory: { id: "accessory", name: "饰品", emoji: "💎" },
};

const SKILLS = {
  basic_attack: {
    id: "basic_attack",
    name: "普通攻击",
    emoji: "⚔️",
    type: "single",
    multiplier: 1,
    cooldown: 0,
    resourceCost: 0,
    isBasic: true,
    classIds: ["warrior"],
    leveling: { initialLevel: 1, maxLevel: 1, perLevel: {} },
  },
  heavy_strike: {
    id: "heavy_strike",
    name: "重击",
    emoji: "💥",
    type: "single",
    multiplier: 1.75,
    cooldown: 2,
    resourceCost: 0,
    classIds: ["warrior"],
    leveling: {
      initialLevel: 1,
      maxLevel: 10,
      perLevel: { multiplier: 0.11 },
      milestones: [{ level: 7, add: { cooldown: -1 } }],
    },
  },
  whirlwind: {
    id: "whirlwind",
    name: "旋风斩",
    emoji: "🌀",
    type: "aoe",
    multiplier: 0.72,
    cooldown: 3,
    resourceCost: 0,
    minimumTargets: 3,
    classIds: ["warrior"],
    leveling: {
      initialLevel: 1,
      maxLevel: 10,
      perLevel: { multiplier: 0.04 },
      milestones: [{ level: 6, add: { minimumTargets: -1 } }],
    },
  },
  block: {
    id: "block",
    name: "格挡",
    emoji: "🛡️",
    type: "guard",
    multiplier: 0,
    cooldown: 4,
    resourceCost: 0,
    reduction: 0.45,
    duration: 2,
    triggerBelowHpRatio: 0.48,
    classIds: ["warrior"],
    leveling: {
      initialLevel: 1,
      maxLevel: 10,
      perLevel: { reduction: 0.018 },
      milestones: [{ level: 8, add: { cooldown: -1 } }],
    },
  },
  arcane_bolt: {
    id: "arcane_bolt",
    name: "奥术弹",
    emoji: "🔹",
    type: "single",
    multiplier: 1,
    cooldown: 0,
    resourceCost: 0,
    isBasic: true,
    classIds: ["mage"],
    leveling: { initialLevel: 1, maxLevel: 1, perLevel: {} },
  },
  fireball: {
    id: "fireball",
    name: "火球术",
    emoji: "🔥",
    type: "single",
    multiplier: 1.9,
    cooldown: 2,
    resourceCost: 0,
    classIds: ["mage"],
    leveling: {
      initialLevel: 1,
      maxLevel: 10,
      perLevel: { multiplier: 0.12 },
      milestones: [{ level: 8, add: { cooldown: -1 } }],
    },
  },
  chain_lightning: {
    id: "chain_lightning",
    name: "连锁闪电",
    emoji: "⚡",
    type: "aoe",
    multiplier: 0.8,
    cooldown: 3,
    resourceCost: 0,
    minimumTargets: 2,
    classIds: ["mage"],
    leveling: {
      initialLevel: 1,
      maxLevel: 10,
      perLevel: { multiplier: 0.05 },
      milestones: [{ level: 7, add: { cooldown: -1 } }],
    },
  },
  mana_shield: {
    id: "mana_shield",
    name: "奥术护盾",
    emoji: "🔮",
    type: "guard",
    multiplier: 0,
    cooldown: 5,
    resourceCost: 0,
    reduction: 0.52,
    duration: 2,
    triggerBelowHpRatio: 0.55,
    classIds: ["mage"],
    leveling: {
      initialLevel: 1,
      maxLevel: 10,
      perLevel: { reduction: 0.012 },
      milestones: [{ level: 7, add: { cooldown: -1 } }],
    },
  },
  enemy_attack: {
    id: "enemy_attack",
    name: "攻击",
    emoji: "🗡️",
    type: "single",
    multiplier: 1,
    cooldown: 0,
    resourceCost: 0,
  },
};

const RARITIES = {
  common: {
    id: "common",
    name: "普通",
    color: "#e5e7eb",
    multiplier: 1,
    minAffixes: 0,
    maxAffixes: 1,
  },
  uncommon: {
    id: "uncommon",
    name: "优秀",
    color: "#60a5fa",
    multiplier: 1.18,
    minAffixes: 1,
    maxAffixes: 2,
  },
  rare: {
    id: "rare",
    name: "稀有",
    color: "#c084fc",
    multiplier: 1.42,
    minAffixes: 2,
    maxAffixes: 3,
  },
  legendary: {
    id: "legendary",
    name: "传说",
    color: "#fb923c",
    multiplier: 1.78,
    minAffixes: 3,
    maxAffixes: 4,
  },
};

const AFFIXES = {
  strength: {
    id: "strength",
    name: "蛮力",
    stat: "strength",
    min: 1,
    max: 4,
    perFloor: 0.5,
    minimumRarity: "uncommon",
  },
  agility: {
    id: "agility",
    name: "迅捷",
    stat: "agility",
    min: 1,
    max: 4,
    perFloor: 0.45,
    minimumRarity: "uncommon",
  },
  intelligence: {
    id: "intelligence",
    name: "睿智",
    stat: "intelligence",
    min: 1,
    max: 4,
    perFloor: 0.45,
    minimumRarity: "uncommon",
  },
  vitality: {
    id: "vitality",
    name: "坚韧",
    stat: "vitality",
    min: 1,
    max: 4,
    perFloor: 0.55,
    minimumRarity: "common",
  },
  maxHp: {
    id: "maxHp",
    name: "生命",
    stat: "maxHp",
    min: 8,
    max: 18,
    perFloor: 3,
    minimumRarity: "common",
  },
  attack: {
    id: "attack",
    name: "锋锐",
    stat: "attack",
    min: 2,
    max: 5,
    perFloor: 0.9,
    minimumRarity: "common",
    slots: ["weapon", "accessory"],
  },
  defense: {
    id: "defense",
    name: "守护",
    stat: "defense",
    min: 2,
    max: 5,
    perFloor: 0.8,
    minimumRarity: "common",
    slots: ["helmet", "armor", "accessory"],
  },
  critChance: {
    id: "critChance",
    name: "致命",
    stat: "critChance",
    min: 0.015,
    max: 0.04,
    perFloor: 0.002,
    decimals: 3,
    format: "percent",
    minimumRarity: "rare",
  },
  critDamage: {
    id: "critDamage",
    name: "毁灭",
    stat: "critDamage",
    min: 0.08,
    max: 0.2,
    perFloor: 0.01,
    decimals: 3,
    format: "percent",
    minimumRarity: "rare",
  },
  speed: {
    id: "speed",
    name: "疾风",
    stat: "speed",
    min: 2,
    max: 6,
    perFloor: 0.6,
    minimumRarity: "rare",
  },
  damagePercent: {
    id: "damagePercent",
    name: "狂怒",
    stat: "damagePercent",
    min: 0.025,
    max: 0.07,
    perFloor: 0.004,
    decimals: 3,
    format: "percent",
    minimumRarity: "rare",
  },
  physicalDamagePercent: {
    id: "physicalDamagePercent",
    name: "战意",
    stat: "physicalDamagePercent",
    min: 0.025,
    max: 0.065,
    perFloor: 0.0035,
    decimals: 3,
    format: "percent",
    minimumRarity: "rare",
    classIds: ["warrior"],
    slots: ["weapon", "accessory"],
  },
  magicDamagePercent: {
    id: "magicDamagePercent",
    name: "奥术",
    stat: "magicDamagePercent",
    min: 0.03,
    max: 0.075,
    perFloor: 0.004,
    decimals: 3,
    format: "percent",
    minimumRarity: "rare",
    classIds: ["mage"],
    slots: ["weapon", "accessory"],
  },
  damageReduction: {
    id: "damageReduction",
    name: "壁垒",
    stat: "damageReduction",
    min: 0.015,
    max: 0.05,
    perFloor: 0.003,
    decimals: 3,
    format: "percent",
    minimumRarity: "rare",
    slots: ["helmet", "armor", "accessory"],
  },
};

const LEGENDARY_EFFECTS = {
  burning: {
    id: "burning",
    name: "余烬",
    description: "攻击有概率使目标燃烧。",
    type: "burning",
    value: 0.18,
  },
  lifesteal: {
    id: "lifesteal",
    name: "饮血",
    description: "造成伤害时回复少量生命。",
    type: "lifesteal",
    value: 0.06,
  },
  thorns: {
    id: "thorns",
    name: "荆棘",
    description: "受到攻击时反弹部分伤害。",
    type: "thorns",
    value: 0.12,
  },
  armor_break: {
    id: "armor_break",
    name: "破甲",
    description: "攻击忽略目标部分防御。",
    type: "armorPenetration",
    value: 0.15,
  },
  double_strike: {
    id: "double_strike",
    name: "连击",
    description: "攻击有小概率追加一次攻击。",
    type: "multiHitChance",
    value: 0.12,
  },
};

const ENEMY_TEMPLATES = {
  bone_rat: {
    id: "bone_rat",
    name: "骸骨鼠",
    emoji: "🐀",
    stats: { maxHp: 38, attack: 8, defense: 2, speed: 78, critChance: 0.04 },
  },
  skeleton: {
    id: "skeleton",
    name: "骷髅兵",
    emoji: "💀",
    stats: { maxHp: 52, attack: 10, defense: 4, speed: 56, critChance: 0.05 },
  },
  cultist: {
    id: "cultist",
    name: "地穴信徒",
    emoji: "🧙",
    stats: { maxHp: 46, attack: 12, defense: 3, speed: 64, critChance: 0.07 },
  },
  ghoul: {
    id: "ghoul",
    name: "腐尸",
    emoji: "🧟",
    stats: { maxHp: 70, attack: 13, defense: 7, speed: 45, critChance: 0.04 },
  },
  crypt_guard: {
    id: "crypt_guard",
    name: "墓穴守卫",
    emoji: "👹",
    stats: { maxHp: 82, attack: 15, defense: 9, speed: 50, critChance: 0.06 },
  },
  crypt_warden: {
    id: "crypt_warden",
    name: "地穴领主",
    emoji: "👑",
    boss: true,
    stats: { maxHp: 760, attack: 50, defense: 28, speed: 62, critChance: 0.08 },
  },
};

const FLOOR_MAX = 100;
const FLOOR_THEMES = [
  { name: "地穴", emoji: "🕯️", description: "潮湿石阶向黑暗深处延伸，碎骨在脚边轻轻作响。", pool: ["bone_rat", "skeleton"] },
  { name: "白骨回廊", emoji: "💀", description: "骨墙之间回荡着甲片摩擦声，巡逻者已察觉脚步。", pool: ["bone_rat", "skeleton", "cultist"] },
  { name: "腐朽墓室", emoji: "⚰️", description: "棺椁半开，腐气与低语一同从墓室深处涌来。", pool: ["skeleton", "cultist", "ghoul"] },
  { name: "守卫大厅", emoji: "🛡️", description: "破损军旗悬在穹顶，重甲守卫封死了前路。", pool: ["cultist", "ghoul", "crypt_guard"] },
  { name: "余烬深井", emoji: "🔥", description: "岩缝吐出灼热气息，沉睡的亡骸在火光中苏醒。", pool: ["ghoul", "crypt_guard", "cultist"] },
  { name: "星陨墓窟", emoji: "✨", description: "幽蓝矿脉照亮古老碑文，深处传来沉重的呼吸。", pool: ["skeleton", "crypt_guard", "ghoul"] },
];

function createFloors(maxFloor = FLOOR_MAX) {
  const floors = [];
  const legacy = [
    ["地穴入口", "🕯️", "潮湿石阶向下延伸，骸骨鼠正在烛影间翻动碎石。", 330, [3, 3], ["bone_rat", "skeleton"], 0.9, 1],
    ["白骨回廊", "💀", "两侧骨墙传来甲片摩擦声，巡逻者已经察觉了脚步。", 440, [3, 4], ["bone_rat", "skeleton", "cultist"], 1.08, 1.2],
    ["腐朽墓室", "⚰️", "棺椁半开，腐气与低语一同从墓室深处涌来。", 580, [4, 4], ["skeleton", "cultist", "ghoul"], 1.28, 1.48],
    ["守卫大厅", "🛡️", "破损军旗仍悬在穹顶，重甲守卫封死了王座前路。", 760, [4, 5], ["cultist", "ghoul", "crypt_guard"], 1.52, 1.82],
    ["领主王座", "👑", "王座上的地穴领主苏醒了；这一战需要真正成形的装备。", 980, [1, 1], ["crypt_warden"], 1, 3.4],
  ];
  for (let id = 1; id <= maxFloor; id += 1) {
    const legacyRow = legacy[id - 1];
    const boss = id === 5 || (id > 5 && id % 5 === 0);
    const theme = FLOOR_THEMES[Math.floor((id - 1) / 5) % FLOOR_THEMES.length];
    const scale = 0.9 * (id ** 0.62);
    const rewardScale = 1 + ((id - 1) ** 1.18) * 0.45;
    const recommendedPower = Math.round(330 * id ** 0.95);
    const [minimumEnemies, maximumEnemies] = id < 5 ? legacyRow[4] : [3, 5];
    const definition = {
      id,
      name: legacyRow?.[0] ?? `${theme.name} · ${id}层`,
      emoji: legacyRow?.[1] ?? theme.emoji,
      description: legacyRow?.[2] ?? `${theme.description}这是第 ${id} 层，敌人的装备与意志都更强。`,
      recommendedPower: legacyRow?.[3] ?? recommendedPower,
      enemyCount: boss ? [1, 1] : [minimumEnemies, maximumEnemies],
      enemyPool: boss ? ["crypt_warden"] : (legacyRow?.[5] ?? theme.pool),
      enemyScale: legacyRow?.[6] ?? scale,
      rewardScale: legacyRow?.[7] ?? rewardScale,
      boss,
      bossTier: boss ? Math.max(1, Math.floor(id / 5)) : 0,
    };
    floors.push(definition);
  }
  return floors;
}

const FLOORS = createFloors();

function createRarityWeights(maxFloor = FLOOR_MAX) {
  const start = { common: 68, uncommon: 25, rare: 6.5, legendary: 0.5 };
  const end = { common: 18, uncommon: 38, rare: 32, legendary: 12 };
  return Object.fromEntries(Array.from({ length: maxFloor }, (_, index) => {
    const floor = index + 1;
    const progress = (floor - 1) / Math.max(1, maxFloor - 1);
    const eased = progress ** 0.72;
    return [floor, Object.fromEntries(RARITY_IDS.map((id) => [
      id,
      Math.round((start[id] + (end[id] - start[id]) * eased) * 100) / 100,
    ]))];
  }));
}

const RARITY_WEIGHTS = createRarityWeights();

const PENALTIES = {
  defeat: { experienceLossRate: 0.12, goldLossRate: 0.08 },
  retreat: { experienceLossRate: 0.05, goldLossRate: 0.03 },
};

export const CONFIG = deepFreeze({
  game: {
    title: "文字地牢",
    version: "0.2.0",
  },

  save: {
    key: "gxwebgame.dungeon.save.v1",
    version: 2,
    maxInventoryItems: 60,
  },

  // 四项基础属性及派生属性公式。
  stats: {
    primary: STAT_KEYS,
    maximumValue: 1_000_000,
    baseHp: 70,
    hpPerVitality: 12,
    hpPerLevel: 6,
    baseAttack: 5,
    attackPerStrength: 2,
    attackPerAgility: 0.25,
    attackPerIntelligence: 0.1,
    attackPerLevel: 2,
    baseDefense: 2,
    defensePerVitality: 0.8,
    defensePerStrength: 0.3,
    defensePerLevel: 1,
    baseSpeed: 70,
    speedPerAgility: 2,
    baseCritChance: 0.05,
    critChancePerAgility: 0.005,
    maxCritChance: 0.75,
    baseCritDamage: 1.5,
    baseDodgeChance: 0.01,
    dodgeChancePerAgility: 0.002,
    maxDodgeChance: 0.35,
    maxDamageReduction: 0.75,
    powerWeights: {
      maxHp: 0.32,
      attack: 6.5,
      defense: 4.5,
      speed: 0.35,
      critChance: 120,
      critDamage: 12,
      damagePercent: 120,
      physicalDamagePercent: 130,
      magicDamagePercent: 145,
      damageReduction: 180,
    },
  },

  hero: {
    id: "hero-warrior",
    name: "无名战士",
    classId: "warrior",
    maxLevel: 30,
    startingStats: { strength: 10, agility: 5, intelligence: 2, vitality: 10 },
    startingSkills: ["basic_attack", "heavy_strike", "whirlwind", "block"],
    statPointsPerLevel: 3,
    // 30 级一轮约需 2.3 万经验，推进前 20 层并适量重复刷即可转生。
    experience: { base: 85, growth: 1.115, linear: 16 },
  },

  classes: {
    warrior: {
      id: "warrior",
      name: "战士",
      emoji: "⚔️",
      role: "近战攻守",
      description: "生命和护甲扎实，重击擅长单体爆发，旋风斩负责清场。",
      primaryStat: "strength",
      basicSkillId: "basic_attack",
      startingStats: { strength: 10, agility: 5, intelligence: 2, vitality: 10 },
      skills: ["basic_attack", "heavy_strike", "whirlwind", "block"],
      // 自动加点保持攻防为主，仍留少量敏捷保证速度和暴击成长。
      autoAllocation: { strength: 0.5, vitality: 0.35, agility: 0.15, intelligence: 0 },
      combat: {
        baseHp: 70,
        hpPerVitality: 12,
        hpPerLevel: 6,
        baseAttack: 5,
        attackPerLevel: 2,
        attackPerAttribute: { strength: 2, agility: 0.25, intelligence: 0.1, vitality: 0 },
        baseDefense: 2,
        defensePerVitality: 0.8,
        defensePerStrength: 0.3,
        defensePerLevel: 1,
        baseSpeed: 70,
        speedPerAgility: 2,
      },
    },
    mage: {
      id: "mage",
      name: "法师",
      emoji: "🧙‍♂️",
      role: "远程爆发",
      description: "生命与护甲偏低，以智力驱动高额法术伤害和更频繁的群攻。",
      primaryStat: "intelligence",
      basicSkillId: "arcane_bolt",
      startingStats: { strength: 2, agility: 6, intelligence: 11, vitality: 6 },
      skills: ["arcane_bolt", "fireball", "chain_lightning", "mana_shield"],
      // 智力优先，敏捷维持先手与暴击，体质补足生存。
      autoAllocation: { strength: 0, agility: 0.2, intelligence: 0.55, vitality: 0.25 },
      combat: {
        baseHp: 60,
        hpPerVitality: 9,
        hpPerLevel: 5,
        baseAttack: 7,
        attackPerLevel: 2.2,
        attackPerAttribute: { strength: 0.1, agility: 0.2, intelligence: 2.25, vitality: 0 },
        baseDefense: 1,
        defensePerVitality: 0.55,
        defensePerStrength: 0.08,
        defensePerLevel: 0.72,
        baseSpeed: 78,
        speedPerAgility: 2.1,
      },
    },
  },

  // 每两级给 1 点，单轮不足以点满三条技能，确保构筑有取舍。
  skillProgression: {
    pointEveryLevels: 2,
    pointsPerAward: 1,
    pointsPerPrestige: 3,
    freeReset: true,
  },

  // 转生重置等级和基础属性，保留金币、装备与已通关记录。
  prestige: {
    maxCount: 99,
    combatBonusPerCount: 0.08,
    affectedStats: ["maxHp", "attack", "defense"],
    pointsPerCount: 3,
    resetSkillLevels: true,
    initialFloorCap: 20,
    floorsPerCount: 20,
  },

  equipmentSlots: EQUIPMENT_SLOTS,
  skills: SKILLS,

  combat: {
    maxRounds: 200,
    minDamage: 1,
    defenseCoefficient: 0.55,
    randomVariance: 0.1,
    baseCritDamage: 1.5,
    maxDefenseReduction: 0.75,
    targetStrategy: "lowestHp",
    aoeMinimumTargets: 3,
    aoeMultiplierCap: 1.4,
    aoeUtilityWeight: 0.82,
    buildAwareOffense: true,
    enemyCount: [3, 5],
    speedTieBreaker: "id",
  },

  // 稀有度同时决定基础数值倍率和词条条数。
  rarities: RARITIES,
  rarity: RARITIES,
  rarityOrder: RARITY_IDS,
  affixes: AFFIXES,
  affix: AFFIXES,
  legendaryEffects: LEGENDARY_EFFECTS,

  loot: {
    // 首批只启用可计算的基础属性与词条；传奇特效保留数据结构，后续再接战斗触发。
    enableLegendaryEffects: false,
    // 各层掉率总和均为 100；深层逐步挤压白装概率。
    rarityWeightsByFloor: RARITY_WEIGHTS,
    emptySlotBias: 0.62,
    itemLevelVariance: 1,
    baseGrowthPerFloor: 0.06,
    baseStatsBySlot: {
      weapon: { attack: [5, 8] },
      helmet: { defense: [3, 5], maxHp: [5, 11] },
      armor: { defense: [5, 8], maxHp: [10, 18] },
      accessory: { attack: [1, 3], defense: [1, 3], maxHp: [4, 9] },
    },
    namesBySlot: {
      weapon: ["缺口长剑", "黑铁战斧", "守墓战锤"],
      helmet: ["旧铁盔", "白骨面甲", "守卫兜帽"],
      armor: ["锁链甲", "墓穴胸甲", "符文护甲"],
      accessory: ["黯淡护符", "骸骨指环", "余烬徽记"],
    },
  },

  // 价格全部由物品实时战力计算；购买始终明显高于出售，避免倒卖套利。
  economy: {
    sell: { minimum: 3, powerMultiplier: 0.35, levelMultiplier: 2 },
    reforge: {
      baseCost: 45,
      powerMultiplier: 0.75,
      levelMultiplier: 6,
      rarityMultipliers: { common: 1, uncommon: 1.25, rare: 1.7, legendary: 2.4 },
    },
    shop: {
      stockSize: 4,
      refreshEveryVictories: 3,
      basePrice: 90,
      powerMultiplier: 1.35,
      levelMultiplier: 8,
      minimumSellMultiplier: 3,
    },
  },

  dungeon: {
    minFloor: 1,
    maxFloor: FLOOR_MAX,
    bossEveryFloors: 5,
    defaultEnemyCritDamage: 1.5,
    enemyStatVariance: 0.06,
    experiencePerEnemy: 20,
    goldPerEnemy: 9,
    floors: FLOORS,
  },
  floors: FLOORS,
  enemyTemplates: ENEMY_TEMPLATES,

  // 战败只扣当前等级经验，不会降级；撤退惩罚更轻。
  penalties: PENALTIES,
  penalty: PENALTIES,
});

/** Stable 32-bit FNV-1a hash for string or numeric seeds. */
export function hashSeed(seed) {
  if (typeof seed === "number" && Number.isFinite(seed)) return seed >>> 0;
  const text = String(seed ?? "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Deterministic Mulberry32-style RNG with range/int/pick helpers. */
export function createSeededRng(seed = 0) {
  let state = hashSeed(seed) || 0x6d2b79f5;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  random.range = (min, max) => min + (max - min) * random();
  random.int = (min, maxInclusive) => Math.floor(random.range(min, maxInclusive + 1));
  random.pick = (items) => Array.isArray(items) && items.length
    ? items[Math.floor(random() * items.length)]
    : undefined;
  random.getState = () => state;
  return random;
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}
