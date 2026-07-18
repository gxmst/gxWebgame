import {
  TELEMETRY_MAX_RUNS,
  appendTelemetry,
  exportTelemetry,
  loadTelemetry,
  sanitizeTelemetry,
  sanitizeTelemetryEntry,
  saveTelemetry,
  summarizeTelemetry,
} from "../js/telemetry.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

const near = (actual, expected, tolerance = 1e-8) => {
  assert(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
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
    name: "telemetry sanitizes gameplay performance and viewport fields",
    run() {
      const entry = sanitizeTelemetryEntry({
        seed: " fixed-seed ",
        tierTimes: { T2: 12.5, T3: -4, "invalid tier!": 8 },
        deathReason: " 被水雷击中 ",
        durationSeconds: 42.25,
        sovereignDurationSeconds: 3,
        longestNoPrey: 5.5,
        net: { captured: 7.9, replenished: 4 },
        netsDodged: 3,
        fps: { average: 58.4, minimum: 31 },
        viewport: { width: 844.9, height: 390.2, dpr: 2 },
        score: 1234,
        reachedTier: "T6",
        extracted: true,
        eaten: 19,
        edgeEaten: 4,
        sovereignReachedAt: 37.5,
        quality: { selected: "auto", final: "auto:1.50", changes: 2 },
        biomeSeconds: { coral: 12, current: 18.5, abyss: 11.75 },
        buildChoices: [{ tier: "T2", id: "wide-jaw", time: 10.5 }],
        contractStages: 2,
      });

      assert(entry.seed === "fixed-seed");
      assert(Object.keys(entry.tierTimes).join() === "T2");
      assert(entry.deathReason === "被水雷击中" && entry.duration === 42.25);
      assert(entry.sovereign && entry.sovereignDuration === 3);
      assert(entry.noPrey === 5.5);
      assert(entry.netCaptured === 7 && entry.netReplenished === 4);
      assert(entry.netsDodged === 3);
      assert(entry.averageFps === 58.4 && entry.minimumFps === 31);
      assert(entry.viewport.width === 844 && entry.viewport.height === 390);
      assert(entry.score === 1234 && entry.reachedTier === "T6" && entry.extracted);
      assert(entry.eaten === 19 && entry.edgeEaten === 4);
      assert(entry.sovereignReachedAt === 37.5 && entry.contractStages === 2);
      assert(entry.quality.final === "auto:1.50" && entry.quality.changes === 2);
      assert(entry.biomeSeconds.abyss === 11.75);
      assert(entry.buildChoices[0].id === "wide-jaw");
    },
  },
  {
    name: "telemetry retains only the newest fifty runs without mutating input",
    run() {
      const source = Array.from({ length: 57 }, (_, seed) => ({ seed, duration: seed }));
      const clean = sanitizeTelemetry(source);
      assert(clean.length === TELEMETRY_MAX_RUNS);
      assert(clean[0].seed === 7 && clean.at(-1).seed === 56);
      assert(source.length === 57);

      const appended = appendTelemetry(clean, { seed: 57 });
      assert(appended.length === TELEMETRY_MAX_RUNS);
      assert(appended[0].seed === 8 && appended.at(-1).seed === 57);
    },
  },
  {
    name: "telemetry storage round trips and all storage failures are contained",
    run() {
      const storage = createMemoryStorage();
      const records = [{ seed: 12, duration: 80, viewport: { width: 1280, height: 720 } }];
      assert(saveTelemetry(records, storage));
      const restored = loadTelemetry(storage);
      assert(restored.length === 1 && restored[0].seed === 12);
      assert(restored[0].viewport.width === 1280);

      assert(loadTelemetry(createMemoryStorage({ "bigfish.telemetry.v1": "{broken" })).length === 0);
      assert(loadTelemetry({ getItem() { throw new Error("blocked"); } }).length === 0);
      assert(!saveTelemetry(records, { setItem() { throw new Error("quota"); } }));
    },
  },
  {
    name: "telemetry summary exposes balance and frame-rate signals",
    run() {
      const summary = summarizeTelemetry([
        {
          seed: 1,
          duration: 60,
          tierTimes: { T2: 10, T3: 30 },
          deathReason: "水雷",
          noPrey: 4,
          netCaptured: 6,
          netReplenished: 3,
          netsDodged: 1,
          averageFps: 60,
          minimumFps: 42,
        },
        {
          seed: 2,
          duration: 120,
          tierTimes: { T2: 12 },
          deathReason: "水雷",
          sovereign: true,
          sovereignDuration: 20,
          noPrey: 8,
          netCaptured: 2,
          netReplenished: 2,
          netsDodged: 2,
          averageFps: 50,
          minimumFps: 28,
        },
      ]);

      assert(summary.runCount === 2 && summary.sovereignRuns === 1);
      near(summary.averageDuration, 90);
      near(summary.sovereignRate, 0.5);
      near(summary.averageNoPrey, 6);
      assert(summary.totalNetCaptured === 8 && summary.totalNetReplenished === 5);
      assert(summary.totalNetsDodged === 3);
      near(summary.averageFps, 55);
      assert(summary.lowestFps === 28);
      assert(summary.deathReasons["水雷"] === 2);
      assert(summary.tierReached.T2 === 2 && summary.tierReached.T3 === 1);
    },
  },
  {
    name: "telemetry export is sanitized portable JSON and performs no I/O",
    run() {
      const exported = JSON.parse(exportTelemetry([{ seed: "demo", duration: -5 }]));
      assert(exported.version === 1);
      assert(exported.records.length === 1 && exported.records[0].duration === 0);
      assert(exported.summary.runCount === 1);
    },
  },
];
