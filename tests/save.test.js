import {
  clearProgress,
  createDefaultSave,
  loadSave,
  saveSave,
  updateResults,
} from "../js/save.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

function createMemoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
  };
}

export const tests = [
  {
    name: "default saves are independent and complete",
    run() {
      const first = createDefaultSave();
      const second = createDefaultSave();
      first.unlocks.skins.push("golden");
      assert(!second.unlocks.skins.includes("golden"));
      assert(first.version === 1 && first.selectedSkin === "reef");
      assert(first.upgrades.coins === 0 && first.upgrades.levels.speed === 0);
    },
  },
  {
    name: "missing, broken, and unavailable storage fall back safely",
    run() {
      assert(loadSave(createMemoryStorage()).stats.highScore === 0);
      assert(loadSave(createMemoryStorage({ "bigfish.save.v1": "{broken" })).stats.highScore === 0);
      const throwing = { getItem() { throw new Error("blocked"); } };
      assert(loadSave(throwing).wallet.pearls === 0);
    },
  },
  {
    name: "legacy saves migrate and invalid fields are sanitized",
    run() {
      const legacy = JSON.stringify({
        version: 0,
        highScore: 900,
        pearls: 12,
        skins: ["golden"],
        selectedSkin: "golden",
        settings: { volume: 5, touchMode: "unknown" },
      });
      const save = loadSave(createMemoryStorage({ "bigfish.save.v1": legacy }));
      assert(save.version === 1);
      assert(save.stats.highScore === 900);
      assert(save.wallet.pearls === 12);
      assert(save.selectedSkin === "golden");
      assert(save.settings.volume === 1);
      assert(save.settings.touchMode === "relative");
      assert(save.upgrades.coins === 0 && save.upgrades.levels.mouth === 0);
    },
  },
  {
    name: "saveSave persists sanitized data and reports failure",
    run() {
      const storage = createMemoryStorage();
      const save = createDefaultSave();
      save.wallet.pearls = 7;
      save.upgrades.coins = 42;
      save.upgrades.levels.mouth = 2;
      assert(saveSave(save, storage));
      const restored = loadSave(storage);
      assert(restored.wallet.pearls === 7);
      assert(restored.upgrades.coins === 42 && restored.upgrades.levels.mouth === 2);
      assert(!saveSave(save, { setItem() { throw new Error("quota"); } }));
    },
  },
  {
    name: "clearing progress preserves settings but resets rewards and records",
    run() {
      const save = createDefaultSave();
      save.stats.highScore = 999;
      save.wallet.pearls = 24;
      save.upgrades.coins = 80;
      save.upgrades.levels.speed = 3;
      save.unlocks.skins.push("coral");
      save.selectedSkin = "coral";
      save.milestones["tutorial.completed"] = true;
      save.settings.volume = 0.25;
      save.settings.highContrast = true;
      const cleared = clearProgress(save);
      assert(cleared.stats.highScore === 0);
      assert(cleared.wallet.pearls === 0);
      assert(cleared.upgrades.coins === 0 && cleared.upgrades.levels.speed === 0);
      assert(cleared.selectedSkin === "reef");
      assert(cleared.unlocks.skins.length === 1);
      assert(!cleared.milestones["tutorial.completed"]);
      assert(cleared.settings.volume === 0.25);
      assert(cleared.settings.highContrast === true);
    },
  },
  {
    name: "results update records, rewards, and tier milestones once",
    run() {
      const original = createDefaultSave();
      const first = updateResults(original, {
        score: 1250,
        survivalMs: 245000,
        victory: true,
        clearTimeMs: 240000,
        reachedTier: "T3",
      });
      assert(original.stats.gamesPlayed === 0, "input must not be mutated");
      assert(first.stats.gamesPlayed === 1 && first.stats.victories === 1);
      assert(first.stats.bestClearTimeMs === 240000);
      assert(first.wallet.pearls === 15, `unexpected pearls: ${first.wallet.pearls}`);
      assert(first.upgrades.coins === 37, `unexpected coins: ${first.upgrades.coins}`);

      const second = updateResults(first, {
        score: 0,
        victory: true,
        clearTimeMs: 200000,
        reachedTier: "T3",
      });
      assert(second.stats.bestClearTimeMs === 200000);
      assert(second.wallet.pearls === first.wallet.pearls + 10);
    },
  },
];
