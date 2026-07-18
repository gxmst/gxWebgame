import { CONFIG } from "./config.js";
import { normalize, wrapDelta } from "./math.js";

function range(random, min, max) {
  return min + (max - min) * random();
}

export function createEnvironment(world, random = Math.random) {
  const tuning = CONFIG.environment;
  const items = [];
  for (let index = 0; index < tuning.seaweedCount; index += 1) {
    items.push({
      id: `seaweed-${index}`,
      type: "seaweed",
      x: random() * world.width,
      y: random() * world.height,
      radius: range(random, tuning.seaweedRadiusMin, tuning.seaweedRadiusMax),
      phase: random() * Math.PI * 2,
      active: true,
    });
  }
  for (let index = 0; index < tuning.trashCount; index += 1) {
    items.push({
      id: `trash-${index}`,
      type: "trash",
      kind: random() < 0.58 ? "bag" : "debris",
      x: random() * world.width,
      y: random() * world.height,
      radius: tuning.trashRadius,
      phase: random() * Math.PI * 2,
      cooldown: 0,
      active: true,
    });
  }
  for (let index = 0; index < tuning.shellCount; index += 1) {
    const rare = random() < tuning.shellRareChance;
    items.push({
      id: `shell-${index}`,
      type: "shell",
      x: random() * world.width,
      y: random() * world.height,
      radius: tuning.shellRadius,
      phase: random() * Math.PI * 2,
      rare,
      value: rare ? tuning.shellRarePearls : tuning.shellCommonPearls,
      active: true,
    });
  }
  return items;
}

export function wrappedCircleTouches(a, b, world) {
  const dx = world.wrap === false ? b.x - a.x : wrapDelta(b.x, a.x, world.width);
  const dy = world.wrap === false ? b.y - a.y : wrapDelta(b.y, a.y, world.height);
  const radius = Math.max(0, a.radius ?? 0) + Math.max(0, b.radius ?? 0);
  return dx * dx + dy * dy <= radius * radius;
}

export function getSeaweedSlowScale(entity, items, world, fallback = 1) {
  const body = { x: entity.x, y: entity.y, radius: entity.radius ?? 0 };
  for (const item of items) {
    if (item.active && item.type === "seaweed" && wrappedCircleTouches(body, item, world)) {
      return fallback;
    }
  }
  return 1;
}

export function getMineTrackingTarget(mine, player, world) {
  if (mine.triggered || mine.armTime > 0 || player.tier < CONFIG.environment.mineTrackingTier) {
    return { vx: 0, vy: 0, tracking: false };
  }
  const dx = world.wrap === false
    ? player.x - mine.x
    : wrapDelta(player.x, mine.x, world.width);
  const dy = world.wrap === false
    ? player.y - mine.y
    : wrapDelta(player.y, mine.y, world.height);
  const direction = normalize(dx, dy);
  if (direction.length > CONFIG.environment.mineTrackingSense) {
    return { vx: 0, vy: 0, tracking: false };
  }
  return {
    vx: direction.x * CONFIG.environment.mineTrackingSpeed,
    vy: direction.y * CONFIG.environment.mineTrackingSpeed,
    tracking: true,
  };
}
