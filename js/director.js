import { createFish, createJelly, createMine, resetEntityIds } from "./entities.js";
import { CONFIG } from "./config.js";
import {
  getBaitSchoolTuning,
  getPredatorRatioRange,
  getRelationWeightEntries,
  isSovereignTier,
} from "./difficulty.js";
import { wrap, wrapDelta } from "./math.js";
import { isPointInNetColumn } from "./hazards.js";

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export class Director {
  constructor(world, seed = Date.now()) {
    this.world = world;
    this.seed = seed >>> 0;
    this.random = mulberry32(this.seed);
    this.timer = 0;
    this.noPreyTime = 0;
    this.goldCooldown = 7;
    this.specialTimer = 0;
    this.spawned = 0;
    this.baitSchoolTimer = CONFIG.baitSchool.initialDelaySeconds;
    this.nextSchoolId = 1;
  }

  get wrapEnabled() {
    return this.world.wrap !== false;
  }

  reset(seed = Date.now()) {
    this.seed = seed >>> 0;
    this.random = mulberry32(this.seed);
    this.timer = 0;
    this.noPreyTime = 0;
    this.goldCooldown = 7;
    this.specialTimer = 0;
    this.spawned = 0;
    this.baitSchoolTimer = CONFIG.baitSchool.initialDelaySeconds;
    this.nextSchoolId = 1;
    resetEntityIds();
  }

  randomRange(min, max) {
    return min + (max - min) * this.random();
  }

  chooseWeighted(entries) {
    let roll = this.random();
    for (const [value, weight] of entries) {
      roll -= weight;
      if (roll <= 0) return value;
    }
    return entries[entries.length - 1][0];
  }

  targetFishCount(viewWidth) {
    if (viewWidth < 720) return 44;
    if (viewWidth < 1000) return 56;
    return 68;
  }

  wrapPoint(x, y) {
    if (!this.wrapEnabled) {
      return {
        x: Math.max(80, Math.min(this.world.width - 80, x)),
        y: Math.max(80, Math.min(this.world.height - 80, y)),
      };
    }
    return {
      x: wrap(x, this.world.width),
      y: wrap(y, this.world.height),
    };
  }

  distanceToPlayer(x, y, player) {
    if (this.wrapEnabled) {
      const dx = wrapDelta(x, player.x, this.world.width);
      const dy = wrapDelta(y, player.y, this.world.height);
      return Math.hypot(dx, dy);
    }
    return Math.hypot(x - player.x, y - player.y);
  }

  populateInitial(game) {
    const count = this.targetFishCount(game.camera.viewportWidth);
    const guaranteed = ["prey", "prey", "prey", "fringe", "neutral", "predator"];
    const weights = getRelationWeightEntries(game.player.tier);
    for (let i = 0; i < count; i++) {
      const relation = guaranteed[i] || this.chooseWeighted(weights);
      const fish = this.makeFish(game, relation, true);
      if (!fish) continue;
      game.fish.push(fish);
      if (fish.species === "bluefin" && ["prey", "fringe"].includes(relation)) {
        const companionCount = Math.min(2 + Math.floor(this.random() * 2), count - i - 1);
        for (let member = 0; member < companionCount; member++) {
          game.fish.push(this.makeCompanion(fish));
          i++;
        }
      }
    }
    for (let i = 0; i < 3; i++) {
      const point = this.randomWorldPoint(game.player, 300, 950);
      game.specials.push(createJelly(point.x, point.y, this.random));
    }
  }

  update(dt, game) {
    this.timer -= dt;
    this.goldCooldown -= dt;
    this.specialTimer -= dt;
    this.baitSchoolTimer -= dt;

    const visiblePrey = game.fish.reduce((count, fish) => {
      if (!fish.active || fish.mass > game.player.mass * 0.82) return count;
      return count + Number(game.camera.isWorldPointVisible(fish.x, fish.y, 80));
    }, 0);
    this.noPreyTime = visiblePrey > 0 ? 0 : this.noPreyTime + dt;

    if (this.timer <= 0) {
      this.reapDistant(game);
      const target = this.targetFishCount(game.camera.viewportWidth);
      const regularCount = game.fish.reduce(
        (count, fish) => count + Number(fish.active && !fish.baitSchool),
        0,
      );
      let missing = Math.max(0, target - regularCount);
      if (this.noPreyTime > 6) missing = Math.max(missing, 2);
      const debt = Math.max(0, Math.floor(game.netReplenishDebt || 0));
      game.netReplenishDebt = Math.min(debt, missing);
      const replenishing = game.netReplenishDebt > 0;
      this.timer = replenishing ? CONFIG.net.replenishIntervalSeconds : 0.28;
      const batch = Math.min(
        replenishing ? CONFIG.net.replenishBatchMax : 3,
        missing,
      );
      const weights = getRelationWeightEntries(game.player.tier);
      for (let i = 0; i < batch; i++) {
        const forcedPrey = this.noPreyTime > 6 || visiblePrey + i < 2;
        const relation = forcedPrey
          ? (this.noPreyTime > 9 ? "prey" : "fringe")
          : this.chooseWeighted(weights);
        const fish = this.makeFish(game, relation, false);
        if (fish) {
          game.fish.push(fish);
          if (game.netReplenishDebt > 0) {
            game.netReplenishDebt--;
            if (game.metrics) game.metrics.netReplenished = (game.metrics.netReplenished || 0) + 1;
          }
        }
      }
    }

    if (this.goldCooldown <= 0 && !game.fish.some((fish) => fish.species === "gold")) {
      const fish = this.makeFish(game, "fringe", false, "gold");
      if (fish) game.fish.push(fish);
      this.goldCooldown = this.randomRange(16, 24);
    }

    if (this.specialTimer <= 0) {
      this.specialTimer = this.randomRange(4, 7);
      const jellyCount = game.specials.filter((item) => item.type === "jelly").length;
      if (game.player.tier >= 3 && jellyCount < 5) {
        const point = this.spawnPoint(game, 150);
        if (point) game.specials.push(createJelly(point.x, point.y, this.random));
      }
      const mineCount = game.specials.filter((item) => item.type === "mine").length;
      if (game.player.tier >= 5 && mineCount < 5) {
        const point = this.spawnPoint(game, 230);
        if (point) game.specials.push(createMine(point.x, point.y, this.random));
      }
    }

    this.updateBaitSchools(game);
  }

  updateBaitSchools(game) {
    if (!CONFIG.baitSchool.enabled || this.baitSchoolTimer > 0) return;
    const tuning = getBaitSchoolTuning(game.player.tier);
    const size = this.baitSchoolSizeRange(game.player.tier);
    const schoolCount = this.countBaitSchools(game);
    const memberCount = this.countBaitMembers(game);
    if (schoolCount >= CONFIG.baitSchool.maxSchools
      || memberCount > CONFIG.baitSchool.maxMembers - size.min) {
      this.baitSchoolTimer = CONFIG.baitSchool.retrySeconds;
      return;
    }

    const school = this.spawnBaitSchool(game);
    if (!school) {
      this.baitSchoolTimer = CONFIG.baitSchool.retrySeconds;
      return;
    }
    this.baitSchoolTimer = this.randomRange(
      CONFIG.baitSchool.intervalMinSeconds,
      CONFIG.baitSchool.intervalMaxSeconds,
    ) * tuning.intervalScale;
  }

  countBaitMembers(game) {
    return game.fish.reduce(
      (count, fish) => count + Number(fish.active && fish.baitSchool),
      0,
    );
  }

  countBaitSchools(game) {
    const ids = new Set();
    for (const fish of game.fish) {
      if (fish.active && fish.baitSchool && fish.schoolId != null) ids.add(fish.schoolId);
    }
    return ids.size;
  }

  spawnBaitSchool(game) {
    const size = this.baitSchoolSizeRange(game.player.tier);
    const remaining = CONFIG.baitSchool.maxMembers - this.countBaitMembers(game);
    if (remaining < size.min) return null;
    const requested = Math.floor(this.randomRange(
      size.min,
      size.max + 1,
    ));
    const count = Math.min(requested, remaining);
    const center = this.baitSchoolSpawnPoint(game);
    if (!center) return null;
    const towardPlayer = this.wrapEnabled
      ? {
        x: wrapDelta(game.player.x, center.x, this.world.width),
        y: wrapDelta(game.player.y, center.y, this.world.height),
      }
      : { x: game.player.x - center.x, y: game.player.y - center.y };
    const baseAngle = Math.atan2(towardPlayer.y, towardPlayer.x) + this.randomRange(-0.38, 0.38);
    const schoolId = `bait-${this.nextSchoolId++}`;

    for (let index = 0; index < count; index++) {
      const offsetAngle = this.randomRange(0, Math.PI * 2);
      const offsetDistance = Math.sqrt(this.random()) * CONFIG.baitSchool.clusterRadius;
      const point = this.wrapPoint(
        center.x + Math.cos(offsetAngle) * offsetDistance,
        center.y + Math.sin(offsetAngle) * offsetDistance,
      );
      const angle = baseAngle + this.randomRange(-0.2, 0.2);
      const ratio = this.randomRange(
        CONFIG.baitSchool.massRatioMin,
        CONFIG.baitSchool.massRatioMax,
      );
      game.fish.push(createFish({
        x: point.x,
        y: point.y,
        mass: Math.max(1.4, game.player.mass * ratio),
        species: "sardine",
        angle,
        vx: Math.cos(angle) * 42,
        vy: Math.sin(angle) * 42,
        spawnGrace: 0.45,
        schoolId,
        baitSchool: true,
        random: this.random,
      }));
    }
    return { schoolId, count, center };
  }

  baitSchoolSizeRange(tier) {
    const scale = getBaitSchoolTuning(tier).sizeScale;
    const min = Math.max(1, Math.round(CONFIG.baitSchool.sizeMin * scale));
    const max = Math.max(min, Math.round(CONFIG.baitSchool.sizeMax * scale));
    return { min, max };
  }

  baitSchoolSpawnPoint(game) {
    const bounds = game.camera.getVisibleWorldBounds(CONFIG.baitSchool.offscreenMargin);
    for (let attempt = 0; attempt < CONFIG.net.spawnAttempts; attempt++) {
      const side = Math.floor(this.random() * 4);
      const point = side === 0
        ? this.wrapPoint(bounds.left, this.randomRange(bounds.top, bounds.bottom))
        : side === 1
          ? this.wrapPoint(bounds.right, this.randomRange(bounds.top, bounds.bottom))
          : side === 2
            ? this.wrapPoint(this.randomRange(bounds.left, bounds.right), bounds.top)
            : this.wrapPoint(this.randomRange(bounds.left, bounds.right), bounds.bottom);
      if (this.isSpawnPointClearOfNets(game, point, CONFIG.baitSchool.clusterRadius)) return point;
    }
    return null;
  }

  makeFish(game, relation, initial, forcedSpecies = null) {
    if (isSovereignTier(game.player.tier) && relation === "predator") {
      relation = this.chooseWeighted(getRelationWeightEntries(game.player.tier));
    }
    const playerMass = game.player.mass;
    let ratio;
    if (relation === "prey") ratio = this.randomRange(0.28, 0.57);
    else if (relation === "fringe") ratio = this.randomRange(0.61, 0.8);
    else if (relation === "neutral") ratio = this.randomRange(0.87, 1.13);
    else {
      const [minRatio, maxRatio] = getPredatorRatioRange(game.player.tier);
      ratio = this.randomRange(minRatio, maxRatio);
    }

    const species = forcedSpecies || this.chooseSpecies(
      relation,
      game.elapsed,
      game.dayNight?.nightStrength ?? 0,
    );
    const mass = Math.max(4.5, playerMass * ratio);
    let point;
    if (initial) {
      const minimum = relation === "predator" ? 430 : 150;
      point = this.randomWorldPoint(game.player, minimum, 850);
    } else {
      point = this.spawnPoint(game, relation === "predator" ? 260 : 120);
    }
    if (!point) return null;

    const angle = this.randomRange(0, Math.PI * 2);
    this.spawned++;
    return createFish({
      x: point.x,
      y: point.y,
      mass,
      species,
      angle,
      vx: Math.cos(angle) * 18,
      vy: Math.sin(angle) * 18,
      spawnGrace: relation === "predator" ? 1.25 : 0.65,
      random: this.random,
    });
  }

  makeCompanion(leader) {
    const offsetAngle = this.randomRange(0, Math.PI * 2);
    const distance = this.randomRange(48, 105);
    const angle = leader.angle + this.randomRange(-0.22, 0.22);
    const point = this.wrapPoint(
      leader.x + Math.cos(offsetAngle) * distance,
      leader.y + Math.sin(offsetAngle) * distance,
    );
    return createFish({
      x: point.x,
      y: point.y,
      mass: leader.mass * this.randomRange(0.95, 1.05),
      species: "bluefin",
      angle,
      vx: Math.cos(angle) * 18,
      vy: Math.sin(angle) * 18,
      spawnGrace: leader.spawnGrace,
      random: this.random,
    });
  }

  chooseSpecies(relation, elapsed, nightStrength = 0) {
    if (relation === "predator" && elapsed > 8 && this.random() < 0.42) return "barracuda";
    const roll = this.random();
    const night = Math.max(0, Math.min(1, nightStrength));
    const entries = [
      ["silver", 0.31 - night * 0.08],
      ["bluefin", 0.23 - night * 0.03],
      ["grouper", 0.17 - night * 0.02],
      ["puffer", 0.12 - night * 0.01],
      ["lantern", 0.1 + night * CONFIG.dayNight.lanternNightWeightBonus],
      [elapsed > 8 ? "barracuda" : "silver", 0.07],
    ];
    let cursor = roll;
    for (const [species, weight] of entries) {
      cursor -= weight;
      if (cursor <= 0) return species;
    }
    return entries[entries.length - 1][0];
  }

  randomWorldPoint(player, minDistance, maxDistance) {
    const angle = this.randomRange(0, Math.PI * 2);
    const distance = this.randomRange(minDistance, maxDistance);
    return this.wrapPoint(
      player.x + Math.cos(angle) * distance,
      player.y + Math.sin(angle) * distance,
    );
  }

  spawnPoint(game, extraSafety = 0, radius = 0) {
    const bounds = game.camera.getVisibleWorldBounds(160);
    const relativeSpeed = 440;
    const safety = Math.max(380, relativeSpeed * 1.0) + extraSafety;
    for (let attempt = 0; attempt < CONFIG.net.spawnAttempts; attempt++) {
      const side = Math.floor(this.random() * 4);
      let x;
      let y;
      if (side === 0) {
        x = bounds.left;
        y = this.randomRange(bounds.top, bounds.bottom);
      } else if (side === 1) {
        x = bounds.right;
        y = this.randomRange(bounds.top, bounds.bottom);
      } else if (side === 2) {
        x = this.randomRange(bounds.left, bounds.right);
        y = bounds.top;
      } else {
        x = this.randomRange(bounds.left, bounds.right);
        y = bounds.bottom;
      }
      const point = this.wrapPoint(x, y);
      if (this.distanceToPlayer(point.x, point.y, game.player) >= safety
        && this.isSpawnPointClearOfNets(game, point, radius)) return point;
    }
    for (let attempt = 0; attempt < CONFIG.net.spawnFallbackAttempts; attempt++) {
      const point = this.randomWorldPoint(game.player, safety, safety + 500);
      if (this.isSpawnPointClearOfNets(game, point, radius)) return point;
    }
    return null;
  }

  isSpawnPointClearOfNets(game, point, radius = 0) {
    const zoom = game.camera.zoom ?? 1;
    return !(game.specials || []).some((item) => item.active
      && item.type === "net"
      && isPointInNetColumn(
        point.x,
        radius,
        item,
        zoom,
        this.world,
        CONFIG.net.spawnAvoidanceMargin,
      ));
  }

  reapDistant(game) {
    const maxDist = 1200;
    const maxDistSq = maxDist * maxDist;
    game.fish = game.fish.filter((fish) => {
      if (!fish.active) return false;
      if (game.camera.isWorldPointVisible(fish.x, fish.y, 300)) return true;
      const d = this.distanceToPlayer(fish.x, fish.y, game.player);
      return d * d <= maxDistSq;
    });
    game.specials = game.specials.filter((item) => {
      if (!item.active) return false;
      if (item.type === "net") return true;
      if (game.camera.isWorldPointVisible(item.x, item.y, 200)) return true;
      return this.distanceToPlayer(item.x, item.y, game.player) <= maxDist;
    });
  }
}
