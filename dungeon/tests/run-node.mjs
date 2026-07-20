import { tests as combat } from "./combat.test.js";
import { tests as save } from "./save.test.js";
import { tests as skills } from "./skills.test.js";
import { tests as hero } from "./hero.test.js";
import { tests as dungeon } from "./dungeon.test.js";
import { tests as economy } from "./economy.test.js";
import { tests as outdoor } from "./outdoor.test.js";
import { tests as loot } from "./loot.test.js";
import { tests as effects } from "./effects.test.js";
import { tests as classes } from "./classes.test.js";
import { tests as qol } from "./qol.test.js";

const tests = [...combat, ...save, ...skills, ...hero, ...dungeon, ...economy, ...outdoor, ...loot, ...effects, ...classes, ...qol];
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
