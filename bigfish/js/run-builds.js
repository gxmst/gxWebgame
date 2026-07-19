import { CONFIG } from "./config.js";
import { createSeededRng, hashSeed } from "./math.js";

export const RUN_BUILD_STATE_VERSION = 1;

export const RUN_BUILD_CATALOG = Object.freeze([
  Object.freeze({ id: "swift-current", effectKey: "speedMultiplier" }),
  Object.freeze({ id: "deep-lungs", effectKey: "staminaBonus" }),
  Object.freeze({ id: "second-wind", effectKey: "staminaRecoveryMultiplier" }),
  Object.freeze({ id: "wide-jaw", effectKey: "mouthMultiplier" }),
  Object.freeze({ id: "golden-instinct", effectKey: "scoreMultiplier" }),
  Object.freeze({ id: "dense-nutrition", effectKey: "massGainMultiplier" }),
  Object.freeze({ id: "torpedo-dash", effectKey: "dashSpeedMultiplier" }),
  Object.freeze({ id: "efficient-dash", effectKey: "dashDrainMultiplier" }),
  Object.freeze({ id: "feeding-frenzy", effectKey: "comboWindowBonusSeconds" }),
]);

export const BASE_RUN_BUILD_EFFECTS = Object.freeze({
  speedMultiplier: 1,
  staminaBonus: 0,
  staminaRecoveryMultiplier: 1,
  mouthMultiplier: 1,
  scoreMultiplier: 1,
  massGainMultiplier: 1,
  dashSpeedMultiplier: 1,
  dashDrainMultiplier: 1,
  comboWindowBonusSeconds: 0,
});

const MULTIPLIER_EFFECTS = new Set([
  "speedMultiplier",
  "staminaRecoveryMultiplier",
  "mouthMultiplier",
  "scoreMultiplier",
  "massGainMultiplier",
  "dashSpeedMultiplier",
  "dashDrainMultiplier",
]);

export function createRunBuildState(seed = 0) {
  return {
    version: RUN_BUILD_STATE_VERSION,
    seed: hashSeed(seed),
    offers: {},
    selected: {},
  };
}

export function normalizeRunBuildState(state, settings = CONFIG.runBuilds) {
  const source = isRecord(state) ? state : {};
  const normalized = createRunBuildState(source.seed ?? 0);
  const milestones = getMilestones(settings);
  const validIds = new Set(getConfiguredAbilityIds(settings));

  for (const tierId of milestones) {
    const rawOffer = Array.isArray(source.offers?.[tierId])
      ? source.offers[tierId]
      : [];
    const offer = unique(rawOffer.filter((id) => validIds.has(id)))
      .slice(0, getChoiceCount(settings));
    if (offer.length === getChoiceCount(settings)) normalized.offers[tierId] = offer;

    const selectedId = source.selected?.[tierId];
    if (normalized.offers[tierId]?.includes(selectedId)) normalized.selected[tierId] = selectedId;
  }

  return normalized;
}

/**
 * Creates (or restores) the deterministic offer for one milestone. The input
 * state is never mutated, making the returned state safe to persist directly.
 */
export function ensureRunBuildOffer(state, tier, settings = CONFIG.runBuilds) {
  const current = normalizeRunBuildState(state, settings);
  const tierId = normalizeMilestone(tier, settings);
  if (!tierId) {
    return offerResult(false, "not-a-milestone", current, null, settings, false);
  }

  if (current.offers[tierId]?.length > 0) {
    return offerResult(true, null, current, tierId, settings, false);
  }

  const schedule = createOfferSchedule(current.seed, settings);
  const ids = schedule[tierId] ?? [];
  if (ids.length < getChoiceCount(settings)) {
    return offerResult(false, "insufficient-abilities", current, tierId, settings, false);
  }

  const next = {
    ...current,
    offers: { ...current.offers, [tierId]: ids },
  };
  return offerResult(true, null, next, tierId, settings, true);
}

export function selectRunBuild(state, tier, abilityId, settings = CONFIG.runBuilds) {
  const offered = ensureRunBuildOffer(state, tier, settings);
  if (!offered.success) {
    return selectionResult(false, offered.reason, offered.state, null, settings);
  }

  const tierId = offered.tier;
  if (offered.state.selected[tierId]) {
    return selectionResult(false, "already-selected", offered.state, tierId, settings);
  }
  if (!offered.state.offers[tierId].includes(abilityId)) {
    return selectionResult(false, "not-offered", offered.state, tierId, settings);
  }

  const next = {
    ...offered.state,
    selected: { ...offered.state.selected, [tierId]: abilityId },
  };
  return selectionResult(true, null, next, tierId, settings);
}

export function getRunBuildEffects(state, settings = CONFIG.runBuilds) {
  const current = normalizeRunBuildState(state, settings);
  return combineRunBuildEffects(Object.values(current.selected), settings);
}

export function combineRunBuildEffects(abilityIds, settings = CONFIG.runBuilds) {
  const effects = { ...BASE_RUN_BUILD_EFFECTS };
  for (const id of unique(Array.isArray(abilityIds) ? abilityIds : [])) {
    const abilityEffects = readAbilityEffects(settings?.abilities?.[id]);
    for (const [key, value] of Object.entries(abilityEffects)) {
      if (!Object.hasOwn(effects, key) || !Number.isFinite(value)) continue;
      if (MULTIPLIER_EFFECTS.has(key)) effects[key] *= value;
      else effects[key] += value;
    }
  }
  return effects;
}

export function getRunBuildChoice(id, settings = CONFIG.runBuilds) {
  const catalogEntry = RUN_BUILD_CATALOG.find((entry) => entry.id === id);
  const configured = settings?.abilities?.[id];
  if (!catalogEntry || !isRecord(configured)) return null;
  return {
    id,
    effectKey: catalogEntry.effectKey,
    name: typeof configured.name === "string" ? configured.name : id,
    description: typeof configured.description === "string" ? configured.description : "",
    effects: readAbilityEffects(configured),
  };
}

export function serializeRunBuildState(state, settings = CONFIG.runBuilds) {
  return JSON.stringify(normalizeRunBuildState(state, settings));
}

export function deserializeRunBuildState(serialized, settings = CONFIG.runBuilds) {
  try {
    return normalizeRunBuildState(JSON.parse(serialized), settings);
  } catch {
    return createRunBuildState(0);
  }
}

function createOfferSchedule(seed, settings) {
  const milestones = getMilestones(settings);
  const choiceCount = getChoiceCount(settings);
  const ids = getConfiguredAbilityIds(settings);
  const required = milestones.length * choiceCount;
  const ordered = [];

  for (let cycle = 0; ordered.length < required && ids.length > 0; cycle += 1) {
    const shuffled = shuffle(ids, createSeededRng(`${seed}:run-builds:${cycle}`));
    ordered.push(...shuffled);
  }

  return Object.fromEntries(milestones.map((tierId, index) => [
    tierId,
    ordered.slice(index * choiceCount, (index + 1) * choiceCount),
  ]));
}

function shuffle(items, random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function offerResult(success, reason, state, tier, settings, created) {
  const ids = tier ? state.offers[tier] ?? [] : [];
  return {
    success,
    reason,
    created,
    tier,
    state,
    choices: ids.map((id) => getRunBuildChoice(id, settings)).filter(Boolean),
  };
}

function selectionResult(success, reason, state, tier, settings) {
  return {
    success,
    reason,
    tier,
    state,
    selected: tier ? getRunBuildChoice(state.selected[tier], settings) : null,
    effects: getRunBuildEffects(state, settings),
  };
}

function readAbilityEffects(ability) {
  const source = isRecord(ability?.effects) ? ability.effects : ability;
  if (!isRecord(source)) return {};
  return Object.fromEntries(
    Object.keys(BASE_RUN_BUILD_EFFECTS)
      .filter((key) => Number.isFinite(source[key]))
      .map((key) => [key, source[key]]),
  );
}

function getConfiguredAbilityIds(settings) {
  return RUN_BUILD_CATALOG
    .map((entry) => entry.id)
    .filter((id) => isRecord(settings?.abilities?.[id]));
}

function getMilestones(settings) {
  const source = Array.isArray(settings?.milestoneTiers)
    ? settings.milestoneTiers
    : ["T2", "T4", "T6"];
  return unique(source.map(normalizeTierId).filter(Boolean));
}

function getChoiceCount(settings) {
  const value = Number.isFinite(settings?.choicesPerMilestone)
    ? Math.floor(settings.choicesPerMilestone)
    : 3;
  return Math.max(1, value);
}

function normalizeMilestone(tier, settings) {
  const id = normalizeTierId(tier);
  return getMilestones(settings).includes(id) ? id : null;
}

function normalizeTierId(tier) {
  if (Number.isFinite(tier)) return `T${Math.max(1, Math.floor(tier))}`;
  if (typeof tier !== "string") return null;
  const match = /^T?(\d+)$/i.exec(tier.trim());
  return match ? `T${Math.max(1, Number(match[1]))}` : null;
}

function unique(items) {
  return [...new Set(items)];
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
