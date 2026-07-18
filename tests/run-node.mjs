import { tests as rules } from "./rules.test.js";
import { tests as camera } from "./camera.test.js";
import { tests as save } from "./save.test.js";
import { tests as run } from "./run.test.js";
import { tests as director } from "./director.test.js";
import { tests as quality } from "./quality.test.js";
import { tests as upgrades } from "./upgrades.test.js";
import { tests as effects } from "./effects.test.js";
import { tests as input } from "./input.test.js";
import { tests as dayNight } from "./day-night.test.js";
import { tests as environment } from "./environment.test.js";

const tests = [...rules, ...camera, ...save, ...run, ...director, ...quality, ...upgrades, ...effects, ...input, ...dayNight, ...environment];
let passed = 0;

for (const test of tests) {
  try {
    await test.run();
    passed += 1;
    console.log(`PASS · ${test.name}`);
  } catch (error) {
    console.error(`FAIL · ${test.name}`);
    console.error(error?.stack ?? error);
  }
}

const failed = tests.length - passed;
console.log(`\n${passed}/${tests.length} passed${failed ? `, ${failed} failed` : ""}`);
if (failed) process.exitCode = 1;
