import { CONFIG } from "../js/config.js";
import {
  applyEventBuffsToStats,
  createDefaultEventState,
  createEventBattleWave,
  listEligibleEventCards,
  pickEventCard,
  resolveEventOption,
  sanitizeEventState,
  shouldTriggerEvent,
} from "../js/events.js";
import {
  acceptQuest,
  canAcceptQuest,
  chooseDialogueOption,
  createDefaultQuestState,
  getDialogueNode,
  getNpcQuestMarker,
  listQuestLog,
  listTownNpcs,
  progressKillQuests,
  sanitizeQuestState,
  turnInQuest,
} from "../js/quests.js";
import { createDefaultSave, sanitizeSave } from "../js/save.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

export const tests = [
  {
    name: "event trigger is seeded and respects eventChance / spacing",
    run() {
      const always = {
        ...CONFIG,
        events: { ...CONFIG.events, eventChance: 1, wavesBetweenEvents: 1 },
      };
      const never = {
        ...CONFIG,
        events: { ...CONFIG.events, eventChance: 0, wavesBetweenEvents: 1 },
      };
      assert(shouldTriggerEvent({ completedWaves: 1, lastEventWave: -999 }, "seed-a", always) === true);
      assert(shouldTriggerEvent({ completedWaves: 1, lastEventWave: -999 }, "seed-a", never) === false);
      // spacing: just had event on wave 1, wave 2 with spacing 2 should not
      const spaced = {
        ...CONFIG,
        events: { ...CONFIG.events, eventChance: 1, wavesBetweenEvents: 2 },
      };
      assert(shouldTriggerEvent({ completedWaves: 2, lastEventWave: 1 }, "s", spaced) === false);
      assert(shouldTriggerEvent({ completedWaves: 3, lastEventWave: 1 }, "s", spaced) === true);
    },
  },
  {
    name: "pickEventCard is deterministic and filters by region",
    run() {
      const forestCtx = { regionId: "forest", worldLevel: 5, eventFlags: {} };
      const a = pickEventCard(forestCtx, "pick-seed-1", CONFIG);
      const b = pickEventCard(forestCtx, "pick-seed-1", CONFIG);
      assert(a && b && a.id === b.id, "same seed must pick same card");
      assert(listEligibleEventCards(forestCtx, CONFIG).length >= 5);
      // desert-only empty: cards either unscoped or forest-scoped; unscoped still appear
      const desertEligible = listEligibleEventCards({ regionId: "desert", worldLevel: 1 }, CONFIG);
      assert(desertEligible.every((card) => !card.regions || card.regions.includes("desert") || card.regions.length === 0 || !card.regions));
    },
  },
  {
    name: "resolveEventOption awards gold/loot and can spend gold",
    run() {
      const card = CONFIG.events.cards.find((entry) => entry.id === "treasure_chest");
      const opened = resolveEventOption(card, 0, {
        heroGold: 100,
        worldLevel: 8,
        lootFloor: 8,
        hero: { classId: "warrior" },
      }, "chest-seed", CONFIG);
      assert(opened.ok === true);
      assert(opened.rewards.gold > 0 || opened.rewards.items.length > 0);
      assert(opened.heroPatch.goldDelta >= 0);

      const merchant = CONFIG.events.cards.find((entry) => entry.id === "mystery_merchant");
      const poor = resolveEventOption(merchant, 0, {
        heroGold: 10,
        worldLevel: 5,
        lootFloor: 5,
      }, "merchant-poor", CONFIG);
      assert(poor.ok === false);
      assert(poor.reason === "not-enough-gold");

      const rich = resolveEventOption(merchant, 0, {
        heroGold: 200,
        worldLevel: 5,
        lootFloor: 5,
        hero: { classId: "warrior" },
      }, "merchant-rich", CONFIG);
      assert(rich.ok === true);
      assert(rich.heroPatch.goldDelta < 0);
      assert(rich.rewards.items.length === 1);
    },
  },
  {
    name: "elite ambush option yields a battle plan; createEventBattleWave reuses outdoor enemies",
    run() {
      const card = CONFIG.events.cards.find((entry) => entry.id === "elite_ambush");
      const resolved = resolveEventOption(card, 0, { worldLevel: 10 }, "ambush", CONFIG);
      assert(resolved.ok && resolved.battle, "ambush must request battle");
      const save = createDefaultSave();
      const wave = createEventBattleWave(save, "battle-seed", resolved.battle, CONFIG);
      assert(wave.mode === "event");
      assert(wave.enemies.length >= 1);
      assert(wave.enemies.every((enemy) => enemy.isElite === true));
    },
  },
  {
    name: "event buffs stack onto combat stats without mutating input",
    run() {
      const stats = { maxHp: 100, hp: 100, attack: 20, defense: 5, speed: 50 };
      const before = JSON.stringify(stats);
      const next = applyEventBuffsToStats(stats, { attack: 2, maxHp: 10, defense: 1 });
      assert(JSON.stringify(stats) === before);
      assert(next.attack === 22 && next.maxHp === 110 && next.defense === 6);
    },
  },
  {
    name: "sanitizeEventState drops junk and keeps materials",
    run() {
      const cleaned = sanitizeEventState({
        eventFlags: { helped_traveler: true, "??": false, 12: true },
        eventBuffs: { attack: 2, nope: 9 },
        materials: { wild_essence: 3, bad: -1 },
        lastEventWave: 4,
      });
      assert(cleaned.eventFlags.helped_traveler === true);
      assert(cleaned.eventBuffs.attack === 2);
      assert(cleaned.materials.wild_essence === 3);
      assert(cleaned.lastEventWave === 4);
      assert(createDefaultEventState().lastEventWave < 0);
    },
  },
  {
    name: "accept / kill progress / turn in cull_wolves quest",
    run() {
      let quests = createDefaultQuestState();
      const can = canAcceptQuest("cull_wolves", quests, CONFIG);
      assert(can.ok === true);
      const accepted = acceptQuest("cull_wolves", quests, CONFIG);
      assert(accepted.ok === true);
      quests = accepted.quests;
      assert(quests.active.includes("cull_wolves"));
      assert(getNpcQuestMarker("forest_elder", quests, CONFIG) === "active");

      // 9 wolves not enough
      let progressed = progressKillQuests(quests, Array(9).fill("corrupt_wolf"), CONFIG);
      quests = progressed.quests;
      assert(progressed.updates[0].current === 9);
      assert(getNpcQuestMarker("forest_elder", quests, CONFIG) === "active");

      progressed = progressKillQuests(quests, ["corrupt_wolf", "skeleton"], CONFIG);
      quests = progressed.quests;
      assert(progressed.updates[0].current === 10);
      assert(getNpcQuestMarker("forest_elder", quests, CONFIG) === "turnin");

      const turned = turnInQuest("cull_wolves", quests, CONFIG);
      assert(turned.ok === true);
      assert(turned.rewards.length >= 2);
      assert(turned.quests.completed.includes("cull_wolves"));
      assert(!turned.quests.active.includes("cull_wolves"));
    },
  },
  {
    name: "dialogue can accept quest and inject turn-in option",
    run() {
      let quests = createDefaultQuestState();
      const root = getDialogueNode("forest_elder", "root", quests, CONFIG);
      assert(root && root.options.length >= 2);

      // navigate to offer and accept
      const offer = getDialogueNode("forest_elder", "offer_quest", quests, CONFIG);
      const acceptIndex = offer.options.findIndex((option) => option.action?.type === "acceptQuest");
      assert(acceptIndex >= 0);
      const chosen = chooseDialogueOption("forest_elder", "offer_quest", acceptIndex, quests, CONFIG);
      assert(chosen.ok && chosen.acceptedQuest?.id === "cull_wolves");
      quests = chosen.quests;

      // complete kills then root should show turn-in
      quests = progressKillQuests(quests, Array(10).fill("corrupt_wolf"), CONFIG).quests;
      const readyRoot = getDialogueNode("forest_elder", "root", quests, CONFIG);
      assert(readyRoot.options.some((option) => option.action?.type === "turnInQuest"));

      const turnIndex = readyRoot.options.findIndex((option) => option.action?.type === "turnInQuest");
      const turned = chooseDialogueOption("forest_elder", "root", turnIndex, quests, CONFIG);
      assert(turned.ok && turned.turnedIn?.id === "cull_wolves");
      assert(turned.rewards.length >= 1);
    },
  },
  {
    name: "listTownNpcs and quest log expose markers and progress text",
    run() {
      const quests = acceptQuest("cull_wolves", createDefaultQuestState(), CONFIG).quests;
      const npcs = listTownNpcs("forest_town", quests, CONFIG);
      assert(npcs.length >= 2);
      const elder = npcs.find((npc) => npc.id === "forest_elder");
      assert(elder?.marker === "active" && elder.markerLabel === "❓");
      const log = listQuestLog(quests, CONFIG);
      assert(log.active.length === 1);
      assert(log.active[0].progressText.includes("0/10") || log.active[0].progressText.includes("腐狼"));
    },
  },
  {
    name: "legacy saves migrate with empty quests and event fields",
    run() {
      const legacy = {
        version: 1,
        hero: {
          name: "老冒险者",
          classId: "warrior",
          classChosen: true,
          level: 5,
          experience: 0,
          baseStats: { strength: 12, agility: 8, intelligence: 3, vitality: 10 },
          equipment: {},
          inventory: [],
          skills: ["basic_attack"],
          gold: 50,
        },
        progress: { highestUnlockedFloor: 6, clearedFloors: [1, 5] },
      };
      const migrated = sanitizeSave(legacy);
      assert(migrated.quests);
      assert(Array.isArray(migrated.quests.active) && migrated.quests.active.length === 0);
      assert(migrated.eventFlags && typeof migrated.eventFlags === "object");
      assert(migrated.eventBuffs && typeof migrated.eventBuffs.attack === "number");
      assert(migrated.materials && typeof migrated.materials === "object");
      assert(migrated.hero.gold === 50);
      assert(migrated.progress.highestUnlockedFloor === 6);

      const fresh = createDefaultSave();
      assert(fresh.quests.active.length === 0);
      assert(fresh.eventMeta.lastEventWave < 0);
    },
  },
  {
    name: "sanitizeQuestState recovers from malformed input",
    run() {
      const cleaned = sanitizeQuestState({
        active: ["cull_wolves", "nope", 3],
        completed: ["cull_wolves", "ghost"],
        progress: { cull_wolves: 3, nope: 9 },
        flags: { helped_traveler: 1 },
      }, CONFIG);
      assert(cleaned.active.includes("cull_wolves"));
      assert(!cleaned.active.includes("nope"));
      // completed drops ids that are still active
      assert(!cleaned.completed.includes("cull_wolves"));
      assert(cleaned.progress.cull_wolves === 3);
      assert(cleaned.flags.helped_traveler === true);
    },
  },
];
