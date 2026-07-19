/** Stable 32-bit FNV-1a hash for numeric or string seeds. */
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
 * Creates a deterministic PRNG. The callable returns values in [0, 1) and
 * exposes small helpers without relying on browser or clock state.
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

  random.range = (min, max) => min + (max - min) * random();
  random.int = (min, maxInclusive) =>
    Math.floor(random.range(min, maxInclusive + 1));
  random.pick = (items) =>
    Array.isArray(items) && items.length > 0
      ? items[Math.floor(random() * items.length)]
      : undefined;
  random.getState = () => state;

  return random;
}
