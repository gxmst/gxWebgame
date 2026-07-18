import { CONFIG } from "../js/config.js";
import {
  COSMETIC_KINDS,
  getCosmeticCatalog,
  purchaseOrEquipCosmetic,
} from "../js/cosmetics.js";
import { createDefaultSave } from "../js/save.js";
import { getFishCacheKey } from "../js/sprites.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

export const tests = [
  {
    name: "cosmetics purchase and equip independently without mutating the save",
    run() {
      const original = createDefaultSave();
      original.wallet.pearls = 100;
      const skinResult = purchaseOrEquipCosmetic(original, COSMETIC_KINDS.SKINS, "glacier");
      assert(skinResult.success && skinResult.purchased);
      assert(skinResult.save.selectedSkin === "glacier");
      assert(skinResult.save.selectedAccessory === "none");
      assert(original.selectedSkin === "reef" && original.wallet.pearls === 100);

      const accessoryResult = purchaseOrEquipCosmetic(
        skinResult.save,
        COSMETIC_KINDS.ACCESSORIES,
        "sailor",
      );
      assert(accessoryResult.success && accessoryResult.save.selectedSkin === "glacier");
      assert(accessoryResult.save.selectedAccessory === "sailor");
      assert(accessoryResult.save.wallet.pearls === 100
        - getCosmeticCatalog(COSMETIC_KINDS.SKINS).glacier.cost
        - CONFIG.cosmetics.accessories.sailor.cost);
    },
  },
  {
    name: "locked cosmetics reject insufficient pearls without changing equipment",
    run() {
      const original = createDefaultSave();
      const result = purchaseOrEquipCosmetic(original, COSMETIC_KINDS.ACCESSORIES, "crown");
      assert(!result.success && result.reason === "insufficient-pearls");
      assert(result.save === original && original.selectedAccessory === "none");
    },
  },
  {
    name: "player sprite cache keys preserve skin, accessory, frame, and tier",
    run() {
      const base = getFishCacheKey({ isPlayer: true, skin: "coral", accessory: "sailor", frame: 2, tier: 3 });
      assert(base !== getFishCacheKey({ isPlayer: true, skin: "reef", accessory: "sailor", frame: 2, tier: 3 }));
      assert(base !== getFishCacheKey({ isPlayer: true, skin: "coral", accessory: "crown", frame: 2, tier: 3 }));
      assert(base !== getFishCacheKey({ isPlayer: true, skin: "coral", accessory: "sailor", frame: 3, tier: 3 }));
      assert(base !== getFishCacheKey({ isPlayer: true, skin: "coral", accessory: "sailor", frame: 2, tier: 4 }));
    },
  },
];
