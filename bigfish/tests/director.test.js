import { CONFIG } from "../js/config.js";
import { Director } from "../js/director.js";
import { isPointInNetColumn } from "../js/hazards.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

function createGame() {
  return {
    player: { x: 3200, y: 1900, mass: 10, displayMass: 10, tier: 1 },
    camera: {
      viewportWidth: 1280,
      zoom: CONFIG.camera.sovereignZoom,
      isWorldPointVisible: (x, y) => x > 2700 && x < 3700 && y > 1600 && y < 2200,
      getVisibleWorldBounds: () => ({
        left: 2500,
        right: 3900,
        top: 1450,
        bottom: 2350,
        width: 1400,
        height: 900,
      }),
    },
    fish: [],
    specials: [],
    elapsed: 0,
    netReplenishDebt: 0,
  };
}

function snapshot(seed) {
  const director = new Director(CONFIG.world, seed);
  director.reset(seed);
  const game = createGame();
  director.populateInitial(game);
  return JSON.stringify({
    fish: game.fish.map(({ id, species, x, y, mass, angle, decisionTimer, dashCooldown, animOffset }) => ({
      id, species, x, y, mass, angle, decisionTimer, dashCooldown, animOffset,
    })),
    specials: game.specials,
  });
}

export const tests = [
  {
    name: "director produces identical gameplay entities for the same seed",
    run() {
      assert(snapshot(20260718) === snapshot(20260718));
      assert(snapshot(20260718) !== snapshot(20260719));
    },
  },
  {
    name: "bait schools spawn offscreen as a compact edible group",
    run() {
      const director = new Director(CONFIG.world, 20260718);
      director.reset(20260718);
      const game = createGame();
      const school = director.spawnBaitSchool(game);

      assert(school !== null);
      assert(school.count >= CONFIG.baitSchool.sizeMin);
      assert(school.count <= CONFIG.baitSchool.sizeMax);
      assert(game.fish.length === school.count);
      assert(game.fish.every((fish) => fish.species === "sardine" && fish.baitSchool));
      assert(game.fish.every((fish) => fish.schoolId === school.schoolId));
      assert(game.fish.every((fish) => fish.mass <= game.player.mass * CONFIG.baitSchool.massRatioMax));
      assert(game.fish.every((fish) => fish.mass < game.player.mass * CONFIG.mass.edibleRatio));
      assert(game.fish.every((fish) => !game.camera.isWorldPointVisible(fish.x, fish.y)));
      assert(game.fish.every((fish) => Math.hypot(fish.x - school.center.x, fish.y - school.center.y)
        <= CONFIG.baitSchool.clusterRadius + 0.001));
    },
  },
  {
    name: "bait school spawning respects school and member caps",
    run() {
      const director = new Director(CONFIG.world, 99);
      director.reset(99);
      const game = createGame();

      for (let index = 0; index < CONFIG.baitSchool.maxSchools + 2; index += 1) {
        director.baitSchoolTimer = 0;
        director.updateBaitSchools(game);
      }

      assert(director.countBaitSchools(game) <= CONFIG.baitSchool.maxSchools);
      assert(director.countBaitMembers(game) <= CONFIG.baitSchool.maxMembers);
    },
  },
  {
    name: "director includes puffer and lantern in the regular ecology",
    run() {
      const director = new Director(CONFIG.world, 424242);
      const species = new Set();
      for (let index = 0; index < 300; index += 1) {
        species.add(director.chooseSpecies("prey", 20));
      }
      assert(species.has("puffer"));
      assert(species.has("lantern"));
      assert(CONFIG.species.sardine.label === "沙丁鱼");
    },
  },
  {
    name: "lantern fish become more common at night",
    run() {
      const dayDirector = new Director(CONFIG.world, 7788);
      const nightDirector = new Director(CONFIG.world, 7788);
      let dayLanterns = 0;
      let nightLanterns = 0;
      for (let index = 0; index < 1000; index += 1) {
        dayLanterns += Number(dayDirector.chooseSpecies("prey", 20, 0) === "lantern");
        nightLanterns += Number(nightDirector.chooseSpecies("prey", 20, 1) === "lantern");
      }
      assert(nightLanterns > dayLanterns * 1.8);
    },
  },
  {
    name: "net-cleared fish replenish gradually outside active net columns",
    run() {
      const director = new Director(CONFIG.world, 5150);
      director.reset(5150);
      director.goldCooldown = 999;
      director.specialTimer = 999;
      director.baitSchoolTimer = 999;
      const game = createGame();
      game.player.mass = CONFIG.mass.sovereignSoftCap;
      game.player.displayMass = CONFIG.mass.sovereignSoftCap;
      game.player.tier = CONFIG.tiers.length;
      game.netReplenishDebt = 4;
      game.specials.push({
        type: "net",
        active: true,
        x: game.player.x,
        y: 1200,
        previousY: 1100,
        width: 320,
        height: CONFIG.net.height,
      });

      director.timer = 0;
      director.update(0, game);
      assert(game.fish.length === 1);
      assert(game.netReplenishDebt === 3);
      assert(game.fish.every((fish) => !isPointInNetColumn(
        fish.x,
        0,
        game.specials[0],
        game.camera.zoom,
        CONFIG.world,
        CONFIG.net.spawnAvoidanceMargin,
      )));

      director.update(CONFIG.net.replenishIntervalSeconds * 0.5, game);
      assert(game.fish.length === 1, "replenishment must not burst within one interval");
      director.update(CONFIG.net.replenishIntervalSeconds * 0.5 + 0.001, game);
      assert(game.fish.length === 2 && game.netReplenishDebt === 2);

      for (let index = 0; index < 40; index++) {
        director.update(CONFIG.net.replenishIntervalSeconds + 0.001, game);
      }
      const target = director.targetFishCount(game.camera.viewportWidth);
      const regularCount = game.fish.filter((fish) => fish.active && !fish.baitSchool).length;
      assert(game.netReplenishDebt === 0);
      assert(regularCount >= target, `${regularCount} should restore target ${target}`);
      assert(game.fish.every((fish) => !isPointInNetColumn(
        fish.x,
        0,
        game.specials[0],
        game.camera.zoom,
        CONFIG.world,
        CONFIG.net.spawnAvoidanceMargin,
      )));
    },
  },
  {
    name: "bait schools retry soon when active net columns block every spawn point",
    run() {
      const director = new Director(CONFIG.world, 9191);
      director.reset(9191);
      const game = createGame();
      game.specials.push({
        type: "net",
        active: true,
        x: game.player.x,
        width: CONFIG.world.width,
        height: CONFIG.net.height,
      });
      director.baitSchoolTimer = 0;
      director.updateBaitSchools(game);
      assert(game.fish.length === 0);
      assert(director.baitSchoolTimer === CONFIG.baitSchool.retrySeconds);
    },
  },
];
