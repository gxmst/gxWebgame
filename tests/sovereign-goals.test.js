import {
  createSovereignGoalState,
  deserializeSovereignGoalState,
  getSovereignGoalProgress,
  getSovereignGoalTarget,
  serializeSovereignGoalState,
  tryExtractSovereignGoal,
  updateSovereignGoal,
} from "../js/sovereign-goals.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

const settings = {
  extractAfterStages: 1,
  baseTargets: { elapsed: 20, eaten: 12, score: 600, netsDodged: 2 },
  targetGrowth: { elapsed: 5, eaten: 4, score: 300, netsDodged: 1 },
};

export const tests = [
  {
    name: "sovereign contract tracks all cumulative metrics without mutating its input",
    run() {
      const original = createSovereignGoalState(settings);
      const result = updateSovereignGoal(original, {
        elapsed: 12,
        eaten: 7,
        score: 350,
        netsDodged: 1,
      }, settings);
      assert(!result.completed && !result.canExtract);
      assert(result.progress.values.elapsed === 12);
      assert(result.progress.values.eaten === 7);
      assert(original.stats.elapsed === 0 && original.stats.eaten === 0);
      const stale = updateSovereignGoal(result.state, { elapsed: 5, score: 20 }, settings);
      assert(stale.state.stats.elapsed === 12 && stale.state.stats.score === 350);
    },
  },
  {
    name: "a completed net-wave contract unlocks extraction and raises every next target",
    run() {
      const initial = createSovereignGoalState(settings);
      const result = updateSovereignGoal(initial, {
        elapsedSeconds: 20,
        eaten: 12,
        score: 600,
        netsDodged: 2,
      }, settings);
      assert(result.completed && result.completedStage === 1);
      assert(result.state.stage === 2 && result.state.completedStages === 1);
      assert(result.canExtract);
      const first = getSovereignGoalTarget(1, settings);
      const second = result.state.target;
      assert(Object.keys(first).every((key) => second[key] > first[key]));
      assert(result.progress.overallRatio === 0, "the new stage starts at zero progress");
    },
  },
  {
    name: "later sovereign stages measure progress from their own completion baseline",
    run() {
      const first = updateSovereignGoal(createSovereignGoalState(settings), {
        elapsed: 20, eaten: 12, score: 600, netsDodged: 2,
      }, settings).state;
      const partial = updateSovereignGoal(first, {
        elapsed: 30, eaten: 20, score: 1000, netsDodged: 4,
      }, settings);
      assert(!partial.completed);
      assert(partial.progress.values.elapsed === 10);
      assert(partial.progress.values.eaten === 8);
      assert(partial.progress.values.score === 400);
      assert(partial.progress.values.netsDodged === 2);
      const target = getSovereignGoalTarget(2, settings);
      const done = updateSovereignGoal(partial.state, {
        elapsed: 20 + target.elapsed,
        eaten: 12 + target.eaten,
        score: 600 + target.score,
        netsDodged: 2 + target.netsDodged,
      }, settings);
      assert(done.completed && done.state.stage === 3);
      assert(done.state.canExtract, "eligibility remains available while pushing stages");
    },
  },
  {
    name: "active extraction is rejected early and freezes an eligible contract",
    run() {
      const early = tryExtractSovereignGoal(createSovereignGoalState(settings), settings);
      assert(!early.success && early.reason === "not-eligible");
      const eligible = updateSovereignGoal(createSovereignGoalState(settings), {
        elapsed: 20, eaten: 12, score: 600, netsDodged: 2,
      }, settings).state;
      const extracted = tryExtractSovereignGoal(eligible, settings);
      assert(extracted.success && extracted.state.extracted && !extracted.state.canExtract);
      const restored = deserializeSovereignGoalState(
        serializeSovereignGoalState(extracted.state, settings),
        settings,
      );
      assert(JSON.stringify(restored.extractedAt) === JSON.stringify(extracted.state.extractedAt));
      const frozen = updateSovereignGoal(extracted.state, {
        elapsed: 999, eaten: 999, score: 99999, netsDodged: 99,
      }, settings);
      assert(frozen.state.stage === eligible.stage);
      assert(tryExtractSovereignGoal(extracted.state, settings).reason === "already-extracted");
    },
  },
  {
    name: "sovereign contract state is serializable and repairs malformed storage",
    run() {
      const state = updateSovereignGoal(createSovereignGoalState(settings), {
        elapsed: 8, eaten: 4, score: 240, netsDodged: 1,
      }, settings).state;
      const restored = deserializeSovereignGoalState(
        serializeSovereignGoalState(state, settings),
        settings,
      );
      assert(JSON.stringify(restored) === JSON.stringify(state));
      const repaired = deserializeSovereignGoalState("{broken", settings);
      assert(repaired.stage === 1 && getSovereignGoalProgress(repaired, settings).overallRatio === 0);
    },
  },
];
