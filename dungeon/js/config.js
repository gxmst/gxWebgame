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
    maxMinions: 3,
    minionName: "骷髅战士",
    minionEmoji: "💀",
    // 召唤物属性 = 施法者当前属性 × 比例。
    minionHpRatio: 0.32,
    minionAttackRatio: 0.42,
    minionDefenseRatio: 0.4,
    minionSpeedRatio: 0.85,
    classIds: ["necromancer"],
    leveling: {
      initialLevel: 1,
      maxLevel: 10,
      perLevel: { minionHpRatio: 0.025, minionAttackRatio: 0.03 },
      milestones: [
        { level: 5, add: { maxMinions: 1 } },
        { level: 9, add: { summonCount: 1 } },
      ],
    },
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
    damageBonus: 0.32,
    lifestealBonus: 0.1,
    duration: 3,
    classIds: ["druid"],
    leveling: {
      initialLevel: 1,
      maxLevel: 10,
      perLevel: { damageBonus: 0.02 },
      milestones: [{ level: 7, add: { cooldown: -1 } }],
    },
  },
  rejuvenation: {
    id: "rejuvenation",
    name: "回春术",
    emoji: "🌱",
    type: "heal",
    multiplier: 0,
    cooldown: 4,
    resourceCost: 0,
    healRatio: 0.3,
    triggerBelowHpRatio: 0.6,
    classIds: ["druid"],
    leveling: {
      initialLevel: 1,
      maxLevel: 10,
      perLevel: { healRatio: 0.02 },
      milestones: [{ level: 8, add: { cooldown: -1 } }],
    },
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
    slots: ["helmet", "armor", "accessory"],
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
  { upTo: 9, name: "地穴回廊", emoji: "🕯️", description: "潮湿石阶向黑暗深处延伸，碎骨在脚边轻轻作响。", pool: ["bone_rat", "skeleton", "cultist"] },
  { upTo: 19, name: "白骨回廊", emoji: "💀", description: "骨墙之间回荡着甲片摩擦声，冷箭不知从何处袭来。", pool: ["skeleton", "skeleton_archer", "cultist"] },
  { upTo: 29, name: "腐朽墓室", emoji: "⚰️", description: "棺椁半开，腐气与蛛丝在墓室深处交织。", pool: ["ghoul", "cultist", "crypt_spider"] },
  { upTo: 39, name: "守卫大厅", emoji: "🛡️", description: "破损军旗悬在穹顶，重甲守卫封死了前路。", pool: ["crypt_guard", "ghoul", "skeleton_archer"] },
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
    version: "0.5.0",
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
        critChancePerAgility: 0.008,
        maxCritChance: 0.8,
        baseCritDamage: 1.6,
        baseDodgeChance: 0.05,
        dodgeChancePerAgility: 0.006,
        maxDodgeChance: 0.5,
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
        baseHp: 76,
        hpPerVitality: 12.5,
        hpPerLevel: 6,
        baseAttack: 5,
        attackPerLevel: 2,
        attackPerAttribute: { strength: 1.7, agility: 0.25, intelligence: 0.15, vitality: 0.5 },
        baseDefense: 1.8,
        defensePerVitality: 0.85,
        defensePerStrength: 0.25,
        defensePerLevel: 0.95,
        baseSpeed: 74,
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
    materialsEnabled: false,
    materialDropChancePerEnemy: 0,
    materialId: "wild_essence",
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
