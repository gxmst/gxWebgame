export const STATE = Object.freeze({
  TITLE: "title",
  PLAYING: "playing",
  ENDLESS: "endless",
  UPGRADE_DRAFT: "upgrade-draft",
  DYING: "dying",
  PAUSED: "paused",
  SETTINGS: "settings",
  SHOP: "shop",
  RESULTS: "results",
});

const SIMULATION_STATES = new Set([STATE.PLAYING, STATE.ENDLESS]);
const HUD_STATES = new Set([
  STATE.PLAYING,
  STATE.ENDLESS,
  STATE.UPGRADE_DRAFT,
  STATE.DYING,
]);
const RUN_STATES = new Set([
  STATE.PLAYING,
  STATE.ENDLESS,
  STATE.UPGRADE_DRAFT,
  STATE.DYING,
  STATE.PAUSED,
]);

export function isSimulationState(state) {
  return SIMULATION_STATES.has(state);
}

export function isHudState(state) {
  return HUD_STATES.has(state);
}

export function isRunState(state) {
  return RUN_STATES.has(state);
}

export function getMusicScene(state, { returnFromSettings = STATE.TITLE } = {}) {
  if (state === STATE.SETTINGS) {
    return returnFromSettings === STATE.PAUSED ? "paused" : "settings";
  }
  if (isSimulationState(state)) return "playing";
  return {
    [STATE.TITLE]: "title",
    [STATE.SHOP]: "shop",
    [STATE.UPGRADE_DRAFT]: "paused",
    [STATE.PAUSED]: "paused",
    [STATE.DYING]: "dying",
    [STATE.RESULTS]: "results",
  }[state] || "title";
}
