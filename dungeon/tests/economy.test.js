import { CONFIG, EQUIPMENT_SLOT_IDS } from "../js/config.js";
import {
  beginReforge,
  createDefaultEconomy,
  ensureShop,
  getReforgeCost,
  getSellValue,
  getShopPrice,
  purchaseShopItem,
  refreshShop,
  resolveReforge,
  sanitizeEconomy,
} from "../js/economy.js";
import { sanitizeItem } from "../js/hero.js";
import {
  calculateItemPower,
  generateLoot,
  rerollItemAffixes,
} from "../js/loot.js";
import { createDefaultSave } from "../js/save.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

export const tests = [
  {
    name: "reforge rolls are deterministic and preserve every non-affix item field",
    run() {
      const item = createLegendaryItem("reforge-pure-item");
      const before = JSON.stringify(item);
      const first = rerollItemAffixes(item, "reforge-seed-11", { classId: "warrior" });
      const second = rerollItemAffixes(item, "reforge-seed-11", { classId: "warrior" });

      assert(JSON.stringify(first) === JSON.stringify(second), "same seed must reproduce the same reforge");
      assert(JSON.stringify(item) === before, "reforging must not mutate the input item");
      for (const key of ["id", "emoji", "slot", "rarity", "level", "seed"]) {
        assert(first[key] === item[key], `reforge must preserve ${key}`);
      }
      assert(typeof first.name === "string" && first.name.length > 0);
      assert(JSON.stringify(first.baseStats) === JSON.stringify(item.baseStats), "base stats must be preserved");
      assert(JSON.stringify(first.effect) === JSON.stringify(item.effect), "legendary effects must be preserved");
      assert(first.power === calculateItemPower(first), "reforge power must be recalculated from the candidate");
      assert(first.affixes.length >= CONFIG.rarities[first.rarity].minAffixes);
      assert(first.affixes.length <= CONFIG.rarities[first.rarity].maxAffixes);
    },
  },
  {
    name: "class-scoped affixes never leak into another class reforge",
    run() {
      const scopedDefinitions = Object.values(CONFIG.affixes)
        .filter((definition) => Array.isArray(definition.classIds));
      if (scopedDefinitions.length === 0) return;
      const item = createLegendaryItem("class-affix-item");
      for (const classId of Object.keys(CONFIG.classes)) {
        for (let index = 0; index < 24; index += 1) {
          const candidate = rerollItemAffixes(item, `class-${classId}-${index}`, { classId });
          const drop = generateLoot(
            Math.min(CONFIG.dungeon.maxFloor, 8),
            `drop-class-${classId}-${index}`,
            { classId, equipment: {} },
          );
          for (const affix of [...candidate.affixes, ...drop.affixes]) {
            const definition = CONFIG.affixes[affix.id];
            assert(
              !Array.isArray(definition.classIds) || definition.classIds.includes(classId),
              `${affix.id} must be valid for ${classId}`,
            );
          }
        }
      }
    },
  },
  {
    name: "beginning a reforge charges once and keeping the old roll preserves the item",
    run() {
      const save = createSaveWithInventoryItem("keep-old-roll");
      const item = save.hero.inventory[0];
      const cost = getReforgeCost(item);
      save.hero.gold = cost * 4;
      const goldBefore = save.hero.gold;
      const source = JSON.stringify(save);
      const started = beginReforge(save, { location: "inventory", itemId: item.id }, "keep-seed");

      assert(started.ok, started.reason);
      assert(started.save.hero.gold === goldBefore - cost, "the roll should charge exactly once");
      assert(started.save.economy.pendingReforge?.candidate, "the candidate must be persisted");
      assert(JSON.stringify(save) === source, "source save must stay untouched");

      const restoredSave = {
        ...started.save,
        economy: sanitizeEconomy(
          JSON.parse(JSON.stringify(started.save.economy)),
          started.save,
        ),
      };
      assert(restoredSave.economy.pendingReforge?.candidate, "pending rolls must survive JSON sanitation");

      const blocked = beginReforge(restoredSave, item.id, "second-seed");
      assert(!blocked.ok && blocked.reason === "reforge-pending");
      assert(blocked.save === restoredSave, "a blocked second roll must be an atomic no-op");

      const kept = resolveReforge(restoredSave, "keep");
      assert(kept.ok && kept.choice === "keep");
      assert(JSON.stringify(kept.save.hero.inventory[0]) === JSON.stringify(item), "old affixes must remain");
      assert(kept.save.hero.gold === goldBefore - cost, "keeping the old roll must not refund its cost");
      assert(kept.save.economy.pendingReforge === null);

      const repeated = resolveReforge(kept.save, "replace");
      assert(!repeated.ok && repeated.reason === "no-pending-reforge");
      assert(repeated.save === kept.save, "a repeated decision must not alter state");
    },
  },
  {
    name: "accepting a reforge replaces inventory and equipped items without another charge",
    run() {
      for (const location of ["inventory", "equipment"]) {
        const save = location === "inventory"
          ? createSaveWithInventoryItem(`replace-${location}`)
          : createSaveWithEquippedItem(`replace-${location}`);
        const item = location === "inventory"
          ? save.hero.inventory[0]
          : save.hero.equipment.weapon;
        const cost = getReforgeCost(item);
        save.hero.gold = cost * 3;
        const target = location === "inventory"
          ? { location, itemId: item.id }
          : { location, slot: "weapon", itemId: item.id };
        const started = beginReforge(save, target, `accept-${location}`);
        const goldAfterRoll = started.save.hero.gold;
        const accepted = resolveReforge(started.save, "replace");
        const replaced = location === "inventory"
          ? accepted.save.hero.inventory[0]
          : accepted.save.hero.equipment.weapon;

        assert(started.ok && accepted.ok, started.reason ?? accepted.reason);
        assert(JSON.stringify(replaced) === JSON.stringify(started.candidate));
        assert(accepted.save.hero.gold === goldAfterRoll, "accepting must not charge twice");
        assert(accepted.save.economy.pendingReforge === null);
      }
    },
  },
  {
    name: "reforge failures leave the exact source save untouched",
    run() {
      const save = createSaveWithInventoryItem("reforge-failure");
      save.hero.gold = 0;
      const before = JSON.stringify(save);
      const insufficient = beginReforge(save, save.hero.inventory[0].id, "poor-seed");
      const missing = beginReforge(save, "missing-item", "missing-seed");

      assert(!insufficient.ok && insufficient.reason === "insufficient-gold");
      assert(!missing.ok && missing.reason === "item-not-found");
      assert(insufficient.save === save && missing.save === save);
      assert(JSON.stringify(save) === before);
    },
  },
  {
    name: "shop rotations are deterministic, cover slots, and do not refresh when sold out",
    run() {
      const firstSave = createDefaultSave();
      firstSave.economy = createDefaultEconomy();
      firstSave.progress.highestUnlockedFloor = Math.min(CONFIG.dungeon.maxFloor, 3);
      const secondSave = JSON.parse(JSON.stringify(firstSave));
      const first = ensureShop(firstSave);
      const second = ensureShop(secondSave);

      assert(first.ok && first.refreshed);
      assert(JSON.stringify(first.save.economy.shop) === JSON.stringify(second.save.economy.shop));
      const stock = first.save.economy.shop.stock;
      const listingIds = stock.map((listing) => listing.listingId);
      const itemIds = stock.map((listing) => listing.item.id);
      assert(new Set(listingIds).size === listingIds.length, "listing ids must be unique");
      assert(new Set(itemIds).size === itemIds.length, "shop item ids must be unique");
      assert(
        new Set(stock.slice(0, EQUIPMENT_SLOT_IDS.length).map((listing) => listing.item.slot)).size
          === Math.min(EQUIPMENT_SLOT_IDS.length, stock.length),
        "the first shop page should cover distinct equipment slots",
      );

      let purchased = {
        ...first.save,
        hero: { ...first.save.hero, gold: Number.MAX_SAFE_INTEGER },
      };
      for (const listingId of listingIds) {
        const result = purchaseShopItem(purchased, listingId);
        assert(result.ok, result.reason);
        purchased = result.save;
      }
      assert(purchased.economy.shop.stock.length === 0, "all listings should remain sold out");
      const unchanged = ensureShop(purchased);
      assert(unchanged.ok && !unchanged.refreshed, "an empty initialized shop must not refresh early");
      assert(unchanged.save.economy.shop.stock.length === 0);
    },
  },
  {
    name: "shop purchases are atomic and refresh only after the configured victory interval",
    run() {
      const save = createDefaultSave();
      save.economy = createDefaultEconomy();
      const initialized = refreshShop(save);
      const listing = initialized.save.economy.shop.stock[0];
      const price = getShopPrice(listing.item);
      const sellValue = getSellValue(listing.item);
      const minimumSellMultiplier = Math.max(
        1,
        Number(CONFIG.economy?.shop?.minimumSellMultiplier) || 1,
      );
      assert(price >= Math.ceil(sellValue * minimumSellMultiplier), "buy price must respect the anti-arbitrage floor");

      const richSave = {
        ...initialized.save,
        hero: { ...initialized.save.hero, gold: price + 100 },
      };
      const before = JSON.stringify(richSave);
      const bought = purchaseShopItem(richSave, listing.listingId);
      assert(bought.ok, bought.reason);
      assert(bought.save.hero.gold === richSave.hero.gold - price);
      assert(bought.save.hero.inventory.some((item) => item.id === listing.item.id));
      assert(!bought.save.economy.shop.stock.some((entry) => entry.listingId === listing.listingId));
      assert(JSON.stringify(richSave) === before, "purchase must not mutate its source");

      const duplicate = purchaseShopItem(bought.save, listing.listingId);
      assert(!duplicate.ok && duplicate.reason === "listing-not-found");
      assert(duplicate.save === bought.save, "double purchase must be a no-op");

      const poorSave = {
        ...initialized.save,
        hero: { ...initialized.save.hero, gold: 0 },
      };
      const poor = purchaseShopItem(poorSave, listing.listingId);
      assert(!poor.ok && poor.reason === "insufficient-gold" && poor.save === poorSave);

      const interval = Math.max(
        1,
        Number(CONFIG.economy?.shop?.refreshEveryVictories) || 1,
      );
      const beforeDue = {
        ...initialized.save,
        progress: {
          ...initialized.save.progress,
          totalVictories: Math.max(0, interval - 1),
        },
      };
      const notDue = ensureShop(beforeDue);
      assert(!notDue.refreshed);
      const dueSave = {
        ...initialized.save,
        progress: { ...initialized.save.progress, totalVictories: interval },
      };
      const due = ensureShop(dueSave);
      assert(due.refreshed);
      assert(due.save.economy.shop.rotation === initialized.save.economy.shop.rotation + 1);
    },
  },
  {
    name: "full inventory and malformed economy state fail safely",
    run() {
      const save = createDefaultSave();
      save.economy = createDefaultEconomy();
      const initialized = refreshShop(save).save;
      const listing = initialized.economy.shop.stock[0];
      const limit = CONFIG.save.maxInventoryItems;
      const fullInventory = Array.from({ length: limit }, (_, index) => ({
        ...generateLoot(1, `economy-full-${index}`, initialized.hero),
        id: `economy-full-${index}`,
      }));
      const fullSave = {
        ...initialized,
        hero: {
          ...initialized.hero,
          gold: Number.MAX_SAFE_INTEGER,
          inventory: fullInventory,
        },
      };
      const before = JSON.stringify(fullSave);
      const purchase = purchaseShopItem(fullSave, listing.listingId);
      assert(!purchase.ok && purchase.reason === "inventory-full");
      assert(purchase.save === fullSave && JSON.stringify(fullSave) === before);

      const clean = sanitizeEconomy({
        reforgeCounter: -20,
        pendingReforge: { target: { itemId: "missing" }, candidate: null },
        shop: {
          initialized: true,
          rotation: -4,
          lastRefreshVictory: 999,
          stock: [{ listingId: "broken", item: { slot: "nope" } }],
        },
      }, fullSave);
      assert(clean.reforgeCounter === 0);
      assert(clean.pendingReforge === null);
      assert(clean.shop.rotation === 0);
      assert(clean.shop.stock.length === 0);
      assert(clean.shop.lastRefreshVictory <= fullSave.progress.totalVictories);
    },
  },
];

function createSaveWithInventoryItem(seed) {
  const save = createDefaultSave();
  const item = createLegendaryItem(seed);
  save.hero.inventory = [item];
  save.hero.equipment[item.slot] = null;
  save.economy = createDefaultEconomy();
  return save;
}

function createSaveWithEquippedItem(seed) {
  const save = createDefaultSave();
  const item = createLegendaryItem(seed, "weapon");
  save.hero.inventory = [];
  save.hero.equipment.weapon = item;
  save.economy = createDefaultEconomy();
  return save;
}

function createLegendaryItem(seed, forcedSlot = "weapon") {
  const generated = generateLoot(
    Math.min(CONFIG.dungeon.maxFloor, 3),
    seed,
    null,
    { forcedSlot },
  );
  const affixDefinitions = Object.values(CONFIG.affixes)
    .filter((definition) => !definition.slots || definition.slots.includes(forcedSlot))
    .slice(0, CONFIG.rarities.legendary.maxAffixes);
  const effect = Object.values(CONFIG.legendaryEffects)[0] ?? null;
  const item = sanitizeItem({
    ...generated,
    id: `economy-${seed}`,
    rarity: "legendary",
    affixes: affixDefinitions.map((definition) => ({
      id: definition.id,
      stat: definition.stat,
      value: Math.max(0.01, definition.min ?? 1),
    })),
    effect: effect ? { id: effect.id, value: effect.value } : null,
  });
  return sanitizeItem({ ...item, power: calculateItemPower(item) });
}
