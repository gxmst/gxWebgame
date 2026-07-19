import { CONFIG } from "./config.js";

export const COSMETIC_KINDS = Object.freeze({
  SKINS: "skins",
  ACCESSORIES: "accessories",
});

export function getCosmeticCatalog(kind) {
  assertKind(kind);
  return CONFIG.cosmetics[kind];
}

/** Purchases when needed and equips in one immutable operation. */
export function purchaseOrEquipCosmetic(save, kind, id) {
  assertKind(kind);
  const definition = CONFIG.cosmetics[kind][id];
  if (!definition) {
    return { success: false, reason: "unknown-item", save, spent: 0, purchased: false };
  }

  const selectedField = kind === COSMETIC_KINDS.SKINS ? "selectedSkin" : "selectedAccessory";
  const currentUnlocks = Array.isArray(save?.unlocks?.[kind]) ? save.unlocks[kind] : [];
  const owned = currentUnlocks.includes(id);
  const pearls = nonNegativeInteger(save?.wallet?.pearls);
  if (!owned && pearls < definition.cost) {
    return { success: false, reason: "insufficient-pearls", save, spent: 0, purchased: false };
  }

  const unlocked = owned ? [...currentUnlocks] : [...currentUnlocks, id];
  const next = {
    ...save,
    wallet: { ...save?.wallet, pearls: pearls - (owned ? 0 : definition.cost) },
    unlocks: { ...save?.unlocks, [kind]: [...new Set(unlocked)] },
    [selectedField]: id,
  };
  return {
    success: true,
    reason: null,
    save: next,
    spent: owned ? 0 : definition.cost,
    purchased: !owned,
  };
}

function assertKind(kind) {
  if (!Object.hasOwn(CONFIG.cosmetics, kind)) {
    throw new RangeError(`Unknown cosmetic kind: ${String(kind)}`);
  }
}

function nonNegativeInteger(value) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}
