import { createRunResult, getRunRecordLabels } from "../js/run.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

export const tests = [
  {
    name: "victory clear time stays fixed through later endless survival",
    run() {
      const result = createRunResult({
        score: 3200,
        elapsedSeconds: 410,
        victory: true,
        victoryElapsedMs: 245000,
        sovereignElapsedSeconds: 165,
        reachedTier: "T6",
      });
      assert(result.survivalMs === 410000);
      assert(result.clearTimeMs === 245000);
      assert(result.sovereignDurationMs === 165000);
      assert(result.victory === true);
      assert(createRunResult({ collectedPearls: 3 }).collectedPearls === 3);
    },
  },
  {
    name: "run record labels compare score and captured clear time independently",
    run() {
      const save = { stats: { highScore: 3000, bestClearTimeMs: 250000 } };
      const result = createRunResult({
        score: 3200,
        elapsedSeconds: 500,
        victory: true,
        victoryElapsedMs: 240000,
      });
      const labels = getRunRecordLabels(save, result);
      assert(labels.includes("最高分新纪录"));
      assert(labels.includes("最快通关新纪录"));
    },
  },
];
