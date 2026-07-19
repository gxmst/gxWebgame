export const TAU = Math.PI * 2;

/** Restricts a number to an inclusive interval. */
export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Linear interpolation. Values outside 0..1 intentionally extrapolate. */
export function lerp(from, to, amount) {
  return from + (to - from) * amount;
}

/** Frame-rate independent exponential smoothing. */
export function damp(current, target, responsiveness, dt) {
  if (dt <= 0 || current === target) return current;
  if (responsiveness <= 0) return current;
  return lerp(current, target, 1 - Math.exp(-responsiveness * dt));
}

/**
 * Wraps a scalar into [0, size). Safe for negative values.
 */
export function wrap(value, size) {
  if (!(size > 0) || !Number.isFinite(value)) return 0;
  const result = value % size;
  return result < 0 ? result + size : result;
}

/**
 * Shortest signed delta from `from` to `to` on a loop of `size`.
 * Result is in (-size/2, size/2].
 */
export function wrapDelta(to, from, size) {
  if (!(size > 0)) return to - from;
  let delta = to - from;
  delta -= size * Math.round(delta / size);
  return delta;
}

/** Shortest offset (dx, dy) from point A to point B on a toroidal map. */
export function wrapOffset(ax, ay, bx, by, width, height) {
  return {
    x: wrapDelta(bx, ax, width),
    y: wrapDelta(by, ay, height),
  };
}

/**
 * Squared distance between two points. Accepts either four coordinates or two
 * objects with x/y properties. Optional width/height enable toroidal distance.
 */
export function distanceSq(aOrX, bOrY, cOrX, dOrY, width, height) {
  const [ax, ay, bx, by] = readTwoPoints(aOrX, bOrY, cOrX, dOrY);
  let dx = bx - ax;
  let dy = by - ay;
  if (width > 0) dx = wrapDelta(bx, ax, width);
  if (height > 0) dy = wrapDelta(by, ay, height);
  return dx * dx + dy * dy;
}

/** Returns a normalized vector plus its original length. */
export function normalize(x, y, fallbackX = 0, fallbackY = 0) {
  const length = Math.hypot(x, y);
  if (length <= Number.EPSILON) {
    return { x: fallbackX, y: fallbackY, length: 0 };
  }
  return { x: x / length, y: y / length, length };
}

/** Converts an angle to the interval [-PI, PI). */
export function normalizeAngle(angle) {
  let normalized = ((angle + Math.PI) % TAU + TAU) % TAU - Math.PI;
  if (normalized === Math.PI) normalized = -Math.PI;
  return normalized;
}

/** Smallest signed rotation from one angle to another. */
export function shortestAngleDelta(from, to) {
  return normalizeAngle(to - from);
}

/** Interpolates angles through the shortest arc. */
export function lerpAngle(from, to, amount) {
  return normalizeAngle(from + shortestAngleDelta(from, to) * amount);
}

/** Rotates toward a target by at most maxDelta radians. */
export function moveAngleTowards(current, target, maxDelta) {
  const delta = shortestAngleDelta(current, target);
  if (Math.abs(delta) <= maxDelta) return normalizeAngle(target);
  return normalizeAngle(current + Math.sign(delta) * maxDelta);
}

export function angleFromVector(x, y) {
  return Math.atan2(y, x);
}

/** Inclusive circle intersection test, accepting circles or six coordinates. */
export function circlesIntersect(aOrX, bOrY, cOrRadius, dOrX, eOrY, fOrRadius) {
  let ax;
  let ay;
  let ar;
  let bx;
  let by;
  let br;

  if (typeof aOrX === "object" && typeof bOrY === "object") {
    ax = aOrX.x;
    ay = aOrX.y;
    ar = aOrX.radius ?? aOrX.r ?? 0;
    bx = bOrY.x;
    by = bOrY.y;
    br = bOrY.radius ?? bOrY.r ?? 0;
  } else {
    ax = aOrX;
    ay = bOrY;
    ar = cOrRadius;
    bx = dOrX;
    by = eOrY;
    br = fOrRadius;
  }

  const combinedRadius = Math.max(0, ar) + Math.max(0, br);
  return distanceSq(ax, ay, bx, by) <= combinedRadius * combinedRadius;
}

/** Stable 32-bit hash for numeric or string seeds. */
export function hashSeed(seed) {
  if (typeof seed === "number" && Number.isFinite(seed)) {
    return seed >>> 0;
  }

  const text = String(seed ?? "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Creates a deterministic PRNG. The returned callable produces values in
 * [0, 1) and also exposes range(), int(), pick(), and getState().
 */
export function createSeededRng(seed = 0) {
  let state = hashSeed(seed) || 0x6d2b79f5;

  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };

  random.range = (min, max) => lerp(min, max, random());
  random.int = (min, maxInclusive) =>
    Math.floor(random.range(min, maxInclusive + 1));
  random.pick = (items) =>
    items.length > 0 ? items[Math.floor(random() * items.length)] : undefined;
  random.getState = () => state;

  return random;
}

function readTwoPoints(aOrX, bOrY, cOrX, dOrY) {
  if (typeof aOrX === "object" && typeof bOrY === "object") {
    return [aOrX.x, aOrX.y, bOrY.x, bOrY.y];
  }
  return [aOrX, bOrY, cOrX, dOrY];
}
