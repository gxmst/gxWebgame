/**
 * Central gameplay and presentation tuning. Runtime systems should read values
 * from here instead of carrying local copies of balance constants.
 */
export const CONFIG = deepFreeze({
  game: {
    title: "大鱼吃小鱼",
    version: 1,
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
    victoryZoomPunch: 0.1,
    punchDecay: 10,
  },

  camera: {
    minZoom: 0.48,
    maxZoom: 1,
    massZoomExponent: 0.2,
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
    reef: { nutrition: 1, score: 1 },
    blueTail: { nutrition: 1, score: 1.1 },
    golden: { nutrition: 1.35, score: 1.8 },
    barracuda: { nutrition: 1.05, score: 1.25 },
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
    apexDurationSeconds: 30,
  },

  progression: {
    scorePerPearl: 500,
    victoryPearls: 10,
    firstTierPearls: { T2: 1, T3: 2, T4: 3, T5: 5, T6: 8 },
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
    backgroundParallax: 0.018,
    backgroundOverscan: 1.08,
    parallaxFar: 0.22,
    parallaxMid: 0.55,
    parallaxNear: 0.9,
    currentDriftX: 3.6,
    currentDriftY: -0.8,
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
