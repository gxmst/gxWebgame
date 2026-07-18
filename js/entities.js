import { CONFIG } from "./config.js";

let nextEntityId = 1;

export function resetEntityIds(start = 1) {
  nextEntityId = Math.max(1, Math.floor(start));
}

// Speeds stay below the player; threats pressure by angle rather than raw pace.
export const SPECIES = CONFIG.species;

export function createPlayer(x, y, skin = "reef", accessory = "none") {
  return {
    id: "player",
    type: "player",
    species: "silver",
    skin,
    accessory,
    x,
    y,
    previousX: x,
    previousY: y,
    vx: 0,
    vy: 0,
    angle: 0,
    mass: 10,
    displayMass: 10,
    tier: 1,
    stamina: 100,
    dashing: false,
    dashLock: false,
    dashMinTime: 0,
    dashBoostTime: 0,
    staminaDelay: 0,
    invulnerable: 2,
    stunned: 0,
    entangledTimer: 0,
    environmentSlowScale: 1,
    alive: true,
    animOffset: 0,
    bodyTwist: 0,
  };
}

export function createFish(options) {
  const species = options.species || "silver";
  const random = options.random || Math.random;
  return {
    id: nextEntityId++,
    type: "fish",
    species,
    x: options.x,
    y: options.y,
    previousX: options.x,
    previousY: options.y,
    vx: options.vx || 0,
    vy: options.vy || 0,
    angle: options.angle ?? random() * Math.PI * 2,
    mass: options.mass,
    displayMass: options.mass,
    tier: options.tier || 1,
    state: "wander",
    stateTime: 0,
    decisionTimer: random() * 0.18,
    wanderAngle: options.angle ?? random() * Math.PI * 2,
    flockX: Math.cos(options.angle ?? 0),
    flockY: Math.sin(options.angle ?? 0),
    flockFleeX: 0,
    flockFleeY: 0,
    panicTimer: 0,
    directFearTimer: 0,
    schoolId: options.schoolId ?? null,
    baitSchool: options.baitSchool === true,
    spawnGrace: options.spawnGrace ?? 1,
    dashTimer: 0,
    dashCooldown: 1 + random() * 2,
    dashing: false,
    active: true,
    animOffset: random() * 10,
    bodyTwist: 0,
    environmentSlowScale: 1,
    label: SPECIES[species]?.label || "鱼",
  };
}

export function createJelly(x, y, random = Math.random) {
  return {
    id: nextEntityId++,
    type: "jelly",
    x,
    y,
    previousX: x,
    previousY: y,
    vx: (random() - 0.5) * 12,
    vy: 6 + random() * 8,
    radius: 22 + random() * 9,
    phase: random() * Math.PI * 2,
    cooldown: 0,
    active: true,
  };
}

export function createMine(x, y, random = Math.random) {
  return {
    id: nextEntityId++,
    type: "mine",
    x,
    y,
    radius: 23 + random() * 5,
    armTime: 1.1,
    fuseTime: 0,
    triggered: false,
    active: true,
    phase: random() * Math.PI * 2,
    vx: 0,
    vy: 0,
  };
}

export function createNetWarning(x, width) {
  return {
    id: nextEntityId++,
    type: "net",
    x,
    y: 0,
    width,
    height: 42,
    warningTime: 1.2,
    activeTime: 0,
    speed: 580,
    active: true,
  };
}
