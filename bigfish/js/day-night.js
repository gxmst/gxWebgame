import { CONFIG } from "./config.js";
import { clamp, lerp, wrap } from "./math.js";

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / Math.max(1e-6, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function wrappedPeak(phase, center, radius) {
  const distance = Math.abs(((phase - center + 0.5) % 1 + 1) % 1 - 0.5);
  const t = clamp(1 - distance / radius, 0, 1);
  return t * t * (3 - 2 * t);
}

export function getDayNightState(elapsedSeconds, tuning = CONFIG.dayNight) {
  const period = Math.max(1, tuning.periodSeconds);
  const phase = wrap(elapsedSeconds / period + tuning.startPhase, 1);
  const daylight = 0.5 + Math.cos((phase - 0.25) * Math.PI * 2) * 0.5;
  const nightStrength = smoothstep(0.48, 0.9, 1 - daylight);
  const dawnStrength = wrappedPeak(phase, 0, 0.17);
  const duskStrength = wrappedPeak(phase, 0.5, 0.17);
  const warmStrength = Math.max(dawnStrength, duskStrength) * (1 - nightStrength * 0.55);

  let segment = phase < 0.17 || phase >= 0.92 ? "dawn" : phase < 0.43 ? "day" : phase < 0.62 ? "dusk" : "night";
  if (nightStrength >= tuning.nightStartThreshold) segment = "night";
  else if (daylight >= tuning.dayStartThreshold && phase >= 0.12 && phase < 0.43) segment = "day";

  return {
    phase,
    segment,
    daylight,
    nightStrength,
    dawnStrength,
    duskStrength,
    warmStrength,
    scoreMultiplier: lerp(1, tuning.nightScoreMultiplier, nightStrength),
    hintDistanceScale: lerp(1, tuning.nightHintDistanceScale, nightStrength),
    beamScale: lerp(1, tuning.nightBeamScale, nightStrength),
  };
}
