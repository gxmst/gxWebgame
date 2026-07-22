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
  "footwear",
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
  footwear: { id: "footwear", name: "鞋子", emoji: "🥾" },
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
    branches: [
      {
        id: "heavy_strike_crusher",
        name: "粉碎重击",
        description: "进一步提高单次伤害，适合正面击破高生命目标。",
        add: { multiplier: 0.24 },
      },
      {
        id: "heavy_strike_executioner",
        name: "处决重击",
        description: "显著提高本技能的暴击概率，追求爆发上限。",
        add: { critChanceBonus: 0.2 },
      },
    ],
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
    branches: [
      {
        id: "whirlwind_bladestorm",
        name: "剑刃风暴",
        description: "提高旋风斩的每目标伤害，强化群体清场。",
        add: { multiplier: 0.1 },
      },
      {
        id: "whirlwind_relentless",
        name: "无尽回旋",
        description: "降低施放所需的敌人数，更早进入技能循环。",
        add: { minimumTargets: -1 },
      },
    ],
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
    branches: [
      {
        id: "block_fortress",
        name: "钢铁壁垒",
        description: "提高格挡期间的减伤，专注抵挡首领重击。",
        add: { reduction: 0.1 },
      },
      {
        id: "block_enduring",
        name: "持久防线",
        description: "格挡多持续一回合，换取更稳定的防护覆盖。",
        add: { duration: 1 },
      },
    ],
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
    branches: [
      {
        id: "fireball_inferno",
        name: "炼狱火球",
        description: "提高火球术的稳定伤害，专注单体爆发。",
        add: { multiplier: 0.25 },
      },
      {
        id: "fireball_wildfire",
        name: "狂燃核心",
        description: "提高火球术的暴击概率，制造更高峰值。",
        add: { critChanceBonus: 0.22 },
      },
    ],
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
    branches: [
      {
        id: "chain_lightning_overload",
        name: "雷霆过载",
        description: "提高每次跳跃的伤害，强化密集敌群处理。",
        add: { multiplier: 0.09 },
      },
      {
        id: "chain_lightning_forked",
        name: "分叉闪电",
        description: "两名敌人时也优先施放，提升小规模战斗覆盖。",
        add: { minimumTargets: -1 },
      },
    ],
  },
  mana_shield: {
    id: "mana_shield",
    name: "奥术护盾",
    emoji: "🔮",
    type: "guard",
    multiplier: 0,
    cooldown: 5,
    resourceCost: 0,
    reduction: 0.62,
    duration: 3,
    triggerBelowHpRatio: 0.8,
    classIds: ["mage"],
    leveling: {
      initialLevel: 1,
      maxLevel: 10,
      perLevel: { reduction: 0.012 },
      milestones: [{ level: 7, add: { cooldown: -1 } }],
    },
    branches: [
      {
        id: "mana_shield_prismatic",
        name: "棱彩屏障",
        description: "提高护盾减伤，抵挡短时间内的高额爆发。",
        add: { reduction: 0.08 },
      },
      {
        id: "mana_shield_lingering",
        name: "延续结界",
        description: "护盾多持续一回合，提高持续作战稳定性。",
        add: { duration: 1 },
      },
    ],
  },
  // 游侠以多段独立判定制造暴击波动，单段倍率刻意低于重击类技能。
  quick_shot: {
    id: "quick_shot",
    name: "快速射击",
    emoji: "🏹",
    type: "single",
    multiplier: 0.52,
    hitCount: 2,
    cooldown: 0,
    resourceCost: 0,
    isBasic: true,
    classIds: ["ranger"],
    leveling: { initialLevel: 1, maxLevel: 1, perLevel: {} },
  },
  aimed_shot: {
    id: "aimed_shot",
    name: "瞄准射击",
    emoji: "🎯",
    type: "single",
    multiplier: 1.65,
    hitCount: 1,
    critChanceBonus: 0.25,
    cooldown: 2,
    resourceCost: 0,
    classIds: ["ranger"],
    leveling: {
      initialLevel: 1,
      maxLevel: 10,
      perLevel: { multiplier: 0.09, critChanceBonus: 0.015 },
      milestones: [{ level: 8, add: { cooldown: -1 } }],
    },
    branches: [
      {
        id: "aimed_shot_deadeye",
        name: "神射手",
        description: "提高瞄准射击的伤害，稳定击穿高防目标。",
        add: { multiplier: 0.2 },
      },
      {
        id: "aimed_shot_execution",
        name: "猎杀标记",
        description: "提高瞄准射击的暴击概率，赌一轮高额爆发。",
        add: { critChanceBonus: 0.18 },
      },
    ],
  },
  arrow_rain: {
    id: "arrow_rain",
    name: "箭雨",
    emoji: "🌧️",
    type: "aoe",
    multiplier: 0.26,
    hitCount: 3,
    cooldown: 3,
    resourceCost: 0,
    minimumTargets: 3,
    classIds: ["ranger"],
    leveling: {
      initialLevel: 1,
      maxLevel: 10,
      perLevel: { multiplier: 0.015 },
      milestones: [{ level: 7, add: { minimumTargets: -1 } }],
    },
    branches: [
      {
        id: "arrow_rain_storm",
        name: "暴雨箭幕",
        description: "提高每支箭的伤害，强化多目标压制。",
        add: { multiplier: 0.06 },
      },
      {
        id: "arrow_rain_widened",
        name: "扩散箭幕",
        description: "三名以下的敌群也能触发箭雨。",
        add: { minimumTargets: -1 },
      },
    ],
  },
  evasion_stance: {
    id: "evasion_stance",
    name: "闪避姿态",
    emoji: "💨",
    type: "guard",
    multiplier: 0,
    cooldown: 4,
    resourceCost: 0,
    reduction: 0.08,
    dodgeBonus: 0.24,
    duration: 2,
    triggerBelowHpRatio: 0.55,
    classIds: ["ranger"],
    leveling: {
      initialLevel: 1,
      maxLevel: 10,
      perLevel: { dodgeBonus: 0.012 },
      milestones: [{ level: 8, add: { cooldown: -1 } }],
    },
    branches: [
      {
        id: "evasion_stance_phantom",
        name: "幻影步",
        description: "显著提高姿态期间的闪避，适合规避首领连击。",
        add: { dodgeBonus: 0.08 },
      },
      {
        id: "evasion_stance_guarded",
        name: "稳固姿态",
        description: "用少量闪避换取更可靠的伤害减免。",
        add: { reduction: 0.12 },
      },
    ],
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
  // ——死灵法师:低成长本体输出 + 骷髅军团(召唤物承伤/补伤害)——
  bone_bolt: {
    id: "bone_bolt",
    name: "骨矢",
    emoji: "🦴",
    type: "single",
    multiplier: 1,
    cooldown: 0,
    resourceCost: 0,
    isBasic: true,
    classIds: ["necromancer"],
    leveling: { initialLevel: 1, maxLevel: 1, perLevel: {} },
  },
  bone_spear: {
    id: "bone_spear",
    name: "骨矛",
    emoji: "🗡️",
    type: "single",
    multiplier: 1.7,
    cooldown: 2,
    resourceCost: 0,
    classIds: ["necromancer"],
    leveling: {
      initialLevel: 1,
      maxLevel: 10,
      perLevel: { multiplier: 0.1 },
      milestones: [{ level: 8, add: { cooldown: -1 } }],
    },
    branches: [
      {
        id: "bone_spear_impale",
        name: "穿魂骨矛",
        description: "提高骨矛的伤害，专注单体收割。",
        add: { multiplier: 0.22 },
      },
      {
        id: "bone_spear_critical",
        name: "裂颅骨矛",
        description: "提高骨矛的暴击概率，追求脆弱窗口爆发。",
        add: { critChanceBonus: 0.2 },
      },
    ],
  },
  corpse_burst: {
    id: "corpse_burst",
    name: "尸爆",
    emoji: "☣️",
    type: "aoe",
    multiplier: 0.78,
    cooldown: 3,
    resourceCost: 0,
    minimumTargets: 3,
    classIds: ["necromancer"],
    leveling: {
      initialLevel: 1,
      maxLevel: 10,
      perLevel: { multiplier: 0.045 },
      milestones: [{ level: 7, add: { minimumTargets: -1 } }],
    },
    branches: [
      {
        id: "corpse_burst_volatile",
        name: "不稳定尸火",
        description: "提高尸爆伤害，让密集敌群更快崩解。",
        add: { multiplier: 0.08 },
      },
      {
        id: "corpse_burst_chain",
        name: "连锁尸爆",
        description: "少量敌人时也能引爆尸爆，保持清场节奏。",
        add: { minimumTargets: -1 },
      },
    ],
  },
  raise_skeleton: {
    id: "raise_skeleton",
    name: "亡者复生",
    emoji: "💀",
    type: "summon",
    multiplier: 0,
    cooldown: 3,
    resourceCost: 0,
    // 每次召唤 summonCount 名,场上召唤物不超过 maxMinions(另受内核硬上限约束)。
    summonCount: 2,
    maxMinions: 2,
    minionName: "骷髅战士",
    minionEmoji: "💀",
    // 召唤物属性 = 施法者当前属性 × 比例。
    minionHpRatio: 0.22,
    minionAttackRatio: 0.3,
    minionDefenseRatio: 0.4,
    minionSpeedRatio: 0.85,
    classIds: ["necromancer"],
    leveling: {
      initialLevel: 1,
      maxLevel: 10,
      perLevel: { minionHpRatio: 0.02, minionAttackRatio: 0.018 },
      milestones: [
        { level: 7, add: { maxMinions: 1 } },
        { level: 9, add: { summonCount: 1 } },
      ],
    },
    branches: [
      {
        id: "raise_skeleton_legion",
        name: "骸骨军团",
        description: "提高战场召唤上限，靠数量分摊伤害。",
        add: { maxMinions: 1 },
      },
      {
        id: "raise_skeleton_elite",
        name: "精锐亡骨",
        description: "提高骷髅的攻击比例，牺牲数量换取质量。",
        add: { minionAttackRatio: 0.1 },
      },
    ],
  },
  // ——德鲁伊:狼魂形态(增伤+吸血)+ 回春续航的近身斗士——
  claw_swipe: {
    id: "claw_swipe",
    name: "利爪横扫",
    emoji: "🐾",
    type: "single",
    multiplier: 1,
    cooldown: 0,
    resourceCost: 0,
    isBasic: true,
    classIds: ["druid"],
    leveling: { initialLevel: 1, maxLevel: 1, perLevel: {} },
  },
  savage_bite: {
    id: "savage_bite",
    name: "野性撕咬",
    emoji: "🐺",
    type: "single",
    multiplier: 1.65,
    cooldown: 2,
    resourceCost: 0,
    classIds: ["druid"],
    leveling: {
      initialLevel: 1,
      maxLevel: 10,
      perLevel: { multiplier: 0.1 },
      milestones: [{ level: 8, add: { cooldown: -1 } }],
    },
    branches: [
      {
        id: "savage_bite_rend",
        name: "撕裂伤口",
        description: "提高野性撕咬的伤害，专注快速解决单体目标。",
        add: { multiplier: 0.22 },
      },
      {
        id: "savage_bite_fang",
        name: "獠牙突袭",
        description: "提高野性撕咬的暴击概率，制造爆发窗口。",
        add: { critChanceBonus: 0.2 },
      },
    ],
  },
  natures_wrath: {
    id: "natures_wrath",
    name: "自然之怒",
    emoji: "⛈️",
    type: "aoe",
    multiplier: 0.74,
    cooldown: 3,
    resourceCost: 0,
    minimumTargets: 3,
    classIds: ["druid"],
    leveling: {
      initialLevel: 1,
      maxLevel: 10,
      perLevel: { multiplier: 0.04 },
      milestones: [{ level: 6, add: { minimumTargets: -1 } }],
    },
    branches: [
      {
        id: "natures_wrath_tempest",
        name: "风暴核心",
        description: "提高自然之怒的范围伤害，强化群体清场。",
        add: { multiplier: 0.08 },
      },
      {
        id: "natures_wrath_roots",
        name: "缠根领域",
        description: "较小敌群也能触发自然之怒，维持稳定循环。",
        add: { minimumTargets: -1 },
      },
    ],
  },
  wolf_form: {
    id: "wolf_form",
    name: "狼魂形态",
    emoji: "🌕",
    type: "empower",
    multiplier: 0,
    cooldown: 5,
    resourceCost: 0,
    // empower:持续期内提升输出并附带吸血,由施法 AI 主动保持覆盖。
    damageBonus: 0.28,
    lifestealBonus: 0.07,
    duration: 3,
    classIds: ["druid"],
    leveling: {
      initialLevel: 1,
      maxLevel: 10,
      perLevel: { damageBonus: 0.02 },
      milestones: [{ level: 7, add: { cooldown: -1 } }],
    },
    branches: [
      {
        id: "wolf_form_berserker",
        name: "狂狼之魂",
        description: "进一步提高形态增伤，放弃部分续航换取爆发。",
        add: { damageBonus: 0.08 },
      },
      {
        id: "wolf_form_predator",
        name: "猎食本能",
        description: "提高形态吸血，适合长线作战和持续回复。",
        add: { lifestealBonus: 0.07 },
      },
    ],
  },
  rejuvenation: {
    id: "rejuvenation",
    name: "回春术",
    emoji: "🌱",
    type: "heal",
    multiplier: 0,
    cooldown: 4,
    resourceCost: 0,
    healRatio: 0.25,
    triggerBelowHpRatio: 0.6,
    classIds: ["druid"],
    leveling: {
      initialLevel: 1,
      maxLevel: 10,
      perLevel: { healRatio: 0.02 },
      milestones: [{ level: 8, add: { cooldown: -1 } }],
    },
    branches: [
      {
        id: "rejuvenation_bloom",
        name: "繁盛回春",
        description: "提高单次恢复量，适合承受高额爆发。",
        add: { healRatio: 0.1 },
      },
      {
        id: "rejuvenation_cycle",
        name: "循环生息",
        description: "缩短回春术冷却，更频繁地维持生命线。",
        add: { cooldown: -1 },
      },
    ],
  },
  // ——以下为敌方专属技能(enemyOnly),不会进入任何职业的技能列表——
  venom_fangs: {
    id: "venom_fangs",
    name: "毒牙连刺",
    emoji: "🕷️",
    type: "single",
    multiplier: 0.55,
    hitCount: 2,
    cooldown: 2,
    resourceCost: 0,
    enemyOnly: true,
  },
  shadow_bolt: {
    id: "shadow_bolt",
    name: "暗影箭",
    emoji: "🌑",
    type: "single",
    multiplier: 1.45,
    cooldown: 3,
    resourceCost: 0,
    enemyOnly: true,
  },
  boss_smash: {
    id: "boss_smash",
    name: "灭世重击",
    emoji: "💥",
    type: "single",
    multiplier: 1.6,
    cooldown: 3,
    resourceCost: 0,
    enemyOnly: true,
  },
  boss_devour: {
    id: "boss_devour",
    name: "亡者盛宴",
    emoji: "🩸",
    type: "heal",
    multiplier: 0,
    healRatio: 0.16,
    cooldown: 4,
    triggerBelowHpRatio: 0.5,
    resourceCost: 0,
    enemyOnly: true,
  },
  boss_guard: {
    id: "boss_guard",
    name: "虚空壁障",
    emoji: "🌀",
    type: "guard",
    multiplier: 0,
    reduction: 0.38,
    duration: 2,
    cooldown: 5,
    triggerBelowHpRatio: 0.4,
    resourceCost: 0,
    enemyOnly: true,
  },
  boss_flurry: {
    id: "boss_flurry",
    name: "虚空连斩",
    emoji: "🌪️",
    type: "single",
    multiplier: 0.7,
    hitCount: 3,
    cooldown: 3,
    resourceCost: 0,
    enemyOnly: true,
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
    slots: ["helmet", "armor", "footwear", "accessory"],
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
    classIds: ["warrior", "ranger", "druid"],
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
    classIds: ["mage", "necromancer"],
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
    slots: ["helmet", "armor", "footwear", "accessory"],
  },
};

const LEGENDARY_EFFECTS = {
  burning: {
    id: "burning",
    name: "余烬",
    description: "攻击有 18% 概率点燃目标，使其连续 2 回合受到灼烧伤害。",
    type: "burning",
    value: 0.18,
  },
  lifesteal: {
    id: "lifesteal",
    name: "饮血",
    description: "每次造成伤害时，回复相当于伤害 6% 的生命。",
    type: "lifesteal",
    value: 0.06,
  },
  thorns: {
    id: "thorns",
    name: "荆棘",
    description: "受到攻击时，向攻击者反弹所受伤害的 12%。",
    type: "thorns",
    value: 0.12,
  },
  armor_break: {
    id: "armor_break",
    name: "破甲",
    description: "攻击时忽略目标 15% 的防御。",
    type: "armorPenetration",
    value: 0.15,
  },
  double_strike: {
    id: "double_strike",
    name: "连击",
    description: "攻击有 12% 概率追加一次额外打击。",
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
    skills: ["enemy_attack", "shadow_bolt"],
  },
  ghoul: {
    id: "ghoul",
    name: "腐尸",
    emoji: "🧟",
    stats: { maxHp: 70, attack: 13, defense: 7, speed: 45, critChance: 0.04 },
  },
  // 世界地图任务/事件用：腐化林地常见野兽（也进入浅层敌人池）
  corrupt_wolf: {
    id: "corrupt_wolf",
    name: "腐狼",
    emoji: "🐺",
    stats: { maxHp: 58, attack: 12, defense: 4, speed: 72, critChance: 0.07 },
  },
  // 荒漠特产
  sand_scorpion: {
    id: "sand_scorpion",
    name: "沙蝎",
    emoji: "🦂",
    stats: { maxHp: 64, attack: 14, defense: 6, speed: 68, critChance: 0.09 },
    skills: ["enemy_attack", "venom_fangs"],
  },
  dune_wraith: {
    id: "dune_wraith",
    name: "沙丘怨灵",
    emoji: "👻",
    stats: { maxHp: 54, attack: 13, defense: 3, speed: 76, critChance: 0.1, dodgeChance: 0.12 },
    skills: ["enemy_attack", "shadow_bolt"],
  },
  bone_nomad: {
    id: "bone_nomad",
    name: "枯骨游民",
    emoji: "💀",
    stats: { maxHp: 72, attack: 15, defense: 8, speed: 52, critChance: 0.08 },
  },
  crypt_guard: {
    id: "crypt_guard",
    name: "墓穴守卫",
    emoji: "👹",
    stats: { maxHp: 82, attack: 15, defense: 9, speed: 50, critChance: 0.06 },
  },
  // ——中深层新增小怪:各自带一种鲜明的威胁轴——
  skeleton_archer: {
    id: "skeleton_archer",
    name: "骨弓手",
    emoji: "🏹",
    stats: { maxHp: 44, attack: 12, defense: 3, speed: 70, critChance: 0.12, critDamage: 1.6 },
  },
  crypt_spider: {
    id: "crypt_spider",
    name: "墓穴蜘蛛",
    emoji: "🕷️",
    stats: { maxHp: 48, attack: 9, defense: 3, speed: 82, critChance: 0.06 },
    skills: ["enemy_attack", "venom_fangs"],
  },
  wraith: {
    id: "wraith",
    name: "怨灵",
    emoji: "👻",
    stats: { maxHp: 50, attack: 12, defense: 2, speed: 74, critChance: 0.07, dodgeChance: 0.18 },
    skills: ["enemy_attack", "shadow_bolt"],
  },
  ember_fiend: {
    id: "ember_fiend",
    name: "余烬恶鬼",
    emoji: "🔥",
    stats: { maxHp: 56, attack: 13, defense: 4, speed: 60, critChance: 0.06, burnChance: 0.3 },
  },
  gargoyle: {
    id: "gargoyle",
    name: "石像鬼",
    emoji: "🗿",
    stats: { maxHp: 95, attack: 11, defense: 12, speed: 38, critChance: 0.03, thorns: 0.15 },
  },
  abyss_serpent: {
    id: "abyss_serpent",
    name: "深渊巨蟒",
    emoji: "🐍",
    stats: { maxHp: 78, attack: 14, defense: 6, speed: 66, critChance: 0.07, lifesteal: 0.12 },
  },
  void_stalker: {
    id: "void_stalker",
    name: "虚空猎手",
    emoji: "🌑",
    stats: { maxHp: 62, attack: 16, defense: 5, speed: 88, critChance: 0.16, critDamage: 1.7, multiHitChance: 0.15 },
  },
  // ——Boss 按深度分档,同档基础数值接近以保证成长曲线平滑——
  crypt_warden: {
    id: "crypt_warden",
    name: "地穴领主",
    emoji: "👑",
    boss: true,
    stats: { maxHp: 760, attack: 50, defense: 28, speed: 62, critChance: 0.08 },
    skills: ["enemy_attack", "boss_smash"],
  },
  plague_herald: {
    id: "plague_herald",
    name: "瘟疫先知",
    emoji: "☠️",
    boss: true,
    stats: { maxHp: 720, attack: 52, defense: 26, speed: 60, critChance: 0.08, lifesteal: 0.1 },
    skills: ["enemy_attack", "boss_smash", "boss_devour"],
  },
  flame_tyrant: {
    id: "flame_tyrant",
    name: "炎狱领主",
    emoji: "🐲",
    boss: true,
    stats: { maxHp: 780, attack: 55, defense: 27, speed: 58, critChance: 0.09, burnChance: 0.35 },
    skills: ["enemy_attack", "boss_smash"],
  },
  void_sovereign: {
    id: "void_sovereign",
    name: "虚空君王",
    emoji: "👁️",
    boss: true,
    stats: { maxHp: 750, attack: 54, defense: 30, speed: 66, critChance: 0.14, critDamage: 1.7, multiHitChance: 0.2 },
    skills: ["enemy_attack", "boss_flurry", "boss_guard"],
  },
};

const FLOOR_MAX = 100;
// 主题按深度分带(upTo 为该带的最深层),越深的带出现越危险的新怪。
const FLOOR_THEMES = [
  { upTo: 9, name: "地穴回廊", emoji: "🕯️", description: "潮湿石阶向黑暗深处延伸，碎骨在脚边轻轻作响。", pool: ["bone_rat", "skeleton", "cultist", "corrupt_wolf"] },
  { upTo: 19, name: "白骨回廊", emoji: "💀", description: "骨墙之间回荡着甲片摩擦声，冷箭不知从何处袭来。", pool: ["skeleton", "skeleton_archer", "cultist", "corrupt_wolf", "sand_scorpion"] },
  { upTo: 29, name: "腐朽墓室", emoji: "⚰️", description: "棺椁半开，腐气与蛛丝在墓室深处交织。", pool: ["ghoul", "cultist", "crypt_spider", "dune_wraith"] },
  { upTo: 39, name: "守卫大厅", emoji: "🛡️", description: "破损军旗悬在穹顶，重甲守卫封死了前路。", pool: ["crypt_guard", "ghoul", "skeleton_archer", "bone_nomad"] },
  { upTo: 49, name: "怨语深廊", emoji: "👻", description: "低语在石壁间游走，怨灵掠过烛火而不留身影。", pool: ["wraith", "cultist", "crypt_spider"] },
  { upTo: 59, name: "余烬深井", emoji: "🔥", description: "岩缝吐出灼热气息，余烬中的亡骸再度睁开双眼。", pool: ["ember_fiend", "ghoul", "crypt_guard"] },
  { upTo: 69, name: "石像长厅", emoji: "🗿", description: "长厅两侧的石像布满裂纹，目光似乎随你移动。", pool: ["gargoyle", "wraith", "ember_fiend"] },
  { upTo: 79, name: "冥蛇沼窟", emoji: "🐍", description: "黑水没过脚踝，鳞片摩擦石壁的声音越来越近。", pool: ["abyss_serpent", "gargoyle", "crypt_spider"] },
  { upTo: 89, name: "星陨墓窟", emoji: "✨", description: "幽蓝矿脉照亮古老碑文，深处传来沉重的呼吸。", pool: ["wraith", "abyss_serpent", "ember_fiend"] },
  { upTo: FLOOR_MAX, name: "虚空边境", emoji: "🌑", description: "现实在此处变得稀薄，虚空的猎手正凝视着闯入者。", pool: ["void_stalker", "abyss_serpent", "gargoyle"] },
];

// Boss 按深度分档;同一档内是同一位领主,保证相邻 Boss 层数值成长平滑。
const BOSS_BANDS = [
  { upTo: 15, id: "crypt_warden", title: "领主王座", emoji: "👑", description: "王座上的地穴领主苏醒了；这一战需要真正成形的装备。" },
  { upTo: 40, id: "plague_herald", title: "瘟疫祭坛", emoji: "☠️", description: "祭坛上的先知以疫病为食，被吞噬者的哀嚎是它的赞歌。" },
  { upTo: 70, id: "flame_tyrant", title: "炎狱王庭", emoji: "🐲", description: "熔岩在王庭中流淌，炎狱领主的怒火足以点燃钢铁。" },
  { upTo: FLOOR_MAX, id: "void_sovereign", title: "虚空王座", emoji: "👁️", description: "虚空君王凝视着一切，它的每一次挥击都试图撕开现实。" },
];

function pickByDepth(bands, floorId) {
  return bands.find((band) => floorId <= band.upTo) ?? bands.at(-1);
}

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
    const theme = pickByDepth(FLOOR_THEMES, id);
    const bossBand = pickByDepth(BOSS_BANDS, id);
    // Boss 模板的基础数值就是按第 5 层手调的,所以 Boss 用以第 5 层为 1 的
    // 独立缓增曲线;沿用小怪的全局曲线会让深层 Boss 变成无解数值墙。
    const scale = boss ? (id / 5) ** 0.72 : 0.9 * (id ** 0.62);
    const rewardScale = 1 + ((id - 1) ** 1.18) * 0.45;
    const normalRecommendedPower = Math.round(330 * id ** 0.95);
    // Boss 的数值曲线可以独立缓增，但推荐战力不能低于上一层普通怪。
    // 否则玩家会看到更强的首领反而拥有更低的门槛提示。
    const recommendedPower = boss
      ? Math.max(
        Math.round(980 * (id / 5) ** 0.8),
        Math.round(330 * (id - 1) ** 0.95) + 1,
      )
      : normalRecommendedPower;
    const [minimumEnemies, maximumEnemies] = id < 5 ? legacyRow[4] : [3, 5];
    const definition = {
      id,
      name: legacyRow?.[0] ?? (boss ? `${bossBand.title} · ${id}层` : `${theme.name} · ${id}层`),
      emoji: legacyRow?.[1] ?? (boss ? bossBand.emoji : theme.emoji),
      description: legacyRow?.[2] ?? (boss
        ? bossBand.description
        : `${theme.description}这是第 ${id} 层，敌人的装备与意志都更强。`),
      recommendedPower: legacyRow?.[3] ?? recommendedPower,
      enemyCount: boss ? [1, 1] : [minimumEnemies, maximumEnemies],
      enemyPool: boss ? [bossBand.id] : (legacyRow?.[5] ?? theme.pool),
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
    version: "0.6.1",
  },

  save: {
    key: "gxwebgame.dungeon.save.v1",
    version: 3,
    // 单个浏览器存档最多保留 8 名彼此独立的冒险者。
    maxCharacters: 8,
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
      dodgeChance: 150,
      // 传奇特效(吸血/荆棘/破甲/连击/点燃)对战力的估值权重。
      legendaryEffect: 140,
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
    // 30 级一轮约需 3.7 万经验；Boss 门槛之间需要适量刷装与调整构筑。
    experience: { base: 110, growth: 1.13, linear: 22 },
  },

  classes: {
    warrior: {
      id: "warrior",
      name: "战士",
      emoji: "⚔️",
      role: "近战攻守",
      description: "生命和护甲扎实，重击擅长单体爆发，旋风斩负责清场。",
      primaryStat: "strength",
      damageType: "physical",
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
      damageType: "magic",
      basicSkillId: "arcane_bolt",
      startingStats: { strength: 2, agility: 6, intelligence: 11, vitality: 6 },
      skills: ["arcane_bolt", "fireball", "chain_lightning", "mana_shield"],
      // 智力优先，敏捷维持先手与暴击，体质补足生存。
      autoAllocation: { strength: 0, agility: 0.2, intelligence: 0.55, vitality: 0.25 },
      combat: {
        baseHp: 65,
        hpPerVitality: 10.5,
        hpPerLevel: 5.5,
        baseAttack: 7,
        attackPerLevel: 2.2,
        attackPerAttribute: { strength: 0.1, agility: 0.2, intelligence: 2.25, vitality: 0 },
        baseDefense: 1.5,
        defensePerVitality: 0.65,
        defensePerStrength: 0.08,
        defensePerLevel: 0.85,
        baseSpeed: 78,
        speedPerAgility: 2.1,
      },
    },
    ranger: {
      id: "ranger",
      name: "游侠",
      emoji: "🏹",
      role: "远程连击",
      description: "敏捷带来高速、暴击与闪避，以连续射击和箭雨压制敌群。",
      primaryStat: "agility",
      damageType: "physical",
      basicSkillId: "quick_shot",
      startingStats: { strength: 3, agility: 12, intelligence: 3, vitality: 8 },
      skills: ["quick_shot", "aimed_shot", "arrow_rain", "evasion_stance"],
      // 敏捷优先，体质维持中等生存，力量仅作少量物理补强。
      autoAllocation: { strength: 0.1, agility: 0.6, intelligence: 0, vitality: 0.3 },
      // 权重只影响候选词条的抽取倾向，不排除通用防御词条。
      affixWeights: {
        agility: 3,
        critChance: 2.6,
        critDamage: 2.3,
        speed: 2.2,
        physicalDamagePercent: 1.5,
      },
      combat: {
        baseHp: 65,
        hpPerVitality: 10,
        hpPerLevel: 5,
        baseAttack: 6,
        attackPerLevel: 2.05,
        attackPerAttribute: { strength: 0.15, agility: 1.8, intelligence: 0.1, vitality: 0 },
        baseDefense: 1.5,
        defensePerVitality: 0.65,
        defensePerStrength: 0.1,
        defensePerLevel: 0.85,
        baseSpeed: 84,
        speedPerAgility: 2.6,
        baseCritChance: 0.08,
        critChancePerAgility: 0.007,
        maxCritChance: 0.75,
        baseCritDamage: 1.6,
        baseDodgeChance: 0.05,
        dodgeChancePerAgility: 0.005,
        maxDodgeChance: 0.42,
      },
    },
    necromancer: {
      id: "necromancer",
      name: "死灵法师",
      emoji: "⚰️",
      role: "亡灵召唤",
      description: "召唤骷髅军团分摊火力，本体以骨矛和尸爆收割残局。",
      primaryStat: "intelligence",
      damageType: "magic",
      basicSkillId: "bone_bolt",
      startingStats: { strength: 2, agility: 5, intelligence: 11, vitality: 7 },
      skills: ["bone_bolt", "bone_spear", "corpse_burst", "raise_skeleton"],
      // 智力驱动本体与召唤物,体质保证被穿防时的容错。
      autoAllocation: { strength: 0, agility: 0.2, intelligence: 0.5, vitality: 0.3 },
      affixWeights: {
        intelligence: 3,
        magicDamagePercent: 2,
        maxHp: 1.6,
        vitality: 1.4,
      },
      combat: {
        baseHp: 64,
        hpPerVitality: 10,
        hpPerLevel: 5,
        baseAttack: 6,
        attackPerLevel: 2.1,
        // 平衡:死灵定位是"低成长本体 + 骷髅军团补伤",智力系数从 2.15 下调到 1.8,
        // 让本体输出真正低于法师(2.25),战力主要靠召唤物承伤与叠加,符合设计定位。
        attackPerAttribute: { strength: 0.1, agility: 0.2, intelligence: 1.8, vitality: 0 },
        baseDefense: 1.2,
        defensePerVitality: 0.6,
        defensePerStrength: 0.1,
        defensePerLevel: 0.8,
        baseSpeed: 72,
        speedPerAgility: 2,
      },
    },
    druid: {
      id: "druid",
      name: "德鲁伊",
      emoji: "🐻",
      role: "形态搏杀",
      description: "狼魂形态大幅增伤并附带吸血，回春术提供续航的近身斗士。",
      primaryStat: "strength",
      damageType: "physical",
      basicSkillId: "claw_swipe",
      startingStats: { strength: 8, agility: 5, intelligence: 4, vitality: 10 },
      skills: ["claw_swipe", "savage_bite", "natures_wrath", "wolf_form", "rejuvenation"],
      // 力量与体质并重:攻击同时吃力量与体质,天生耐揍。
      autoAllocation: { strength: 0.4, agility: 0.15, intelligence: 0.1, vitality: 0.35 },
      affixWeights: {
        strength: 2.2,
        vitality: 2,
        maxHp: 1.8,
        physicalDamagePercent: 1.6,
        damageReduction: 1.4,
      },
      combat: {
        baseHp: 72,
        hpPerVitality: 11.2,
        hpPerLevel: 5.8,
        baseAttack: 5,
        attackPerLevel: 2,
        attackPerAttribute: { strength: 1.7, agility: 0.25, intelligence: 0.15, vitality: 0.5 },
        baseDefense: 2,
        defensePerVitality: 0.72,
        defensePerStrength: 0.22,
        defensePerLevel: 0.9,
        baseSpeed: 74,
        speedPerAgility: 2.1,
      },
    },
  },

  // 满级累计 30 点，但单套构筑最多投入 25 点，保留明确取舍。
  skillProgression: {
    initialPoints: 1,
    pointEveryLevels: 1,
    pointsPerAward: 1,
    pointsPerPrestige: 0,
    totalPointCap: 30,
    investmentCap: 25,
    branchUnlockLevel: 5,
    freeReset: true,
  },

  // 转生重置等级和基础属性，保留金币、装备与已通关记录。
  prestige: {
    maxCount: 99,
    combatBonusPerCount: 0.08,
    affectedStats: ["maxHp", "attack", "defense"],
    pointsPerCount: 0,
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
    maxDodgeChance: 0.75,
    targetStrategy: "lowestHp",
    aoeMinimumTargets: 3,
    aoeMultiplierCap: 1.4,
    aoeUtilityWeight: 0.82,
    buildAwareOffense: true,
    // 单次技能的多段数硬上限，防止异常存档制造超长战斗。
    maxHitsPerAction: 12,
    enemyCount: [3, 5],
    speedTieBreaker: "id",
    // 召唤物硬上限:场上同时存在数与单次召唤数,防止配置失误刷屏。
    minions: {
      maxActive: 5,
      maxSummonsPerCast: 3,
    },
    // 传奇特效与精英词缀共用的战斗特效参数;上限防止叠装备后数值失控。
    effects: {
      burnDuration: 2, // 燃烧持续回合数
      burnDamageRatio: 0.4, // 每回合燃烧伤害 = 触发那一击伤害的比例
      maxLifesteal: 0.5,
      maxThorns: 0.6,
      maxArmorPenetration: 0.6,
      maxMultiHitChance: 0.5,
      maxBurnChance: 0.75,
    },
  },

  // 稀有度同时决定基础数值倍率和词条条数。
  rarities: RARITIES,
  rarity: RARITIES,
  rarityOrder: RARITY_IDS,
  affixes: AFFIXES,
  affix: AFFIXES,
  legendaryEffects: LEGENDARY_EFFECTS,

  // 装备名由最显著词条确定性生成，不消耗额外随机数。
  equipmentNaming: {
    affixPrefixes: {
      strength: "狂暴的",
      agility: "迅捷的",
      intelligence: "睿智的",
      vitality: "坚韧的",
      maxHp: "强韧的",
      attack: "锋锐的",
      defense: "坚壁的",
      critChance: "致命的",
      critDamage: "毁灭的",
      speed: "疾风的",
      damagePercent: "狂怒的",
      physicalDamagePercent: "战意的",
      magicDamagePercent: "奥秘的",
      damageReduction: "不屈的",
      dodgeChance: "幻影的",
    },
    // 传奇效果优先于普通词条决定名称。
    effectPrefixes: {
      burning: "灼热的",
      lifesteal: "嗜血的",
      thorns: "荆棘的",
      armor_break: "碎甲的",
      double_strike: "连击的",
    },
  },

  loot: {
    // 第四批起传奇特效已接入战斗触发(吸血/荆棘/破甲/连击/点燃)。
    enableLegendaryEffects: true,
    // Boss 层掉落规则:额外多掉 extraDrops 件,且稀有度随 Boss 档位有保底。
    bossLoot: {
      extraDrops: 1,
      minimumRarityByTier: [
        { minTier: 1, rarity: "uncommon" },
        { minTier: 6, rarity: "rare" },
      ],
    },
    // 各层掉率总和均为 100；深层逐步挤压白装概率。
    rarityWeightsByFloor: RARITY_WEIGHTS,
    emptySlotBias: 0.62,
    itemLevelVariance: 1,
    baseGrowthPerFloor: 0.06,
    baseStatsBySlot: {
      weapon: { attack: [5, 8] },
      helmet: { defense: [3, 5], maxHp: [5, 11] },
      armor: { defense: [5, 8], maxHp: [10, 18] },
      footwear: { defense: [2, 4], speed: [3, 6], maxHp: [3, 7] },
      accessory: { attack: [1, 3], defense: [1, 3], maxHp: [4, 9] },
    },
    namesBySlot: {
      weapon: ["缺口长剑", "黑铁战斧", "守墓战锤"],
      helmet: ["旧铁盔", "白骨面甲", "守卫兜帽"],
      armor: ["锁链甲", "墓穴胸甲", "符文护甲"],
      footwear: ["磨损皮靴", "守夜长靴", "逐风战靴"],
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
      // 可选：重铸额外消耗材料（2B）；关闭则只扣金币
      material: {
        enabled: true,
        materialId: "wild_essence",
        amount: 1,
      },
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

  /**
   * 材料目录（2B）。UI 一律走 materials.js 取中文名，禁止裸 id。
   * 用途：野外/事件掉落展示；重铸可选消耗（见 economy.reforge.material）。
   */
  materials: {
    defaultId: "wild_essence",
    outdoorByRegion: {
      forest: "wild_essence",
      desert: "desert_glass",
    },
    reforge: {
      enabled: true,
      materialId: "wild_essence",
      amount: 1,
    },
    catalog: {
      wild_essence: {
        id: "wild_essence",
        name: "荒野精华",
        emoji: "✨",
        description: "从野外魔物身上凝聚的灵质，可用于重铸词条。",
      },
      bone_dust: {
        id: "bone_dust",
        name: "骨粉",
        emoji: "🦴",
        description: "晒干的碎骨粉末，祭坛与亡灵相关事件常见。",
      },
      desert_glass: {
        id: "desert_glass",
        name: "沙晶",
        emoji: "🔶",
        description: "黄沙中凝结的玻璃质晶体，荒漠特产。",
      },
      forest_resin: {
        id: "forest_resin",
        name: "腐化树脂",
        emoji: "🪵",
        description: "腐化林地渗出的粘稠树脂。",
      },
      shadow_shard: {
        id: "shadow_shard",
        name: "暗影碎片",
        emoji: "🌑",
        description: "稀有的暗影结晶。",
      },
    },
  },

  // 野外只计算前台完成的波次；不保存时间戳，也不推算离线收益。
  outdoor: {
    floorOffsetRange: [-2, 0],
    excludeBossFloors: true,
    enemyStatMultiplier: 0.9,
    experienceMultiplier: 0.8,
    goldMultiplier: 0.8,
    lootChancePerEnemy: 0.16,
    lootFloorOffset: -1,
    waveDelayMs: 720,
    materialsEnabled: true,
    materialDropChancePerEnemy: 0.12,
    materialId: "wild_essence",
    materialByRegion: {
      forest: "wild_essence",
      desert: "desert_glass",
    },
  },

  /**
   * 野外事件卡（2A）。加卡 = 加数据；逻辑见 events.js。
   * 城镇 / 副本内不触发；仅 outdoor 清波后按 eventChance 抽取。
   */
  events: {
    enabled: true,
    eventChance: 0.28,
    wavesBetweenEvents: 1,
    eliteBattle: {
      enemyStatMultiplier: 1.4,
      rewardMultiplier: 2,
      lootChance: 0.9,
      minimumRarity: "uncommon",
      enemyCount: 2,
    },
    cards: [
      {
        id: "treasure_chest",
        title: "锈蚀的宝箱",
        emoji: "📦",
        text: "藤蔓缠绕的宝箱半埋在落叶里，锁扣已经朽坏。",
        regions: ["forest"],
        weight: 12,
        options: [
          {
            label: "撬开它",
            outcomes: [
              { type: "loot", rarityBias: "uncommon" },
              { type: "gold", min: 20, max: 60 },
            ],
            ambush: { chance: 0.12, enemyCount: 2 },
            resultText: "箱子里有一些金币和一件装备。",
          },
          {
            label: "小心有诈，绕开",
            outcomes: [],
            resultText: "你绕开了宝箱，什么也没发生。",
          },
        ],
      },
      {
        id: "mystery_merchant",
        title: "神秘商人",
        emoji: "🧙",
        text: "斗篷遮面的商人从树影中走出，摊开一件蒙尘的货品。",
        weight: 10,
        options: [
          {
            label: "花 80 金币买下",
            outcomes: [
              { type: "spendGold", amount: 80 },
              { type: "loot", rarityBias: "rare" },
            ],
            failText: "商人轻笑一声：穷鬼也敢砍价？",
            resultText: "商人收起金币，把货品塞进你手里后消失了。",
          },
          {
            label: "离开",
            outcomes: [],
            resultText: "你摆摆手走开，商人没再纠缠。",
          },
        ],
      },
      {
        id: "elite_ambush",
        title: "精英伏击",
        emoji: "⚔️",
        text: "灌木突然炸开，几道凶光已经扑到面前——无路可退！",
        weight: 8,
        options: [
          {
            label: "迎战！",
            outcomes: [{ type: "battle", enemyCount: 2 }],
            resultText: "你握紧武器，迎接伏击。",
          },
        ],
      },
      {
        id: "ancient_altar",
        title: "古老祭坛",
        emoji: "⛲",
        text: "青苔覆盖的石坛仍残留微弱灵光，仿佛在等待献祭。",
        weight: 9,
        options: [
          {
            label: "献上 50 金币",
            outcomes: [
              { type: "spendGold", amount: 50 },
              { type: "buff", stat: "attack", amount: 1 },
              { type: "experience", min: 40, max: 90 },
            ],
            failText: "祭坛沉默着，你的金币不够。",
            resultText: "灵光一闪，你感到力量微微上涨。",
          },
          {
            label: "无视",
            outcomes: [],
            resultText: "你没有打扰这座古坛。",
          },
        ],
      },
      {
        id: "wounded_traveler",
        title: "受伤的旅人",
        emoji: "🩸",
        text: "一名旅人靠在树干上，伤口还在渗血，眼神却仍警惕。",
        weight: 10,
        options: [
          {
            label: "救助（花费 30 金币）",
            outcomes: [
              { type: "spendGold", amount: 30 },
              { type: "experience", min: 30, max: 70 },
              { type: "questFlag", flag: "helped_traveler" },
            ],
            failText: "你想帮忙，却掏不出足够的药钱。",
            resultText: "旅人感激地留下几句情报：林中腐狼异常活跃。",
          },
          {
            label: "趁火打劫",
            outcomes: [
              { type: "gold", min: 25, max: 55 },
              { type: "questFlag", flag: "robbed_traveler" },
            ],
            resultText: "你搜走了旅人的钱袋。他虚弱的目光在背后刺痛你。",
          },
          {
            label: "无视",
            outcomes: [],
            resultText: "你移开视线继续赶路。",
          },
        ],
      },
      {
        id: "strange_mushroom",
        title: "诡异蘑菇",
        emoji: "🍄",
        text: "一丛发着幽蓝荧光的蘑菇长在朽木上，闻起来有点甜。",
        weight: 11,
        options: [
          {
            label: "吃掉它",
            outcomes: [
              { type: "experience", min: 10, max: 120 },
              { type: "gold", min: 0, max: 40 },
            ],
            ambush: { chance: 0.2, enemyCount: 1 },
            resultText: "味道……难以形容。你的视野晃了一下。",
          },
          {
            label: "不吃",
            outcomes: [],
            resultText: "你把蘑菇踢开，继续前进。",
          },
        ],
      },
      {
        id: "unclaimed_corpse",
        title: "无主尸骸",
        emoji: "💀",
        text: "路边倒着一具风干的尸骸，背包带还半挂在肩上。",
        weight: 10,
        options: [
          {
            label: "搜刮",
            outcomes: [
              { type: "gold", min: 15, max: 45 },
              { type: "material", id: "wild_essence", min: 1, max: 2 },
            ],
            ambush: { chance: 0.18, enemyCount: 2 },
            resultText: "你翻出一些散落的金币与残破材料。",
          },
          {
            label: "走开",
            outcomes: [],
            resultText: "你对死者抱拳，没有惊扰长眠。",
          },
        ],
      },
      {
        id: "moonlit_spring",
        title: "月光泉",
        emoji: "🌙",
        text: "银色月光穿过枝叶，落在一眼仍未被腐化的泉水上。泉底有古老符文缓缓明灭。",
        regions: ["forest"],
        weight: 9,
        once: true,
        options: [
          {
            label: "饮下泉水",
            outcomes: [
              { type: "heal", min: 35, max: 70 },
              { type: "buff", stat: "speed", amount: 1 },
            ],
            resultText: "清凉的泉水驱散疲惫，你的脚步也变得轻盈。",
          },
          {
            label: "装取一瓶",
            outcomes: [{ type: "material", id: "wild_essence", min: 2, max: 3 }],
            resultText: "泉水离开月光后凝成数缕荒野精华。",
          },
        ],
      },
      {
        id: "trapped_hunter",
        title: "被困的猎人",
        emoji: "🏹",
        text: "倒伏的枯木下压着一名猎人，远处的腐狼嚎声正在迅速靠近。",
        regions: ["forest"],
        weight: 10,
        options: [
          {
            label: "合力救人",
            outcomes: [
              { type: "experience", min: 45, max: 90 },
              { type: "gold", min: 20, max: 45 },
              { type: "questFlag", flag: "rescued_hunter" },
            ],
            ambush: { chance: 0.16, enemyCount: 2 },
            resultText: "猎人脱困后把酬金塞给你，并标出了附近兽径。",
          },
          {
            label: "先击退狼群",
            outcomes: [{ type: "battle", enemyCount: 2, minimumRarity: "uncommon" }],
            resultText: "你挡在猎人与狼群之间，拔出了武器。",
          },
        ],
      },
      {
        id: "whispering_roots",
        title: "低语树根",
        emoji: "🌳",
        text: "巨树裸露的根系像手指般扣住一块发光矿石，树皮下传出含混的低语。",
        regions: ["forest"],
        weight: 9,
        options: [
          {
            label: "砍开根系",
            outcomes: [{ type: "material", id: "wild_essence", min: 2, max: 4 }],
            ambush: { chance: 0.28, enemyCount: 2 },
            resultText: "矿石化为浓郁精华，而林地深处也响起愤怒的枝叶摩擦声。",
          },
          {
            label: "聆听低语",
            outcomes: [
              { type: "experience", min: 55, max: 115 },
              { type: "damage", min: 8, max: 22 },
            ],
            resultText: "古老记忆涌入脑海，也留下了一阵撕裂般的头痛。",
          },
        ],
      },
      {
        id: "abandoned_campfire",
        title: "废弃营火",
        emoji: "🏕️",
        text: "营火尚有余温，半张地图被匕首钉在树桩上，营地主人却不见踪影。",
        regions: ["forest"],
        weight: 11,
        options: [
          {
            label: "休息片刻",
            outcomes: [{ type: "heal", min: 25, max: 55 }],
            resultText: "你拨旺余烬，短暂的安宁让伤势有所缓解。",
          },
          {
            label: "搜寻补给",
            outcomes: [
              { type: "gold", min: 12, max: 38 },
              { type: "material", id: "wild_essence", min: 1, max: 2 },
            ],
            ambush: { chance: 0.14, enemyCount: 1 },
            resultText: "你在帐篷夹层里找到了一些补给。",
          },
        ],
      },
      {
        id: "desert_mirage",
        title: "沙中蜃景",
        emoji: "🌫️",
        text: "热浪里浮现一座宫殿的轮廓，走近却只剩碎玻璃般的沙晶。",
        regions: ["desert"],
        weight: 11,
        options: [
          {
            label: "拾取沙晶",
            outcomes: [
              { type: "material", id: "desert_glass", min: 1, max: 2 },
              { type: "gold", min: 10, max: 35 },
            ],
            resultText: "你装起几块灼热的沙晶。",
          },
          {
            label: "别被迷惑",
            outcomes: [],
            resultText: "你移开目光，蜃景消散。",
          },
        ],
      },
      {
        id: "bone_caravan",
        title: "枯骨商队",
        emoji: "🐪",
        text: "一队无声的枯骨骆驼路过，驼峰上挂着落满沙尘的货囊。",
        regions: ["desert"],
        weight: 9,
        options: [
          {
            label: "交易（60 金）",
            outcomes: [
              { type: "spendGold", amount: 60 },
              { type: "loot", rarityBias: "uncommon" },
              { type: "material", id: "desert_glass", amount: 1 },
            ],
            failText: "商队没有停步——你的金币不够。",
            resultText: "枯骨递来一件装备和一块沙晶，随即没入沙暴。",
          },
          {
            label: "目送离开",
            outcomes: [],
            resultText: "驼铃远去，只剩风声。",
          },
        ],
      },
      {
        id: "desert_storm",
        title: "沙暴来袭",
        emoji: "🌪️",
        text: "地平线骤然消失，遮天蔽日的沙墙卷着碎石向你压来。",
        regions: ["desert"],
        weight: 12,
        options: [
          {
            label: "寻找背风岩缝",
            outcomes: [
              { type: "damage", min: 5, max: 18 },
              { type: "experience", min: 30, max: 65 },
            ],
            resultText: "你顶着风沙找到掩体，只受了些擦伤。",
          },
          {
            label: "迎着沙暴前进",
            outcomes: [
              { type: "material", id: "desert_glass", min: 2, max: 4 },
              { type: "damage", min: 18, max: 42 },
            ],
            resultText: "沙暴几乎将你掀翻，但风眼里散落着珍贵的沙晶。",
          },
        ],
      },
      {
        id: "buried_armory",
        title: "地下军械库",
        emoji: "🗡️",
        text: "塌陷的沙坑露出一扇铜门，门后整齐排列着早已蒙尘的兵器架。",
        regions: ["desert"],
        minWorldLevel: 5,
        weight: 8,
        options: [
          {
            label: "取走保存完好的装备",
            outcomes: [{ type: "loot", rarityBias: "rare" }],
            ambush: { chance: 0.35, enemyCount: 2, minimumRarity: "uncommon" },
            resultText: "你取下一件仍有锋芒的装备，身后的甲胄却开始自行移动。",
          },
          {
            label: "拆取金属零件",
            outcomes: [
              { type: "gold", min: 45, max: 85 },
              { type: "material", id: "desert_glass", amount: 1 },
            ],
            resultText: "锈蚀零件仍能卖个好价钱，夹层里还藏着一块沙晶。",
          },
        ],
      },
      {
        id: "singing_bones",
        title: "会唱歌的骨堆",
        emoji: "🎵",
        text: "风穿过遍地兽骨，竟拼成一段反复回响的古老旋律。",
        regions: ["desert"],
        weight: 10,
        options: [
          {
            label: "跟随旋律敲击骨片",
            outcomes: [
              { type: "experience", min: 70, max: 140 },
              { type: "material", id: "desert_glass", min: 1, max: 2 },
            ],
            resultText: "最后一个音符落下，骨堆碎成一圈闪光的沙晶。",
          },
          {
            label: "打乱这诡异的节奏",
            outcomes: [{ type: "damage", min: 12, max: 30 }],
            ambush: { chance: 0.34, enemyCount: 2 },
            resultText: "旋律戛然而止，尖锐回声震得你耳膜发痛。",
          },
        ],
      },
      {
        id: "dry_well",
        title: "干涸水井",
        emoji: "🕳️",
        text: "石井早已见底，井壁却刻着商旅用来藏匿财物的旧暗号。",
        regions: ["desert"],
        weight: 11,
        options: [
          {
            label: "系绳下井",
            outcomes: [
              { type: "gold", min: 35, max: 90 },
              { type: "material", id: "desert_glass", min: 1, max: 3 },
            ],
            ambush: { chance: 0.18, enemyCount: 1 },
            resultText: "暗格里还留着一只钱袋和几块沙晶。",
          },
          {
            label: "投下一枚金币试探",
            outcomes: [
              { type: "spendGold", amount: 1 },
              { type: "experience", min: 25, max: 55 },
            ],
            failText: "你摸遍口袋，连一枚试探用的金币都没有。",
            resultText: "金币落地的回声帮你判断出井下没有活物，至少学到了一点荒漠经验。",
          },
        ],
      },
    ],
  },

  /**
   * 城镇 NPC + 任务（2B：任务链 + 对话树 + 荒漠线）。
   */
  quests: {
    npcs: {
      forest_elder: {
        id: "forest_elder",
        name: "林地长老",
        emoji: "🧝",
        town: "forest_town",
        blurb: "灰烬村的守护者，为腐化蔓延忧心忡忡。",
        quests: ["cull_wolves", "investigate_altar", "seal_corruption"],
        dialogue: {
          root: {
            text: "年轻的冒险者，腐化正在吞噬这片森林……腐狼的嚎叫一夜比一夜近。",
            options: [
              { label: "我能帮上什么？", goto: "offer_quest" },
              { label: "关于腐化的源头……", goto: "about_corruption" },
              { label: "这村子还安全吗？", goto: "about_village" },
              { label: "告辞", end: true },
            ],
          },
          offer_quest: {
            text: "林中的腐狼越来越多。替我清剿 10 只，如何？事成之后，村中不会亏待你。",
            options: [
              { label: "接下任务", acceptQuest: "cull_wolves", end: true },
              { label: "再考虑", end: true },
            ],
          },
          about_corruption: {
            text: "腐化从地穴深处渗出。清完腐狼后，我需要你去查一座古老祭坛……那是腐化的裂口之一。",
            options: [
              { label: "我先去清狼", goto: "offer_quest" },
              { label: "告辞", end: true },
            ],
          },
          about_village: {
            text: "炉火还在，城墙还在。只要还有人愿意拔剑，灰烬村就不会倒。",
            options: [
              { label: "关于腐狼……", goto: "offer_quest" },
              { label: "告辞", end: true },
            ],
          },
          offer_altar: {
            text: "你带回的消息让我不安。林中有一座古老祭坛正在渗出黑雾——去野外再击杀 8 只魔物，探清情况，再回来。",
            options: [
              { label: "我这就去", acceptQuest: "investigate_altar", end: true },
              { label: "稍后再说", end: true },
            ],
          },
          offer_seal: {
            text: "最后一步：深入腐化地穴，至少肃清第 5 层的守护者。封印需要它倒下的回响。",
            options: [
              { label: "交给我", acceptQuest: "seal_corruption", end: true },
              { label: "我再准备一下", end: true },
            ],
          },
        },
      },
      forest_quartermaster: {
        id: "forest_quartermaster",
        name: "军需官玛莎",
        emoji: "🛡️",
        town: "forest_town",
        blurb: "管着商店与补给，说话简短却可靠。",
        dialogue: {
          root: {
            text: "需要补给就去商店；破损的装备可以在背包里重铸——现在重铸会消耗一点荒野精华。别在野外硬扛。",
            options: [
              { label: "荒野精华是什么？", goto: "about_essence" },
              { label: "明白了", end: true },
            ],
          },
          about_essence: {
            text: "野外魔物身上掉的灵质。攒着，重铸词条时能用上。",
            options: [
              { label: "谢谢", end: true },
            ],
          },
        },
      },
      desert_guide: {
        id: "desert_guide",
        name: "沙海向导莱拉",
        emoji: "🧕",
        town: "desert_town",
        blurb: "绿洲镇的向导，熟悉沙暴与亡骨之路。",
        quests: ["cull_scorpions", "retrieve_glass"],
        dialogue: {
          root: {
            text: "黄沙底下埋着旧日王国。想在这儿活下去，先学会听风——以及躲开沙蝎。",
            options: [
              { label: "有什么活？", goto: "offer_scorpions" },
              { label: "这绿洲安全吗？", goto: "about_oasis" },
              { label: "告辞", end: true },
            ],
          },
          offer_scorpions: {
            text: "商路被沙蝎堵了。替我清掉 8 只，绿洲会记你一功。",
            options: [
              { label: "接下", acceptQuest: "cull_scorpions", end: true },
              { label: "再看看", end: true },
            ],
          },
          about_oasis: {
            text: "泉水还在，城墙半塌。再往东是枯骨废墟，别一个人夜里走。",
            options: [
              { label: "关于沙蝎……", goto: "offer_scorpions" },
              { label: "告辞", end: true },
            ],
          },
          offer_glass: {
            text: "沙蝎清了不少。再帮我收集 3 块沙晶——重铸与封印都缺这东西。",
            options: [
              { label: "我去找", acceptQuest: "retrieve_glass", end: true },
              { label: "稍后", end: true },
            ],
          },
        },
      },
    },
    quests: {
      cull_wolves: {
        id: "cull_wolves",
        name: "清剿腐狼",
        giver: "forest_elder",
        description: "清剿腐化林地中的 10 只腐狼，回报林地长老。",
        objective: {
          type: "kill",
          target: "corrupt_wolf",
          targetName: "腐狼",
          count: 10,
        },
        rewards: [
          { type: "gold", amount: 200 },
          { type: "experience", amount: 500 },
          { type: "loot", rarityBias: "rare" },
        ],
        nextQuest: "investigate_altar",
      },
      investigate_altar: {
        id: "investigate_altar",
        name: "祭坛异象",
        giver: "forest_elder",
        description: "在腐化林地野外再击杀 8 只魔物，探查祭坛渗出的黑雾。",
        chainLocked: true,
        prerequisite: "cull_wolves",
        objective: {
          type: "kill",
          target: "*",
          targetName: "魔物",
          count: 8,
        },
        rewards: [
          { type: "gold", amount: 280 },
          { type: "experience", amount: 700 },
          { type: "material", id: "forest_resin", amount: 2 },
        ],
        nextQuest: "seal_corruption",
      },
      seal_corruption: {
        id: "seal_corruption",
        name: "封印裂口",
        giver: "forest_elder",
        description: "通关腐化地穴第 5 层（区域守护者），为封印提供回响。",
        chainLocked: true,
        prerequisite: "investigate_altar",
        objective: {
          type: "clear_dungeon",
          target: "floor",
          floorId: 5,
          targetName: "第 5 层守护者",
          count: 1,
        },
        rewards: [
          { type: "gold", amount: 500 },
          { type: "experience", amount: 1200 },
          { type: "loot", rarityBias: "rare" },
          { type: "material", id: "shadow_shard", amount: 1 },
        ],
        nextQuest: null,
      },
      cull_scorpions: {
        id: "cull_scorpions",
        name: "清剿沙蝎",
        giver: "desert_guide",
        description: "在枯骨荒漠击杀 8 只沙蝎，疏通商路。",
        objective: {
          type: "kill",
          target: "sand_scorpion",
          targetName: "沙蝎",
          count: 8,
        },
        rewards: [
          { type: "gold", amount: 350 },
          { type: "experience", amount: 800 },
          { type: "loot", rarityBias: "uncommon" },
        ],
        nextQuest: "retrieve_glass",
      },
      retrieve_glass: {
        id: "retrieve_glass",
        name: "收集沙晶",
        giver: "desert_guide",
        description: "收集 3 块沙晶（荒漠野外与事件可获得）。",
        chainLocked: true,
        prerequisite: "cull_scorpions",
        objective: {
          type: "collect",
          target: "desert_glass",
          targetName: "沙晶",
          count: 3,
        },
        rewards: [
          { type: "gold", amount: 400 },
          { type: "experience", amount: 900 },
          { type: "loot", rarityBias: "rare" },
        ],
        nextQuest: null,
      },
    },
  },

  /**
   * 世界地图（骨架 + 腐化林地 + 枯骨荒漠 + SVG 沉浸布局）。
   * 世界等级与 highestUnlockedFloor 对齐；区域解锁见 unlockRules。
   * 节点 x/y 为列表视图相对坐标；mapX/mapY 为 SVG viewBox 坐标。
   */
  world: {
    starterRegionId: "forest",
    regionOrder: ["forest", "desert", "abyss", "void"],
    /**
     * 区域解锁：clear_boss_floor = 通关指定 Boss 层后解锁。
     * desert ← 林地第 5 层 Boss；abyss/void 仍为占位。
     */
    unlockRules: {
      desert: { type: "clear_boss_floor", floorId: 5 },
      abyss: { type: "clear_boss_floor", floorId: 20 },
      void: { type: "clear_boss_floor", floorId: 45 },
    },
    map: {
      // 约 16:9 画布；林地主舞台 + 荒漠可玩区
      viewBox: [0, 0, 1000, 560],
      edges: [
        ["forest_town", "forest_wild_path"],
        ["forest_town", "forest_wild_vale"],
        ["forest_wild_path", "forest_dungeon"],
        ["forest_wild_vale", "forest_dungeon"],
        ["forest_dungeon", "desert_town"],
        ["desert_town", "desert_wild_dunes"],
        ["desert_town", "desert_wild_ruins"],
        ["desert_wild_dunes", "desert_dungeon"],
        ["desert_wild_ruins", "desert_dungeon"],
        ["desert_dungeon", "abyss_town"],
        ["abyss_town", "abyss_wild_rift"],
        ["abyss_town", "abyss_wild_forge"],
        ["abyss_wild_rift", "abyss_dungeon"],
        ["abyss_wild_forge", "abyss_dungeon"],
        ["abyss_dungeon", "void_town"],
        ["void_town", "void_wild_shards"],
        ["void_town", "void_wild_echoes"],
        ["void_wild_shards", "void_dungeon"],
        ["void_wild_echoes", "void_dungeon"],
      ],
      regionShapes: {
        // 林地：主舞台，约占画布 55% 宽
        forest: {
          path: "M30,50 C120,18 260,12 400,40 C520,68 580,140 575,250 C570,360 500,460 360,500 C220,535 90,500 45,380 C15,280 10,140 30,50 Z",
          fill: "#1f3a28",
          stroke: "#3d6b45",
          label: { x: 320, y: 76 },
        },
        // 荒漠：解锁后成为第二可玩区
        desert: {
          path: "M590,60 C680,35 760,55 790,130 C815,200 800,300 760,360 C720,415 640,420 600,360 C565,300 555,160 590,60 Z",
          fill: "#4a3a22",
          stroke: "#8a6a3a",
          label: { x: 690, y: 210 },
        },
        abyss: {
          path: "M780,150 C850,120 920,145 945,220 C965,285 950,370 900,420 C850,465 780,450 755,380 C735,320 740,200 780,150 Z",
          fill: "#3a1818",
          stroke: "#7a3030",
          label: { x: 860, y: 290 },
        },
        void: {
          path: "M900,40 C955,20 990,55 995,120 C998,175 970,220 930,235 C895,248 860,210 855,150 C850,95 870,55 900,40 Z",
          fill: "#1a1228",
          stroke: "#4a3870",
          label: { x: 930, y: 120 },
        },
      },
      decorations: [
        { kind: "tree", x: 92, y: 142, size: 1.15, rotation: -5, opacity: 0.58 },
        { kind: "tree", x: 132, y: 420, size: 1.35, rotation: 4, opacity: 0.46 },
        { kind: "tree", x: 288, y: 455, size: 0.92, rotation: -6, opacity: 0.52 },
        { kind: "tree", x: 470, y: 356, size: 1.1, rotation: 7, opacity: 0.5 },
        { kind: "mountain", x: 420, y: 88, size: 1.4, rotation: -2, opacity: 0.48 },
        { kind: "ruin", x: 508, y: 438, size: 0.9, rotation: 3, opacity: 0.48 },
        { kind: "dune", x: 622, y: 108, size: 1.15, rotation: -4, opacity: 0.58 },
        { kind: "dune", x: 724, y: 337, size: 1.35, rotation: 6, opacity: 0.54 },
        { kind: "ruin", x: 746, y: 122, size: 0.82, rotation: -3, opacity: 0.52 },
        { kind: "skull", x: 640, y: 395, size: 0.72, rotation: 9, opacity: 0.58 },
        { kind: "mountain", x: 842, y: 402, size: 1.25, rotation: 5, opacity: 0.44 },
        { kind: "camp", x: 892, y: 362, size: 0.8, rotation: -5, opacity: 0.62 },
        { kind: "skull", x: 918, y: 186, size: 0.66, rotation: -8, opacity: 0.5 },
      ],
    },
    regions: {
      forest: {
        id: "forest",
        name: "腐化林地",
        emoji: "🌲",
        theme: "森林 / 野兽",
        description: "被暗影浸透的古老森林，狼群与蛛类盘踞其间。",
        worldLevelRange: [1, 20],
        unlockHint: "起始区域",
        nodes: [
          {
            id: "forest_town",
            type: "town",
            name: "灰烬村",
            emoji: "🏰",
            description: "林地边缘的避难所。铁匠铺的炉火仍在燃烧，村长在任务板前焦躁踱步。",
            flavor: "「只要炉火不灭，我们还能守住这片土地。」",
            x: 22,
            y: 48,
            mapX: 200,
            mapY: 300,
          },
          {
            id: "forest_wild_path",
            type: "outdoor",
            name: "暮色林径",
            emoji: "🌲",
            description: "狼嚎回荡的林间小道，适合补给与刷取装备。",
            x: 48,
            y: 32,
            mapX: 360,
            mapY: 150,
          },
          {
            id: "forest_wild_vale",
            type: "outdoor",
            name: "蛛网幽谷",
            emoji: "🕸️",
            description: "蛛丝缠绕的谷地，魔物更为密集。",
            x: 52,
            y: 68,
            mapX: 340,
            mapY: 420,
          },
          {
            id: "forest_dungeon",
            type: "dungeon",
            name: "腐化地穴",
            emoji: "🏛️",
            description: "深入地下的遗迹入口。逐层推进，挑战更强的守护者。",
            x: 78,
            y: 50,
            mapX: 490,
            mapY: 280,
          },
        ],
      },
      // 枯骨荒漠：通关林地 5 层 Boss 后解锁
      desert: {
        id: "desert",
        name: "枯骨荒漠",
        emoji: "🏜️",
        theme: "沙漠 / 亡灵",
        description: "黄沙掩埋的旧日王国，亡灵在热风中游荡。",
        worldLevelRange: [15, 45],
        unlockHint: "通关腐化地穴第 5 层后解锁",
        // 掉落倾向：偏爆发/暴击（game/loot 可读取 bias 标签）
        lootBias: ["critChance", "critDamage", "attack"],
        outdoorFloorBonus: 4,
        outdoorEnemyStatMultiplier: 1.08,
        nodes: [
          {
            id: "desert_town",
            type: "town",
            name: "绿洲镇",
            emoji: "🏕️",
            description: "沙海中的补给站。向导莱拉在井边等待旅人。",
            flavor: "「风停的时候，连骨头都会唱歌。」",
            x: 28,
            y: 42,
            mapX: 640,
            mapY: 220,
          },
          {
            id: "desert_wild_dunes",
            type: "outdoor",
            name: "流沙丘",
            emoji: "🏜️",
            description: "沙蝎潜伏的丘地，掉落偏重爆发词条。",
            x: 52,
            y: 28,
            mapX: 720,
            mapY: 140,
          },
          {
            id: "desert_wild_ruins",
            type: "outdoor",
            name: "枯骨废墟",
            emoji: "💀",
            description: "半埋的石柱与亡骨，魔物更强、回报更高。",
            x: 58,
            y: 62,
            mapX: 740,
            mapY: 320,
          },
          {
            id: "desert_dungeon",
            type: "dungeon",
            name: "沙葬王陵",
            emoji: "🏛️",
            description: "深入沙下的王陵。通关更高层后将通向更深区域。",
            x: 82,
            y: 48,
            mapX: 800,
            mapY: 240,
            // 荒漠副本从较高层起步（数据提示，逻辑仍用全局层数表）
            suggestedMinFloor: 15,
          },
        ],
      },
      abyss: {
        id: "abyss",
        name: "炼狱深渊",
        emoji: "🔥",
        theme: "地狱 / 恶魔",
        description: "裂隙深处涌出的硫磺与烈焰，恶魔军团的前哨。",
        worldLevelRange: [45, 75],
        unlockHint: "通关枯骨荒漠更高层后解锁",
        lootBias: ["damageReduction", "armorPenetration", "lifesteal"],
        outdoorFloorBonus: 10,
        outdoorEnemyStatMultiplier: 1.14,
        nodes: [
          { id: "abyss_town", type: "town", name: "余烬堡垒", emoji: "🏰", description: "深渊边缘最后的军寨，铁匠以恶魔残骸维持熔炉。", x: 20, y: 48, mapX: 805, mapY: 350 },
          { id: "abyss_wild_rift", type: "outdoor", name: "灼热裂谷", emoji: "🔥", description: "烈焰从地壳裂口喷涌，怪物偏重灼烧与破甲。", x: 48, y: 28, mapX: 850, mapY: 215 },
          { id: "abyss_wild_forge", type: "outdoor", name: "恶魔熔炉", emoji: "⚒️", description: "废弃熔炉仍在运转，适合寻找防御与吸血词条。", x: 52, y: 66, mapX: 875, mapY: 390 },
          { id: "abyss_dungeon", type: "dungeon", name: "深渊王城", emoji: "🏛️", description: "通往七十层以后阶段检验的恶魔王城。", x: 82, y: 48, mapX: 925, mapY: 300, suggestedMinFloor: 45 },
        ],
      },
      void: {
        id: "void",
        name: "虚空秘境",
        emoji: "⚰️",
        theme: "终局 / 混合",
        description: "世界缝隙之外的混沌，仅强者得以踏入。",
        worldLevelRange: [75, 100],
        unlockHint: "通关炼狱深渊副本后解锁",
        lootBias: ["critChance", "damageReduction", "dodgeChance"],
        outdoorFloorBonus: 16,
        outdoorEnemyStatMultiplier: 1.2,
        nodes: [
          { id: "void_town", type: "town", name: "最后灯塔", emoji: "🗼", description: "现实边缘的最后补给站，远征者在此准备终局挑战。", x: 20, y: 50, mapX: 900, mapY: 155 },
          { id: "void_wild_shards", type: "outdoor", name: "破碎原野", emoji: "🌌", description: "漂浮的现实碎片间潜伏着高闪避虚空猎手。", x: 48, y: 28, mapX: 945, mapY: 80 },
          { id: "void_wild_echoes", type: "outdoor", name: "回声墓园", emoji: "⚰️", description: "历代远征者的回声仍在战斗，回报与危险并存。", x: 50, y: 68, mapX: 950, mapY: 190 },
          { id: "void_dungeon", type: "dungeon", name: "界外王座", emoji: "👁️", description: "终局副本。完成第 100 层检验，证明构筑真正成形。", x: 82, y: 50, mapX: 985, mapY: 125, suggestedMinFloor: 75 },
        ],
      },
    },
  },

  endgame: {
    objectives: [
      { id: "reach_50", floor: 50, name: "踏入深渊", description: "击败第 50 层守门者，进入完整的中后期循环。" },
      { id: "reach_85", floor: 85, name: "流派定型", description: "通过虚空检验，完成 25 点技能构筑与核心装备组合。" },
      { id: "clear_100", floor: 100, name: "终局征服", description: "击败第 100 层虚空君王，并继续挑战终局装备。" },
    ],
  },

  dungeon: {
    minFloor: 1,
    maxFloor: FLOOR_MAX,
    bossEveryFloors: 5,
    defaultEnemyCritDamage: 1.5,
    enemyStatVariance: 0.06,
    experiencePerEnemy: 20,
    goldPerEnemy: 9,
    bossRewardMultiplier: 4,
    // 精英怪:普通层小概率出现的强化敌人,带词缀、掉更多奖励。
    elites: {
      enabled: true,
      minFloor: 4, // 前几层留给新手,不刷精英
      baseChance: 0.05,
      chancePerFloor: 0.0025, // 每深一层增加的出现概率
      maxChance: 0.28,
      maxPerWave: 2,
      // 所有精英共享的基础强化(先乘,再叠加词缀效果)。
      statMultipliers: { maxHp: 1.7, attack: 1.25 },
      rewardMultiplier: 2.4,
      // 击败每名精英后,额外掉落一件装备的概率(game 层结算)。
      bonusLootChance: 0.4,
      // 词缀:键名以 Multiplier 结尾为乘法,否则为直接叠加。
      modifiers: [
        { id: "brutal", name: "狂暴", prefix: "狂暴的", stats: { attackMultiplier: 1.3 } },
        { id: "bulwark", name: "坚壁", prefix: "坚壁的", stats: { defenseMultiplier: 1.9, maxHpMultiplier: 1.15 } },
        { id: "swift", name: "迅影", prefix: "迅影的", stats: { speedMultiplier: 1.35, dodgeChance: 0.12 } },
        { id: "vampiric", name: "嗜血", prefix: "嗜血的", stats: { lifesteal: 0.18 } },
        { id: "thorny", name: "荆棘", prefix: "荆棘的", stats: { thorns: 0.22 } },
        { id: "blazing", name: "灼热", prefix: "灼热的", stats: { burnChance: 0.35 } },
      ],
    },
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
