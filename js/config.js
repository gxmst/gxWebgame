import { APP_VERSION } from "./version.js";

/**
 * Central gameplay and presentation tuning. Runtime systems should read values
 * from here instead of carrying local copies of balance constants.
 */
export const CONFIG = deepFreeze({
  game: {
    title: "大鱼吃小鱼",
    version: APP_VERSION,
  },

  world: {
    width: 6400,
    height: 3800,
    /** Toroidal open ocean: positions wrap; no hard walls or edge rails. */
    wrap: true,
    /** Fixed atmospheric plate; renderer falls back to its gradient until ready. */
    useBackgroundImage: true,
    backgroundImageUrl: "./assets/bg-ocean.jpg",
    backgroundTintAlpha: 0.5,
    softBoundary: 180,
    spawnPadding: 140,
    activePadding: 520,
  },

  /**
   * Depth-based water lighting. depthT = 0 at surface (y small), 1 at abyss.
   * Ambient is driven by camera depth; a screen gradient reinforces "up = bright".
   */
  lighting: {
    surfaceColor: "#1a9eb0",
    midColor: "#0a6178",
    deepColor: "#053748",
    abyssColor: "#02141e",
    surfaceGlow: "rgba(190, 245, 230, 0.22)",
    abyssVeil: "rgba(0, 8, 16, 0.72)",
    causticSurface: 0.16,
    causticAbyss: 0.03,
    sunbeamSurface: 0.12,
    sunbeamAbyss: 0.015,
    entityShadeSurface: 1,
    entityShadeAbyss: 0.42,
    /** How strongly vertical position on screen adds local brightness (0..1). */
    screenGradientStrength: 0.55,
  },

  dayNight: {
    periodSeconds: 210,
    startPhase: 0.2,
    nightStartThreshold: 0.62,
    dayStartThreshold: 0.72,
    nightScoreMultiplier: 1.15,
    nightHintDistanceScale: 0.78,
    nightBeamScale: 0.42,
    nightDarkenAlpha: 0.4,
    warmTintAlpha: 0.16,
    nightColor: "#071632",
    duskColor: "#d27348",
    dawnColor: "#efad72",
    lanternNightWeightBonus: 0.14,
    rareGlowNightBoost: 12,
  },

  simulation: {
    fixedStep: 1 / 60,
    maxFrameTime: 0.1,
    maxUpdatesPerFrame: 6,
  },

  viewport: {
    referenceWidth: 1280,
    referenceHeight: 720,
    maxDpr: 2,
  },

  /**
   * 程序化街机电子音乐。全部声部由 Web Audio 实时合成，不依赖音频文件。
   * 音量刻意偏低，sceneVolume 可分别调整标题、游玩、暂停与结算时的存在感。
   */
  music: {
    /** 独立背景音乐开关的默认值；旧存档缺少该字段时也使用此值。 */
    enabledByDefault: true,
    /** 音乐总线相对总音量的基础增益。 */
    baseVolume: 0.075,
    /** 不同界面的音乐强度，切换时会平滑过渡。 */
    sceneVolume: {
      title: 0.52,
      playing: 1,
      paused: 0.32,
      settings: 0.42,
      shop: 0.48,
      dying: 0.46,
      results: 0.56,
    },
    /** 首次启动和重新启用时的淡入秒数。 */
    fadeInSeconds: 1.8,
    /** 关闭音乐或切后台时的淡出秒数。 */
    fadeOutSeconds: 0.45,
    /** 标题、游玩、暂停等场景音量互相切换时的淡变秒数。 */
    sceneTransitionSeconds: 0.45,
    /** 每分钟节拍数，调大后旋律会更轻快。 */
    bpm: 116,
    /** 每拍切成几步；4 表示十六分音符步进。 */
    stepsPerBeat: 4,
    /** 每次定时检查的毫秒数，只负责把未来音符排进 AudioContext 时钟。 */
    schedulerIntervalMs: 25,
    /** 提前排入音频时钟的秒数，避免主线程卡顿造成节拍抖动。 */
    scheduleAheadSeconds: 0.15,
    /** 旋律基准频率（A3 附近），所有旋律音符都按半音偏移计算。 */
    rootFrequency: 220,
    /** 旋律层波形；方波是经典明亮的芯片音色。 */
    melodyWaveform: "square",
    /** 低音层波形；三角波让低八度有颗粒感但不会刺耳。 */
    bassWaveform: "triangle",
    /** 旋律层相对增益；最终还会乘 baseVolume 与总音量。 */
    melodyGain: 0.24,
    /** 低音层相对增益；最终还会乘 baseVolume 与总音量。 */
    bassGain: 0.16,
    /** 旋律音符起音时间（秒），越短越像街机提示音。 */
    melodyAttackSeconds: 0.006,
    /** 低音音符起音时间（秒）。 */
    bassAttackSeconds: 0.008,
    /** 音符占一个步长的比例，留出清晰的颗粒间隔。 */
    noteGate: 0.72,
    /** 起音后的快速衰减时间（秒）。 */
    noteDecaySeconds: 0.075,
    /** 旋律循环序列，数字是相对 rootFrequency 的半音；null 表示休止。 */
    melodySemitones: [0, 4, 7, 9, 7, 4, 2, 4, 5, 9, 12, 9, 7, 4, 2, 0],
    /** 低音循环序列，数字是相对低八度根音的半音；null 表示该步不打低音。 */
    bassSemitones: [0, null, 0, null, 5, null, 5, null, 7, null, 7, null, 9, null, 7, null],
  },

  mass: {
    start: 10,
    edibleRatio: 0.82,
    baseRadius: 14,
    radiusExponent: 0.5,
    collisionRadiusScale: 0.82,
    mouthRadiusScale: 0.46,
    mouthOffsetScale: 0.86,
    gainFactor: 0.22,
    growthVisualDuration: 0.25,
    /** 封神后的逻辑与视觉质量上限，避免巡游时继续无限膨胀。 */
    sovereignSoftCap: 150,
    /** 封神后保留的基础成长比例；得分不受此值影响。 */
    sovereignGrowthScale: 0.06,
    /** 越接近上限时成长衰减的指数，越大越早稳定。 */
    sovereignHeadroomExponent: 1.35,
  },

  tiers: [
    { id: "T1", index: 1, name: "鱼苗", threshold: 10, accent: "#7ee7df" },
    { id: "T2", index: 2, name: "小鱼", threshold: 16, accent: "#8fd36b" },
    { id: "T3", index: 3, name: "游猎者", threshold: 26, accent: "#f4d35e" },
    { id: "T4", index: 4, name: "大鱼", threshold: 42, accent: "#f6a65b" },
    { id: "T5", index: 5, name: "掠食者", threshold: 68, accent: "#f06f62" },
    { id: "T6", index: 6, name: "海洋霸主", threshold: 110, accent: "#f7efad" },
  ],

  movement: {
    baseSpeed: 250,
    speedMassExponent: -0.08,
    minSpeedScale: 0.82,
    maxSpeedScale: 1.08,
    acceleration: 990,
    idleDamping: 3.2,
    idleDampingFast: 6.4,
    idleSpeedSplit: 90,
    turnRateDeg: 500,
    boundarySteerStrength: 3.4,
    massInertiaExponent: 0.07,
  },

  /** NPC locomotion relative to the player — tuned for catchable prey and escapable threats. */
  ai: {
    /** Kept separate so player steering upgrades do not make NPCs twitchier. */
    turnRateDeg: 380,
    globalSpeedScale: 0.92,
    chaseSpeedCap: 0.78,
    fleeSpeedScale: 0.9,
    wanderSpeedScale: 0.85,
    recoverSpeedScale: 0.65,
    dashSpeedMultiplier: 1.12,
    fleeAccel: 4.6,
    normalAccel: 3.2,
  },

  dash: {
    maxStamina: 100,
    activationThreshold: 15,
    drainPerSecond: 38,
    recoveryDelay: 0.5,
    recoveryPerSecond: 27,
    minimumDuration: 0.12,
    speedMultiplier: 1.72,
    accelerationMultiplier: 1.48,
    turnMultiplier: 0.58,
    tierUpRefill: 14,
    boostDuration: 0.11,
    boostSpeedMultiplier: 1.28,
    boostImpulse: 95,
  },

  /**
   * 每局在 T2、T4、T6 触发一次确定性三选一；能力仅在本局生效。
   * 乘数以 1 为基准，staminaBonus 与 comboWindowBonusSeconds 为加法。
   */
  runBuilds: {
    milestoneTiers: ["T2", "T4", "T6"],
    choicesPerMilestone: 3,
    abilities: {
      "swift-current": {
        name: "逐流鳍",
        description: "普通游动速度提高 10%",
        effects: { speedMultiplier: 1.1 },
      },
      "deep-lungs": {
        name: "深潜肺",
        description: "体力上限增加 20",
        effects: { staminaBonus: 20 },
      },
      "second-wind": {
        name: "回潮",
        description: "体力恢复速度提高 18%",
        effects: { staminaRecoveryMultiplier: 1.18 },
      },
      "wide-jaw": {
        name: "宽吻",
        description: "吞噬判定范围扩大 12%",
        effects: { mouthMultiplier: 1.12 },
      },
      "golden-instinct": {
        name: "猎金本能",
        description: "所有猎食得分提高 15%",
        effects: { scoreMultiplier: 1.15 },
      },
      "dense-nutrition": {
        name: "高效消化",
        description: "猎食获得的成长提高 14%",
        effects: { massGainMultiplier: 1.14 },
      },
      "torpedo-dash": {
        name: "鱼雷冲刺",
        description: "冲刺速度提高 16%",
        effects: { dashSpeedMultiplier: 1.16 },
      },
      "efficient-dash": {
        name: "节能肌群",
        description: "冲刺体力消耗降低 18%",
        effects: { dashDrainMultiplier: 0.82 },
      },
      "feeding-frenzy": {
        name: "盛宴节奏",
        description: "连吃判定时间延长 0.9 秒",
        effects: { comboWindowBonusSeconds: 0.9 },
      },
    },
  },

  input: {
    relativeDeadzone: 6,
    relativeRadius: 64,
    relativeExponent: 0.72,
    absoluteDeadzone: 12,
    absoluteFullDistance: 150,
    absoluteMinStrength: 0.22,
    absoluteExponent: 0.78,
    nearSlowRadius: 48,
    nearSlowFloor: 0.35,
  },

  feel: {
    hitStopEat: 0.035,
    hitStopFringe: 0.055,
    hitStopGold: 0.07,
    hitStopTier: 0.08,
    hitStopDeath: 0.12,
    suckDuration: 0.13,
    suckEase: 2.4,
    eatZoomPunch: 0.045,
    fringeZoomPunch: 0.07,
    goldZoomPunch: 0.09,
    tierZoomPunch: 0.12,
    deathZoomPunch: 0.16,
    punchDecay: 10,
  },

  camera: {
    /** 成长期允许拉远到的下限，给 T5/T6 和大鱼群留出观察空间。 */
    minZoom: 0.3,
    maxZoom: 1,
    massZoomExponent: 0.2,
    /** 进入自由霸主模式后的稳定远景缩放。 */
    sovereignZoom: 0.52,
    followResponsiveness: 7.2,
    zoomResponsiveness: 5.5,
    lookAheadSeconds: 0.2,
    maxLookAhead: 118,
    visibilityMargin: 100,
    modes: {
      normal: {
        follow: 7.2,
        zoom: 5.5,
        lookAhead: 0.2,
        maxLookAhead: 118,
        zoomBias: 0,
      },
      dash: {
        follow: 9.5,
        zoom: 7,
        lookAhead: 0.28,
        maxLookAhead: 160,
        zoomBias: -0.04,
      },
      danger: {
        follow: 10.5,
        zoom: 8,
        lookAhead: 0.12,
        maxLookAhead: 70,
        zoomBias: 0.05,
      },
      tier: {
        follow: 5.5,
        zoom: 4.2,
        lookAhead: 0.1,
        maxLookAhead: 60,
        zoomBias: 0.08,
      },
      death: {
        follow: 3.2,
        zoom: 3.5,
        lookAhead: 0.04,
        maxLookAhead: 24,
        zoomBias: 0.14,
      },
    },
  },

  combo: {
    windowSeconds: 3.5,
    edgePreyBonusSeconds: 0.4,
    edgePreyRatio: 0.6,
    multiplierPerExtraEat: 0.15,
    maxMultiplier: 3,
  },

  scoring: {
    pointsPerMass: 10,
    minRiskMultiplier: 1,
    maxRiskMultiplier: 1.6,
    defaultSpeciesScore: 1,
  },

  species: {
    silver: { speed: 0.88, turn: 1.15, sense: 210, nutrition: 1, score: 1, label: "银鱼" },
    bluefin: { speed: 0.94, turn: 1.05, sense: 245, nutrition: 1.05, score: 1.12, label: "蓝尾鱼" },
    grouper: { speed: 0.72, turn: 0.7, sense: 190, nutrition: 1.24, score: 1.18, label: "石斑鱼" },
    puffer: { speed: 0.62, turn: 0.76, sense: 175, nutrition: 1.18, score: 1.26, label: "胖河豚" },
    lantern: { speed: 0.84, turn: 1.12, sense: 170, nutrition: 1.08, score: 1.48, label: "发光鱼", luminescent: true },
    barracuda: { speed: 0.96, turn: 0.84, sense: 300, nutrition: 1.08, score: 1.35, label: "梭鱼" },
    gold: { speed: 1.02, turn: 1.18, sense: 290, nutrition: 1.35, score: 2.8, label: "金色鱼", luminescent: true },
    sardine: { speed: 0.52, turn: 1.3, sense: 82, nutrition: 0.38, score: 0.48, label: "沙丁鱼" },
  },

  baitSchool: {
    enabled: true,
    initialDelaySeconds: 5,
    intervalMinSeconds: 12,
    intervalMaxSeconds: 18,
    retrySeconds: 2.5,
    sizeMin: 14,
    sizeMax: 18,
    maxSchools: 2,
    maxMembers: 32,
    massRatioMin: 0.2,
    massRatioMax: 0.36,
    clusterRadius: 72,
    offscreenMargin: 230,
    speedScale: 0.52,
    turnScale: 1.3,
    senseDistance: 82,
    nutrition: 0.38,
    score: 0.48,
    neighborRadius: 145,
    separationRadius: 26,
    neighborLimit: 10,
    cohesionWeight: 0.82,
    alignmentWeight: 0.78,
    separationWeight: 1.05,
    fleePlayerWeight: 0.38,
    fleeSchoolWeight: 0.72,
    panicDuration: 0.55,
    panicPropagationDistance: 180,
    scatterDistance: 54,
  },

  /**
   * 成长难度曲线。T1 到 T5 线性插值，T6 使用 sovereignWeights。
   * 每个比例、追击上限、体型上限和饵鱼衰减都可独立调整。
   */
  difficulty: {
    curveStartTier: 1,
    curveEndTier: 5,
    relationWeights: {
      tier1: { prey: 0.48, fringe: 0.22, neutral: 0.2, predator: 0.1 },
      tier5: { prey: 0.27, fringe: 0.2, neutral: 0.23, predator: 0.3 },
      sovereign: { prey: 0.44, fringe: 0.32, neutral: 0.24, predator: 0 },
    },
    preyWeightFloor: 0.25,
    fringeWeightFloor: 0.16,
    predatorRatioMin: 1.28,
    predatorRatioMaxTier1: 1.58,
    predatorRatioMaxTier5: 1.82,
    maxChasersByTier: [1, 1, 2, 2, 3, 3],
    baitSchool: {
      tier1IntervalScale: 1,
      tier5IntervalScale: 1.7,
      sovereignIntervalScale: 1.9,
      tier1SizeScale: 1,
      tier5SizeScale: 0.65,
      sovereignSizeScale: 0.55,
    },
    sovereignHazards: {
      transitionInvulnerabilitySeconds: 1.5,
      initialNetDelaySeconds: 5.5,
      netIntervalStartSeconds: 5.2,
      netIntervalMinSeconds: 2.1,
      netIntervalRampSeconds: 210,
      maxActiveNetsStart: 1,
      maxActiveNetsEnd: 3,
      maxActiveNetsRampSeconds: 240,
      netWidthViewportRatio: 0.24,
      netWidthMax: 320,
    },
  },

  /**
   * 环形世界按连续深度划分生态区；边界会在 transitionDepth 内平滑混合。
   * spawnMultipliers 影响生态关系、稀有鱼、鱼群与危险物的相对出现率。
   */
  biomes: {
    /** 新局出生在浅海一侧，给玩家留出熟悉操作的低风险窗口。 */
    startYRatio: 0.04,
    transitionDepth: 0.08,
    zones: [
      {
        id: "coral",
        name: "珊瑚浅海",
        maxDepth: 0.3,
        riskMultiplier: 0.78,
        rewardMultiplier: 0.9,
        arrivalMessage: "猎物密集，风险较低，但得分略少",
        tintColor: "#43c69f",
        tintAlpha: 0.075,
        spawnMultipliers: {
          prey: 1.3,
          fringe: 1.12,
          neutral: 0.98,
          predator: 0.64,
          bait: 1.22,
          hazard: 0.65,
          rare: 0.72,
        },
      },
      {
        id: "current",
        name: "开阔洋流",
        maxDepth: 0.68,
        riskMultiplier: 1,
        rewardMultiplier: 1,
        arrivalMessage: "生态均衡，适合稳定成长",
        tintColor: "#167f9b",
        tintAlpha: 0.035,
        spawnMultipliers: {
          prey: 1,
          fringe: 1,
          neutral: 1,
          predator: 1,
          bait: 1,
          hazard: 1,
          rare: 1,
        },
      },
      {
        id: "abyss",
        name: "深海暗区",
        maxDepth: 1,
        riskMultiplier: 1.28,
        rewardMultiplier: 1.32,
        arrivalMessage: "危险与稀有鱼更多，猎食收益提高",
        tintColor: "#291f55",
        tintAlpha: 0.13,
        spawnMultipliers: {
          prey: 0.78,
          fringe: 0.92,
          neutral: 0.9,
          predator: 1.42,
          bait: 0.76,
          hazard: 1.48,
          rare: 1.72,
        },
      },
    ],
  },

  /** 封神后按累计数据推进合同，完成一阶段即可主动返航。 */
  sovereignGoals: {
    extractAfterStages: 1,
    baseTargets: { elapsed: 20, eaten: 12, score: 600, netsDodged: 2 },
    targetGrowth: { elapsed: 5, eaten: 4, score: 300, netsDodged: 1 },
  },

  director: {
    targetEntityCount: 56,
    minEntityCount: 44,
    maxEntityCount: 72,
    playerSafeRadius: 300,
    dangerWarningSeconds: 0.8,
    preySoftGuaranteeSeconds: 6,
    preyHardGuaranteeSeconds: 10,
    preyGuaranteeSeconds: 10,
    openingGraceSeconds: 8,
    despawnDistance: 1500,
    ecology: {
      easyPrey: 0.4,
      edgePrey: 0.18,
      neutral: 0.2,
      threat: 0.17,
      special: 0.05,
    },
    massRanges: {
      easyPrey: [0.25, 0.6],
      edgePrey: [0.6, 0.82],
      neutral: [0.84, 1.18],
      threat: [1.24, 1.75],
    },
  },

  hazards: {
    jellyfishStunSeconds: 0.65,
    jellyfishSpeedScale: 0.25,
    /** 水雷在任何镜头缩放下至少显示到的屏幕像素半径。 */
    mineMinScreenRadius: 12,
    /** 水雷触发半径相对可见半径的比例，略小于视觉范围以保持宽容。 */
    mineTriggerVisualScale: 0.74,
  },

  /**
   * 渔网实体、清鱼反馈与补鱼节奏。宽度的难度曲线仍在
   * difficulty.sovereignHazards 中，这里控制单张网自身的行为。
   */
  net: {
    /** 网体的世界高度与下落速度。 */
    height: 42,
    speed: 580,
    /** 网从视口上方出生的世界偏移，用于计算独立生命周期。 */
    spawnTopOffset: 70,
    /** 落网前的黄色路径预警时长。 */
    warningSeconds: 1.2,
    /** 远景下网带至少可见的屏幕宽高。 */
    minScreenWidth: 64,
    minScreenHeight: 22,
    /** 预警带的基础/脉冲透明度与虚线宽度。 */
    warningFillAlpha: 0.26,
    warningPulseAlpha: 0.1,
    warningLineWidth: 3,
    warningColor: "#ffd078",
    /** 活动网体的填充、醒目外框与两端浮标。 */
    activeFillColor: "rgba(215, 224, 200, 0.5)",
    activeBorderColor: "#ffd078",
    activeBorderWidth: 2.5,
    edgeMarkerColor: "#ffb45e",
    edgeMarkerHighlightColor: "#fff1bc",
    edgeMarkerRadius: 5,
    edgeMarkerHighlightSize: 2,
    /** 致死/捕获范围相对可见网体略收窄，避免擦边误判。 */
    collisionVisualScale: 0.88,
    /** 网开始下落后等待此时间再捕鱼，可设为 0 立即启用。 */
    fishCaptureDelaySeconds: 0,
    /** 单条被捕鱼产生的气泡数，以及每张网最多反馈的鱼数。 */
    captureBubbleCount: 3,
    captureEffectFishLimit: 6,
    /** 被捕气泡的速度、上浮重力、寿命、尺寸与颜色。 */
    captureBubbleSpeed: 58,
    captureBubbleGravity: -28,
    captureBubbleLifeScale: 0.58,
    captureBubbleSizeScale: 0.66,
    captureBubbleColor: "#d8f6ee",
    /** 捕鱼产生的补鱼债务每批数量与批次间隔，避免眼前瞬间刷满。 */
    replenishBatchMax: 1,
    replenishIntervalSeconds: 0.58,
    /** 新鱼生成点需要避开活动网带的额外世界距离。 */
    spawnAvoidanceMargin: 90,
    /** 在网带外寻找普通/备用生成点的最大尝试次数。 */
    spawnAttempts: 16,
    spawnFallbackAttempts: 12,
    /** 网完全离开镜头后继续保留的世界距离。 */
    despawnPadding: 120,
  },

  environment: {
    interactionInterval: 0.1,
    seaweedCount: 28,
    seaweedRadiusMin: 38,
    seaweedRadiusMax: 64,
    seaweedPlayerSlowScale: 0.72,
    seaweedFishSlowScale: 0.8,
    trashCount: 10,
    trashRadius: 18,
    trashSlowScale: 0.64,
    trashSlowSeconds: 1.4,
    trashRetriggerSeconds: 2.4,
    shellCount: 14,
    shellRadius: 13,
    shellRareChance: 0.14,
    shellCommonPearls: 1,
    shellRarePearls: 4,
    mineTrackingTier: 5,
    mineTrackingSpeed: 34,
    mineTrackingSense: 520,
    mineTrackingResponse: 2.2,
  },

  progression: {
    scorePerPearl: 500,
    victoryPearls: 10,
    firstTierPearls: { T2: 1, T3: 2, T4: 3, T5: 5, T6: 8 },
  },

  /** 外观目录同时作为商店价格、像素配色和花纹的唯一数据源。 */
  cosmetics: {
    skins: {
      reef: {
        name: "珊瑚青",
        cost: 0,
        pattern: "scales",
        palette: { body: "#3fd4a8", light: "#c4ffe6", dark: "#0f6e78", fin: "#ffc84a", eye: "#0c2230", accent: "#9dffe0" },
      },
      coral: {
        name: "赤珊瑚",
        cost: 12,
        pattern: "spots",
        palette: { body: "#ff6f68", light: "#ffd2b0", dark: "#9a3658", fin: "#ffe066", eye: "#2a1528", accent: "#ffb0a0" },
      },
      midnight: {
        name: "午夜蓝",
        cost: 22,
        pattern: "stars",
        palette: { body: "#5aa8ff", light: "#c4e8ff", dark: "#344888", fin: "#d070ff", eye: "#0c1028", accent: "#a8d0ff" },
      },
      koi: {
        name: "锦鲤白",
        cost: 36,
        pattern: "patches",
        palette: { body: "#f2ebe0", light: "#ffffff", dark: "#cc4a3c", fin: "#1a2030", eye: "#101418", accent: "#ffb0a0" },
      },
      kelp: {
        name: "海藻绿",
        cost: 30,
        pattern: "bands",
        palette: { body: "#76ad55", light: "#d8ed89", dark: "#315f4c", fin: "#e0b84f", eye: "#13221b", accent: "#a9d66f" },
      },
      ember: {
        name: "熔火红",
        cost: 42,
        pattern: "zigzag",
        palette: { body: "#d94d45", light: "#ffd18c", dark: "#6e273b", fin: "#293343", eye: "#fff3d2", accent: "#ff8a4c" },
      },
      glacier: {
        name: "冰川银",
        cost: 48,
        pattern: "diamonds",
        palette: { body: "#b7dce0", light: "#f4ffff", dark: "#477792", fin: "#4fabc1", eye: "#102230", accent: "#83edf0" },
      },
      royal: {
        name: "鎏金紫",
        cost: 58,
        pattern: "royal",
        palette: { body: "#765a9e", light: "#ead5ff", dark: "#3c315f", fin: "#e6bd4a", eye: "#181326", accent: "#ffe58a" },
      },
    },
    accessories: {
      none: { name: "不佩戴", cost: 0, art: "none", bonusLabel: "纯粹本色" },
      crown: { name: "潮汐王冠", cost: 28, art: "crown", bonusLabel: "吞噬范围 +2%" },
      sailor: { name: "水手帽", cost: 20, art: "sailor", bonusLabel: "游动速度 +2%" },
      bowtie: { name: "泡泡领结", cost: 24, art: "bowtie", bonusLabel: "体力上限 +3%" },
      pearl: { name: "珍珠挂坠", cost: 32, art: "pearl", bonusLabel: "体力恢复 +3%" },
    },
  },

  /**
   * 配件的永久微加成。数值均为小数比例，并通过 upgradeEffects 与成长升级叠加。
   * 默认配件必须保持全零，确保不购买外观也能按原难度正常封神。
   */
  cosmeticBonus: {
    none: { speedPercent: 0, staminaPercent: 0, staminaRecoveryPercent: 0, mouthPercent: 0 },
    crown: { speedPercent: 0, staminaPercent: 0, staminaRecoveryPercent: 0, mouthPercent: 0.02 },
    sailor: { speedPercent: 0.02, staminaPercent: 0, staminaRecoveryPercent: 0, mouthPercent: 0 },
    bowtie: { speedPercent: 0, staminaPercent: 0.03, staminaRecoveryPercent: 0, mouthPercent: 0 },
    pearl: { speedPercent: 0, staminaPercent: 0, staminaRecoveryPercent: 0.03, mouthPercent: 0 },
  },

  leaderboard: {
    limit: 10,
    minScore: 1,
    minDurationMs: 5000,
  },

  save: {
    key: "bigfish.save.v1",
    version: 1,
  },

  visuals: {
    relationHintDistance: 420,
    relationHintDistanceContrast: 580,
    threatMarkerDistance: 300,
    threatMarkerDistanceContrast: 460,
    glowBudgetHigh: 18,
    glowBudgetLow: 6,
    fishAnimFrames: 8,
    spriteCacheMaxEntries: 512,
    backgroundParallax: 0.018,
    backgroundOverscan: 1.08,
    parallaxFar: 0.22,
    parallaxMid: 0.55,
    parallaxNear: 0.9,
    currentDriftX: 3.6,
    currentDriftY: -0.8,
    titlePlayerScreenXRatio: 0.5,
    titlePlayerScreenYRatio: 0.18,
  },

  effects: {
    lowQualityParticleScale: 0.45,
    particleBudgetHigh: 280,
    particleBudgetLow: 160,
    trailSpeedThreshold: 42,
    trailNormalInterval: 0.15,
    trailDashInterval: 0.055,
    trailNormalCount: 2,
    trailDashCount: 4,
    trailLifeScale: 0.48,
    trailSpeed: 58,
    trailSpread: 1.15,
    eatSplashNormal: 0.82,
    eatSplashFringe: 1.2,
    eatSplashGold: 1.58,
    eatBurstNormal: 8,
    eatBurstFringe: 12,
    eatBurstGold: 18,
    eatSuckFringeScale: 1.08,
    eatSuckGoldScale: 1.2,
    eatShakeNormal: 1.4,
    eatShakeFringe: 3.2,
    eatShakeGold: 5.5,
    baitBurstCount: 3,
    baitSplashEvery: 4,
    baitSplashIntensity: 0.28,
    baitSuckRadiusScale: 1.18,
    baitSuckDurationScale: 1.12,
    baitShake: 0.45,
    baitHitStop: 0.009,
    baitZoomPunch: 0.012,
    baitFeastThreshold: 8,
    baitFeastWindowSeconds: 3.5,
  },

  colors: {
    waterTop: "#0c6d87",
    waterDeep: "#083849",
    waterAbyss: "#071f2b",
    foam: "#bdeff0",
    text: "#f5fbf7",
    textMuted: "#b6ced0",
    prey: "#73e0a2",
    neutral: "#f2ce63",
    threat: "#f06c67",
    rare: "#ffe08a",
    stamina: "#61d4e8",
    panel: "rgba(5, 27, 35, 0.84)",
  },
});

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}
