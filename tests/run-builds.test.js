import {
  BASE_RUN_BUILD_EFFECTS,
  RUN_BUILD_CATALOG,
  combineRunBuildEffects,
  createRunBuildState,
  deserializeRunBuildState,
  ensureRunBuildOffer,
  selectRunBuild,
  serializeRunBuildState,
} from "../js/run-builds.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};
const near = (actual, expected, tolerance = 1e-9) => {
  assert(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

const abilityValues = {
  "swift-current": { speedMultiplier: 1.1 },
  "deep-lungs": { staminaBonus: 20 },
  "second-wind": { staminaRecoveryMultiplier: 1.18 },
  "wide-jaw": { mouthMultiplier: 1.12 },
  "golden-instinct": { scoreMultiplier: 1.15 },
  "dense-nutrition": { massGainMultiplier: 1.14 },
  "torpedo-dash": { dashSpeedMultiplier: 1.16 },
  "efficient-dash": { dashDrainMultiplier: 0.82 },
  "feeding-frenzy": { comboWindowBonusSeconds: 0.9 },
};

const settings = {
  milestoneTiers: ["T2", "T4", "T6"],
  choicesPerMilestone: 3,
  abilities: Object.fromEntries(RUN_BUILD_CATALOG.map(({ id }) => [id, {
    name: id,
    description: `${id} description`,
    effects: abilityValues[id],
  }])),
};

function allOffers(seed) {
  let state = createRunBuildState(seed);
  for (const tier of settings.milestoneTiers) {
    state = ensureRunBuildOffer(state, tier, settings).state;
  }
  return state;
}

export const tests = [
  {
    name: "run build offers are fixed by seed and split nine abilities across T2/T4/T6",
    run() {
      const first = allOffers("fixed-seed");
      const repeat = allOffers("fixed-seed");
      const other = allOffers("other-seed");
      assert(JSON.stringify(first.offers) === JSON.stringify(repeat.offers));
      assert(JSON.stringify(first.offers) !== JSON.stringify(other.offers));
      assert(Object.values(first.offers).every((offer) => offer.length === 3));
      const ids = Object.values(first.offers).flat();
      assert(new Set(ids).size === 9, "each configured ability should appear once");
      assert(ids.every((id) => RUN_BUILD_CATALOG.some((entry) => entry.id === id)));
    },
  },
  {
    name: "run build choices are immutable and restricted to the offered milestone",
    run() {
      const original = createRunBuildState(42);
      const offered = ensureRunBuildOffer(original, 2, settings);
      assert(offered.success && offered.created && offered.choices.length === 3);
      assert(Object.keys(original.offers).length === 0, "input must not be mutated");
      const invalid = selectRunBuild(offered.state, "T2", "not-an-ability", settings);
      assert(!invalid.success && invalid.reason === "not-offered");
      const selected = selectRunBuild(offered.state, "T2", offered.choices[0].id, settings);
      assert(selected.success && selected.state.selected.T2 === offered.choices[0].id);
      const repeated = selectRunBuild(selected.state, "T2", offered.choices[1].id, settings);
      assert(!repeated.success && repeated.reason === "already-selected");
      assert(!ensureRunBuildOffer(selected.state, "T3", settings).success);
    },
  },
  {
    name: "all nine run build effect channels aggregate with the correct identity rules",
    run() {
      const effects = combineRunBuildEffects(RUN_BUILD_CATALOG.map(({ id }) => id), settings);
      near(effects.speedMultiplier, 1.1);
      assert(effects.staminaBonus === 20);
      near(effects.staminaRecoveryMultiplier, 1.18);
      near(effects.mouthMultiplier, 1.12);
      near(effects.scoreMultiplier, 1.15);
      near(effects.massGainMultiplier, 1.14);
      near(effects.dashSpeedMultiplier, 1.16);
      near(effects.dashDrainMultiplier, 0.82);
      near(effects.comboWindowBonusSeconds, 0.9);
      const empty = combineRunBuildEffects([], settings);
      assert(JSON.stringify(empty) === JSON.stringify(BASE_RUN_BUILD_EFFECTS));
    },
  },
  {
    name: "run build state survives JSON storage with its pending offer intact",
    run() {
      const offered = ensureRunBuildOffer(createRunBuildState("persist-me"), "T4", settings).state;
      const selected = selectRunBuild(offered, "T4", offered.offers.T4[1], settings).state;
      const restored = deserializeRunBuildState(serializeRunBuildState(selected, settings), settings);
      assert(JSON.stringify(restored) === JSON.stringify(selected));
      const damaged = deserializeRunBuildState(JSON.stringify({
        seed: selected.seed,
        offers: { T2: [selected.offers.T4[0]] },
        selected: { T2: selected.offers.T4[0] },
      }), settings);
      assert(!damaged.offers.T2 && !damaged.selected.T2, "partial offers must be regenerated");
      assert(deserializeRunBuildState("bad json", settings).version === 1);
    },
  },
];
