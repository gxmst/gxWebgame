import {
  STATE,
  getMusicScene,
  isHudState,
  isRunState,
  isSimulationState,
} from "../js/game-state.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

export const tests = [
  {
    name: "game state helpers keep simulation, HUD, and run ownership separate",
    run() {
      assert(isSimulationState(STATE.PLAYING));
      assert(isSimulationState(STATE.ENDLESS));
      assert(!isSimulationState(STATE.UPGRADE_DRAFT));
      assert(isHudState(STATE.UPGRADE_DRAFT));
      assert(isHudState(STATE.DYING));
      assert(isRunState(STATE.PAUSED));
      assert(!isRunState(STATE.TITLE));
    },
  },
  {
    name: "game state music mapping treats build drafts and paused settings as paused",
    run() {
      assert(getMusicScene(STATE.PLAYING) === "playing");
      assert(getMusicScene(STATE.UPGRADE_DRAFT) === "paused");
      assert(getMusicScene(STATE.SETTINGS, { returnFromSettings: STATE.PAUSED }) === "paused");
      assert(getMusicScene(STATE.SETTINGS, { returnFromSettings: STATE.TITLE }) === "settings");
      assert(getMusicScene("unknown") === "title");
    },
  },
];
