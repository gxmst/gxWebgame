import { CONFIG } from "./config.js";
import { createDefaultUpgradeState, getCoinsForResult, normalizeUpgradeState } from "./upgrades.js";

export function createDefaultSave() {
  return {
    version: CONFIG.save.version,
    stats: {
      highScore: 0,
      bestClearTimeMs: null,
      longestSurvivalMs: 0,
      longestSovereignMs: 0,
      gamesPlayed: 0,
      victories: 0,
    },
    wallet: { pearls: 0 },
    upgrades: createDefaultUpgradeState(),
    unlocks: { skins: ["reef"], accessories: ["none"] },
    selectedSkin: "reef",
    selectedAccessory: "none",
    leaderboard: [],
    milestones: {},
    settings: {
      volume: 0.7,
      muted: false,
      music: CONFIG.music.enabledByDefault,
      vibration: true,
      screenShake: true,
      touchMode: "relative",
      quality: "auto",
      highContrast: false,
    },
  };
}

/** Loads, migrates, and sanitizes save data. Never throws. */
export function loadSave(storage = getDefaultStorage(), key = CONFIG.save.key) {
  try {
    const serialized = storage?.getItem?.(key);
    if (!serialized) return createDefaultSave();
    const parsed = JSON.parse(serialized);
    return sanitizeSave(migrateSave(parsed));
  } catch {
    return createDefaultSave();
  }
}

/** Persists sanitized data. Returns false when storage is unavailable. */
export function saveSave(save, storage = getDefaultStorage(), key = CONFIG.save.key) {
  try {
    if (!storage?.setItem) return false;
    storage.setItem(key, JSON.stringify(sanitizeSave(migrateSave(save))));
    return true;
  } catch {
    return false;
  }
}

/** Clears records, currency, unlocks, and milestones while preserving preferences. */
export function clearProgress(save) {
  const current = sanitizeSave(migrateSave(save));
  const next = createDefaultSave();
  next.settings = { ...current.settings };
  return next;
}

/**
 * Applies one completed run without mutating the input save. Supported result
 * fields: score, survivalMs/survivedMs, victory/won, clearTimeMs,
 * sovereignDurationMs, reachedTier, collectedPearls, and date.
 */
export function updateResults(save, result = {}) {
  const next = sanitizeSave(migrateSave(save));
  const score = nonNegativeInteger(result.score);
  const survivalMs = nonNegativeInteger(
    result.survivalMs ?? result.survivedMs ?? result.durationMs,
  );
  const victory = result.victory === true || result.won === true;
  const clearTimeMs = nonNegativeIntegerOrNull(result.clearTimeMs);
  const sovereignDurationMs = nonNegativeInteger(result.sovereignDurationMs);
  const reachedTier = normalizeTierId(result.reachedTier ?? result.tier) || CONFIG.tiers[0].id;

  next.stats.gamesPlayed += 1;
  next.stats.highScore = Math.max(next.stats.highScore, score);
  next.stats.longestSurvivalMs = Math.max(
    next.stats.longestSurvivalMs,
    survivalMs,
  );
  next.stats.longestSovereignMs = Math.max(
    next.stats.longestSovereignMs,
    sovereignDurationMs,
  );

  if (victory) {
    next.stats.victories += 1;
    if (clearTimeMs !== null) {
      next.stats.bestClearTimeMs = next.stats.bestClearTimeMs === null
        ? clearTimeMs
        : Math.min(next.stats.bestClearTimeMs, clearTimeMs);
    }
  }

  let earnedPearls = Math.floor(score / CONFIG.progression.scorePerPearl)
    + nonNegativeInteger(result.collectedPearls);
  if (victory) earnedPearls += CONFIG.progression.victoryPearls;

  if (reachedTier) {
    const maxIndex = CONFIG.tiers.findIndex((tier) => tier.id === reachedTier);
    for (let index = 1; index <= maxIndex; index += 1) {
      const tierId = CONFIG.tiers[index].id;
      const milestoneKey = `firstReached.${tierId}`;
      if (!next.milestones[milestoneKey]) {
        next.milestones[milestoneKey] = true;
        earnedPearls += CONFIG.progression.firstTierPearls[tierId] ?? 0;
      }
    }
  }

  if (score >= CONFIG.leaderboard.minScore
    || survivalMs >= CONFIG.leaderboard.minDurationMs) {
    next.leaderboard = sanitizeLeaderboard([
      ...next.leaderboard,
      {
        score,
        tier: reachedTier,
        durationMs: survivalMs,
        date: normalizeDate(result.date) || new Date().toISOString(),
      },
    ]);
  }

  next.wallet.pearls += earnedPearls;
  next.upgrades.coins += getCoinsForResult({ score, victory });
  return next;
}

function migrateSave(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return createDefaultSave();
  }

  if (candidate.version === CONFIG.save.version) return candidate;

  // Pre-versioned prototype saves kept record fields at the root.
  if (candidate.version === 0 || candidate.version == null) {
    return {
      version: CONFIG.save.version,
      stats: candidate.stats ?? {
        highScore: candidate.highScore,
        bestClearTimeMs: candidate.bestClearTimeMs ?? candidate.bestTimeMs,
        longestSurvivalMs: candidate.longestSurvivalMs,
        gamesPlayed: candidate.gamesPlayed,
        victories: candidate.victories,
      },
      wallet: candidate.wallet ?? { pearls: candidate.pearls },
      upgrades: candidate.upgrades,
      unlocks: candidate.unlocks ?? {
        skins: candidate.skins,
        accessories: candidate.accessories,
      },
      selectedSkin: candidate.selectedSkin,
      selectedAccessory: candidate.selectedAccessory,
      leaderboard: candidate.leaderboard,
      milestones: candidate.milestones,
      settings: candidate.settings,
    };
  }

  // A save from a newer build is treated as partial compatible data. Unknown
  // fields are dropped, while recognized fields remain usable.
  return { ...candidate, version: CONFIG.save.version };
}

function sanitizeSave(candidate) {
  const defaults = createDefaultSave();
  const source = candidate && typeof candidate === "object" ? candidate : {};
  const stats = source.stats && typeof source.stats === "object" ? source.stats : {};
  const settings = source.settings && typeof source.settings === "object"
    ? source.settings
    : {};
  const rawSkins = Array.isArray(source.unlocks?.skins)
    ? source.unlocks.skins.filter((skin) => typeof skin === "string" && skin.length > 0)
    : [];
  const skins = [...new Set(["reef", ...rawSkins])];
  const selectedSkin = skins.includes(source.selectedSkin)
    ? source.selectedSkin
    : defaults.selectedSkin;
  const rawAccessories = Array.isArray(source.unlocks?.accessories)
    ? source.unlocks.accessories.filter((item) => typeof item === "string" && item.length > 0)
    : [];
  const accessories = [...new Set(["none", ...rawAccessories])];
  const selectedAccessory = accessories.includes(source.selectedAccessory)
    ? source.selectedAccessory
    : defaults.selectedAccessory;

  return {
    version: CONFIG.save.version,
    stats: {
      highScore: nonNegativeInteger(stats.highScore),
      bestClearTimeMs: nonNegativeIntegerOrNull(stats.bestClearTimeMs),
      longestSurvivalMs: nonNegativeInteger(stats.longestSurvivalMs),
      longestSovereignMs: nonNegativeInteger(stats.longestSovereignMs),
      gamesPlayed: nonNegativeInteger(stats.gamesPlayed),
      victories: nonNegativeInteger(stats.victories),
    },
    wallet: {
      pearls: nonNegativeInteger(source.wallet?.pearls),
    },
    upgrades: normalizeUpgradeState(source.upgrades),
    unlocks: { skins, accessories },
    selectedSkin,
    selectedAccessory,
    leaderboard: sanitizeLeaderboard(source.leaderboard),
    milestones: sanitizeMilestones(source.milestones),
    settings: {
      volume: clampNumber(settings.volume, 0, 1, defaults.settings.volume),
      muted: booleanOr(settings.muted, defaults.settings.muted),
      music: booleanOr(settings.music, defaults.settings.music),
      vibration: booleanOr(settings.vibration, defaults.settings.vibration),
      screenShake: booleanOr(settings.screenShake, defaults.settings.screenShake),
      touchMode: ["relative", "point"].includes(settings.touchMode)
        ? settings.touchMode
        : defaults.settings.touchMode,
      quality: ["auto", "high", "medium", "low"].includes(settings.quality)
        ? settings.quality
        : defaults.settings.quality,
      highContrast: booleanOr(settings.highContrast, defaults.settings.highContrast),
    },
  };
}

function sanitizeLeaderboard(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const score = nonNegativeInteger(entry.score);
      const durationMs = nonNegativeInteger(entry.durationMs);
      const date = normalizeDate(entry.date);
      if (!date || (score < CONFIG.leaderboard.minScore
        && durationMs < CONFIG.leaderboard.minDurationMs)) return null;
      return {
        score,
        tier: normalizeTierId(entry.tier) || CONFIG.tiers[0].id,
        durationMs,
        date,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score
      || tierIndex(b.tier) - tierIndex(a.tier)
      || b.durationMs - a.durationMs
      || Date.parse(b.date) - Date.parse(a.date))
    .slice(0, CONFIG.leaderboard.limit);
}

function normalizeDate(value) {
  const timestamp = typeof value === "string"
    ? Date.parse(value)
    : Number.isFinite(value) ? value : NaN;
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function tierIndex(tierId) {
  return CONFIG.tiers.findIndex((tier) => tier.id === tierId);
}

function sanitizeMilestones(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, completed]) => key.length <= 80 && completed === true),
  );
}

function normalizeTierId(value) {
  if (value && typeof value === "object") value = value.id ?? value.index;
  if (typeof value === "number") return CONFIG.tiers[value - 1]?.id ?? null;
  if (typeof value !== "string") return null;
  return CONFIG.tiers.some((tier) => tier.id === value) ? value : null;
}

function getDefaultStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function nonNegativeInteger(value) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function nonNegativeIntegerOrNull(value) {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

function clampNumber(value, min, max, fallback) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function booleanOr(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}
