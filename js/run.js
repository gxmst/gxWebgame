export function createRunResult({
  score = 0,
  elapsedSeconds = 0,
  victory = false,
  victoryElapsedMs = null,
  reachedTier = "T1",
  collectedPearls = 0,
} = {}) {
  const survivalMs = Math.max(0, Math.round(elapsedSeconds * 1000));
  const capturedClearTime = Number.isFinite(victoryElapsedMs)
    ? Math.max(0, Math.round(victoryElapsedMs))
    : survivalMs;
  return {
    score: Math.max(0, Math.round(score)),
    survivalMs,
    victory: victory === true,
    clearTimeMs: victory ? capturedClearTime : null,
    reachedTier,
    collectedPearls: Math.max(0, Math.round(collectedPearls)),
  };
}

export function getRunRecordLabels(save, result) {
  const labels = [];
  if (result.score > (save?.stats?.highScore ?? 0)) labels.push("最高分新纪录");
  if (result.victory) {
    const previous = save?.stats?.bestClearTimeMs ?? null;
    if (previous === null || result.clearTimeMs < previous) labels.push("最快通关新纪录");
  }
  return labels;
}
