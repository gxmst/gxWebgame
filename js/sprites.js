import { CONFIG } from "./config.js";

/**
 * High-clarity pixel fish pipeline:
 * - Logical 48x28 art, 3x block scale → crisp on high-DPR canvases
 * - Locked palettes (outline / body / light / dark / fin / eye)
 * - 1px silhouette outline + belly shadow + dorsal highlight
 * - Species silhouettes and tier ornaments differ by shape, not only scale
 * - 8-frame tail cycle painted into the sprite sheet
 */

const OUTLINE = "#14252f";

const SPECIES_PALETTES = {
  silver: {
    body: "#a8cfd8",
    light: "#e8fbf6",
    dark: "#4a7288",
    fin: "#6fadbc",
    eye: "#101820",
    accent: "#d5eef0",
  },
  bluefin: {
    body: "#2eb8c4",
    light: "#9af3df",
    dark: "#145f8f",
    fin: "#f0b93a",
    eye: "#0e1830",
    accent: "#ffe08a",
  },
  grouper: {
    body: "#e87858",
    light: "#ffd28a",
    dark: "#8f3a4a",
    fin: "#5a3554",
    eye: "#1c1218",
    accent: "#ffb070",
  },
  barracuda: {
    body: "#6f9a96",
    light: "#d4e8c8",
    dark: "#2f4258",
    fin: "#c94a4a",
    eye: "#f7efd4",
    accent: "#9ec4b8",
  },
  gold: {
    body: "#f0b830",
    light: "#fff0a0",
    dark: "#c46818",
    fin: "#ff6e4c",
    eye: "#2c1820",
    accent: "#fff8d0",
  },
  sardine: {
    body: "#87bdc8",
    light: "#d9f2ee",
    dark: "#3f7180",
    fin: "#6f9baa",
    eye: "#101820",
    accent: "#b9dfe2",
  },
  puffer: {
    body: "#d5b95d",
    light: "#fff0a0",
    dark: "#75643d",
    fin: "#b58a48",
    eye: "#171a18",
    accent: "#6b8b61",
  },
  lantern: {
    body: "#31546d",
    light: "#86e6d0",
    dark: "#152a48",
    fin: "#563f83",
    eye: "#eaffb4",
    accent: "#b8ff76",
  },
};

const PLAYER_SKINS = {
  reef: {
    body: "#3fd4a8",
    light: "#c4ffe6",
    dark: "#0f6e78",
    fin: "#ffc84a",
    eye: "#0c2230",
    accent: "#9dffe0",
  },
  coral: {
    body: "#ff6f68",
    light: "#ffd2b0",
    dark: "#9a3658",
    fin: "#ffe066",
    eye: "#2a1528",
    accent: "#ffb0a0",
  },
  midnight: {
    body: "#5aa8ff",
    light: "#c4e8ff",
    dark: "#344888",
    fin: "#d070ff",
    eye: "#0c1028",
    accent: "#a8d0ff",
  },
  koi: {
    body: "#f2ebe0",
    light: "#ffffff",
    dark: "#cc4a3c",
    fin: "#1a2030",
    eye: "#101418",
    accent: "#ffb0a0",
  },
};

/** Species body plans in logical pixel space. */
const SPECIES_SHAPE = {
  silver: {
    length: 1,
    height: 1,
    bodyStart: 14,
    bodyEnd: 40,
    halfMul: 6.2,
    nose: 0.88,
    belly: 1.02,
    tailSpread: 0.78,
  },
  bluefin: {
    length: 1.06,
    height: 0.9,
    bodyStart: 14,
    bodyEnd: 41,
    halfMul: 5.6,
    nose: 0.95,
    belly: 0.95,
    tailSpread: 0.85,
  },
  grouper: {
    length: 0.9,
    height: 1.28,
    bodyStart: 15,
    bodyEnd: 37,
    halfMul: 7.8,
    nose: 0.72,
    belly: 1.28,
    tailSpread: 0.7,
  },
  barracuda: {
    length: 1.32,
    height: 0.68,
    bodyStart: 12,
    bodyEnd: 44,
    halfMul: 4.1,
    nose: 1.3,
    belly: 0.68,
    tailSpread: 0.62,
  },
  gold: {
    length: 1.08,
    height: 1.08,
    bodyStart: 14,
    bodyEnd: 41,
    halfMul: 6.6,
    nose: 0.95,
    belly: 1.08,
    tailSpread: 0.88,
  },
  sardine: {
    length: 0.78,
    height: 0.62,
    bodyStart: 16,
    bodyEnd: 37,
    halfMul: 4.2,
    nose: 1.05,
    belly: 0.88,
    tailSpread: 0.72,
  },
  puffer: {
    length: 0.82,
    height: 1.42,
    bodyStart: 15,
    bodyEnd: 38,
    halfMul: 8.4,
    nose: 0.82,
    belly: 1.38,
    tailSpread: 0.48,
  },
  lantern: {
    length: 0.94,
    height: 0.78,
    bodyStart: 15,
    bodyEnd: 40,
    halfMul: 5,
    nose: 0.88,
    belly: 0.9,
    tailSpread: 0.9,
  },
};

const LOGIC_W = 48;
const LOGIC_H = 28;
const BLOCK = 3; // each logical pixel → 3x3 on the atlas
const FRAMES = 8;

function makeCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function createGrid() {
  return Array.from({ length: LOGIC_H }, () => Array(LOGIC_W).fill(null));
}

function setPx(grid, x, y, color) {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || iy < 0 || ix >= LOGIC_W || iy >= LOGIC_H) return;
  grid[iy][ix] = color;
}

function fillRect(grid, x, y, w, h, color) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) setPx(grid, xx, yy, color);
  }
}

function profileHalf(shape, normalized, tier) {
  let profile = Math.sin(normalized * Math.PI);
  // Rounder midsection / pointed snout
  if (normalized > 0.7) profile *= shape.nose;
  if (normalized > 0.18 && normalized < 0.68) profile *= shape.belly;
  // Soft diamond for barracuda mid-body
  if (shape.nose > 1.1 && normalized > 0.35 && normalized < 0.75) {
    profile *= 0.92 + Math.sin((normalized - 0.35) / 0.4 * Math.PI) * 0.08;
  }
  let half = Math.max(2, Math.round(profile * shape.halfMul));
  if (tier >= 3 && normalized > 0.22 && normalized < 0.72) half += 1;
  if (tier >= 5 && normalized > 0.28 && normalized < 0.68) half += 1;
  if (tier >= 6 && normalized > 0.32 && normalized < 0.62) half += 1;
  return half;
}

function paintFishGrid(palette, species, frame, tier) {
  const grid = createGrid();
  const shape = SPECIES_SHAPE[species] || SPECIES_SHAPE.silver;
  const wave = Math.sin((frame / FRAMES) * Math.PI * 2);
  const tailBend = wave * 1.7;
  const bodyFlex = wave * 0.45;
  const centerY = 14;
  const bodyStart = shape.bodyStart;
  const bodyEnd = shape.bodyEnd;

  // --- Tail (behind body) ---
  for (let x = 2; x < bodyStart; x++) {
    const along = (bodyStart - x) / Math.max(1, bodyStart - 2);
    const half = Math.min(
      8,
      Math.ceil(along * 7.2 * shape.tailSpread + (tier >= 4 ? 1 : 0)),
    );
    const tailY = centerY + Math.round(tailBend * along * 2.1);
    for (let y = tailY - half; y <= tailY + half; y++) {
      const edge = Math.abs(y - tailY) >= Math.max(1, half - 1);
      const inner = Math.abs(y - tailY) <= 1 && x > bodyStart - 5;
      let color = edge ? palette.fin : palette.body;
      if (inner) color = palette.light;
      if (!edge && y > tailY) color = palette.dark;
      setPx(grid, x, y, color);
    }
    // Fork tips for higher tiers / barracuda
    if (x <= 4 && (tier >= 3 || species === "barracuda" || species === "gold")) {
      setPx(grid, x, tailY - half - 1, palette.fin);
      setPx(grid, x, tailY + half + 1, palette.fin);
    }
  }

  // Tail rays add readable structure without adding runtime draw calls.
  for (let x = 4; x < bodyStart - 1; x += 3) {
    const along = (bodyStart - x) / Math.max(1, bodyStart - 2);
    const tailY = centerY + Math.round(tailBend * along * 2.1);
    setPx(grid, x, tailY - Math.max(1, Math.round(along * 3)), palette.accent || palette.light);
    setPx(grid, x, tailY + Math.max(1, Math.round(along * 3)), palette.dark);
  }

  // --- Body ---
  for (let x = bodyStart; x <= bodyEnd; x++) {
    const normalized = (x - bodyStart) / Math.max(1, bodyEnd - bodyStart);
    const half = profileHalf(shape, normalized, tier);
    const flexY = Math.round(bodyFlex * Math.sin(normalized * Math.PI));
    for (let dy = -half; dy <= half; dy++) {
      const y = centerY + dy + flexY;
      let color = palette.body;
      // Dorsal highlight band
      if (dy <= -half + 1) color = palette.light;
      // Belly shade
      else if (dy >= half - 1) color = palette.dark;
      // Specular ridge
      else if (dy === -1 || dy === -2) color = palette.light;
      // Mid tone strip
      else if (dy >= 1 && dy <= 2) color = palette.dark;
      setPx(grid, x, y, color);
    }
  }

  // --- Fins (layer on top of body) ---
  const finLen = tier >= 5 ? 6 : tier >= 3 ? 5 : 4;
  const finBaseX = bodyStart + Math.round((bodyEnd - bodyStart) * 0.28);
  for (let i = 0; i < finLen; i++) {
    const flex = Math.round(wave * 0.8);
    // Dorsal
    setPx(grid, finBaseX + i, centerY - 6 - i + flex, i < 2 ? palette.light : palette.fin);
    setPx(grid, finBaseX + i, centerY - 5 - i + flex, palette.fin);
    if (tier >= 4) setPx(grid, finBaseX + i + 1, centerY - 6 - i + flex, palette.accent || palette.light);
    // Pelvic
    setPx(grid, finBaseX + 1 + i, centerY + 5 + Math.floor(i * 0.7) - flex, palette.fin);
    setPx(grid, finBaseX + 1 + i, centerY + 6 + Math.floor(i * 0.7) - flex, palette.dark);
  }

  // Pectoral flutter
  const pecX = bodyStart + Math.round((bodyEnd - bodyStart) * 0.42);
  const pecY = centerY + 2 + Math.round(wave * 0.6);
  setPx(grid, pecX, pecY, palette.fin);
  setPx(grid, pecX + 1, pecY + 1, palette.fin);
  setPx(grid, pecX + 2, pecY + 1 + (wave > 0 ? 1 : 0), palette.light);

  // --- Species markings ---
  paintMarkings(grid, species, palette, bodyStart, bodyEnd, centerY, tier, wave);

  if (species === "puffer") {
    for (let x = bodyStart + 2; x < bodyEnd - 2; x += 4) {
      setPx(grid, x, centerY - 9, palette.light);
      setPx(grid, x + 1, centerY + 9, palette.fin);
    }
  } else if (species === "lantern") {
    const lureX = bodyEnd - 7;
    setPx(grid, lureX, centerY - 7, palette.fin);
    setPx(grid, lureX + 1, centerY - 8, palette.fin);
    setPx(grid, lureX + 2, centerY - 9, palette.accent);
    setPx(grid, lureX + 3, centerY - 9, "#efffc0");
  }

  // Gill plate and alternating scale glints give every species a little depth.
  const gillX = bodyEnd - 7;
  setPx(grid, gillX, centerY - 1, palette.dark);
  setPx(grid, gillX, centerY, palette.accent || palette.light);
  setPx(grid, gillX, centerY + 1, palette.dark);
  for (let x = bodyStart + 5; x < bodyEnd - 9; x += 4) {
    const scaleY = centerY + (((x + tier) / 4) % 2 < 1 ? -3 : 3);
    setPx(grid, x, scaleY, palette.accent || palette.light);
    setPx(grid, x + 1, scaleY + 1, palette.dark);
  }

  // --- Eye & mouth ---
  const eyeX = bodyEnd - 4;
  const eyeY = centerY - 2;
  setPx(grid, eyeX, eyeY, palette.eye);
  setPx(grid, eyeX + 1, eyeY, palette.eye);
  setPx(grid, eyeX, eyeY + 1, palette.eye);
  setPx(grid, eyeX + 1, eyeY + 1, palette.eye);
  setPx(grid, eyeX + 1, eyeY, "#ffffff");
  // Mouth line
  setPx(grid, bodyEnd, centerY + 1, palette.dark);
  setPx(grid, bodyEnd + 1, centerY + 1, palette.dark);
  if (species === "barracuda") {
    setPx(grid, bodyEnd + 1, centerY + 2, palette.dark);
    setPx(grid, bodyEnd + 2, centerY + 1, palette.fin);
  }

  // Tier crown / crest
  if (tier >= 5) {
    setPx(grid, bodyEnd - 8, centerY - 7, palette.fin);
    setPx(grid, bodyEnd - 7, centerY - 8, palette.accent || palette.light);
    setPx(grid, bodyEnd - 6, centerY - 7, palette.fin);
  }
  if (tier >= 6) {
    fillRect(grid, bodyStart + 4, centerY - 1, 3, 1, palette.accent || palette.light);
    setPx(grid, bodyEnd - 10, centerY + 5, palette.fin);
    setPx(grid, bodyEnd - 9, centerY + 6, palette.fin);
  }

  return outlineGrid(grid, OUTLINE);
}

function paintMarkings(grid, species, palette, bodyStart, bodyEnd, centerY, tier, wave) {
  if (species === "sardine") {
    for (let x = bodyStart + 2; x < bodyEnd - 3; x++) {
      if (x % 2 === 0) setPx(grid, x, centerY - 2, palette.light);
      if (x % 3 === 0) setPx(grid, x, centerY + 2, palette.dark);
    }
    setPx(grid, bodyEnd - 8, centerY, palette.accent);
  } else if (species === "puffer") {
    for (let x = bodyStart + 3; x < bodyEnd - 4; x += 4) {
      setPx(grid, x, centerY - 3, palette.accent);
      setPx(grid, x + 1, centerY + 3, palette.dark);
    }
  } else if (species === "lantern") {
    for (let x = bodyStart + 3; x < bodyEnd - 4; x += 3) {
      setPx(grid, x, centerY - 2, palette.accent);
      setPx(grid, x + 1, centerY + 2, palette.light);
    }
  } else if (species === "bluefin") {
    for (let x = bodyStart + 2; x < bodyEnd - 3; x++) {
      setPx(grid, x, centerY - 4, palette.light);
      setPx(grid, x, centerY + 4, palette.dark);
    }
    setPx(grid, bodyStart + 10, centerY - 1, palette.accent || palette.fin);
    setPx(grid, bodyStart + 11, centerY - 1, palette.fin);
    setPx(grid, bodyStart + 12, centerY, palette.fin);
  } else if (species === "grouper") {
    const spots = [
      [bodyStart + 4, centerY - 3],
      [bodyStart + 8, centerY + 2],
      [bodyStart + 12, centerY - 2],
      [bodyStart + 15, centerY + 3],
      [bodyStart + 10, centerY + 1],
      [bodyStart + 6, centerY + 3],
    ];
    for (const [x, y] of spots) {
      setPx(grid, x, y, palette.dark);
      setPx(grid, x + 1, y, palette.dark);
      setPx(grid, x, y + 1, palette.dark);
    }
  } else if (species === "barracuda") {
    for (let x = bodyStart + 1; x < bodyEnd - 2; x++) {
      if (x % 2 === 0) setPx(grid, x, centerY - 1, palette.light);
      if (x % 3 === 0) setPx(grid, x, centerY + 2, palette.dark);
    }
  } else if (species === "gold") {
    for (let x = bodyStart + 3; x < bodyEnd - 4; x += 2) {
      setPx(grid, x, centerY - 3, palette.light);
      setPx(grid, x + 1, centerY + 3, palette.dark);
    }
    setPx(grid, bodyStart + 12, centerY - 1, "#fffdf0");
    setPx(grid, bodyStart + 13, centerY - 1, "#ffffff");
    setPx(grid, bodyStart + 14, centerY, palette.accent || palette.light);
  } else {
    // silver scales
    for (let x = bodyStart + 4; x < bodyEnd - 4; x += 3) {
      const y = centerY - 1 + ((x + tier) % 3) - 1;
      setPx(grid, x, y, (x + tier) % 2 ? palette.light : palette.accent || palette.dark);
    }
  }

  // Subtle flex highlight that moves with swim frame
  const shimmerX = bodyStart + 6 + Math.round((1 + wave) * 4);
  setPx(grid, shimmerX, centerY - 2, palette.light);
  setPx(grid, shimmerX + 1, centerY - 2, palette.light);
}

/** Expand silhouette with a 1px outline for readable edges. */
function outlineGrid(grid, outlineColor) {
  const out = createGrid();
  const dirs = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];
  for (let y = 0; y < LOGIC_H; y++) {
    for (let x = 0; x < LOGIC_W; x++) {
      if (grid[y][x]) {
        out[y][x] = grid[y][x];
        continue;
      }
      for (const [dx, dy] of dirs) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= LOGIC_W || ny >= LOGIC_H) continue;
        if (grid[ny][nx]) {
          out[y][x] = outlineColor;
          break;
        }
      }
    }
  }
  return out;
}

function gridToCanvas(grid) {
  const canvas = makeCanvas(LOGIC_W * BLOCK, LOGIC_H * BLOCK);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < LOGIC_H; y++) {
    for (let x = 0; x < LOGIC_W; x++) {
      const color = grid[y][x];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x * BLOCK, y * BLOCK, BLOCK, BLOCK);
    }
  }
  return canvas;
}

function paintPixelFish(palette, species, frame, tier) {
  return gridToCanvas(paintFishGrid(palette, species, frame, tier));
}

export class SpriteFactory {
  constructor() {
    this.cache = new Map();
  }

  getFish(species, frame = 0, tier = 1, skin = "reef", isPlayer = false) {
    const palette = isPlayer
      ? (PLAYER_SKINS[skin] || PLAYER_SKINS.reef)
      : (SPECIES_PALETTES[species] || SPECIES_PALETTES.silver);
    const artSpecies = isPlayer ? "silver" : species;
    const key = `${isPlayer ? `player-${skin}` : species}-${frame}-${tier}`;
    if (!this.cache.has(key)) {
      this.cache.set(key, paintPixelFish(palette, artSpecies, frame, tier));
    }
    return this.cache.get(key);
  }

  drawFish(ctx, fish, screen, radius, options = {}) {
    const travelSpeed = Math.hypot(fish.vx || 0, fish.vy || 0);
    const motion = Math.min(1.5, travelSpeed / 250);
    const speedFactor = fish.dashing ? 18 : 2.8 + motion * 7.2;
    const animationPhase = (options.time || 0) * speedFactor + (fish.animOffset || 0);
    const frame = Math.floor(animationPhase) % FRAMES;
    const species = fish.species || "silver";
    const shape = SPECIES_SHAPE[species] || SPECIES_SHAPE.silver;
    const sprite = this.getFish(species, frame, fish.tier || 1, options.skin, options.isPlayer);

    const width = radius * 3.55 * shape.length;
    const height = radius * 2.05 * shape.height;
    const twist = fish.bodyTwist || 0;

    ctx.save();
    ctx.translate(Math.round(screen.x), Math.round(screen.y));
    ctx.rotate((fish.angle || 0) + twist * 0.36);

    const baseAlpha = options.alpha ?? 1;
    const isGold = species === "gold";
    const isLantern = species === "lantern";

    // Soft contact shadow (reads as depth without blur cost on the sprite itself)
    ctx.save();
    ctx.globalAlpha = baseAlpha * 0.22;
    ctx.fillStyle = "#061820";
    ctx.beginPath();
    ctx.ellipse(2, height * 0.28, width * 0.38, height * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Motion trail
    const trailAlpha = isGold ? 0.36 : options.isPlayer ? 0.16 : fish.dashing ? 0.14 : 0.05;
    ctx.save();
    ctx.globalAlpha = baseAlpha * trailAlpha;
    const trailColor = isGold ? "#ffe37a" : options.isPlayer ? "#9dffe0" : "#d7f4ef";
    ctx.fillStyle = trailColor;
    const trailLength = (isGold || fish.dashing ? width * 0.58 : width * 0.3);
    ctx.fillRect(-width * 0.52 - trailLength, -2, trailLength, 3);
    ctx.globalAlpha = baseAlpha * trailAlpha * 0.65;
    ctx.fillRect(-width * 0.6 - trailLength * 0.7, -6, trailLength * 0.45, 2);
    ctx.fillRect(-width * 0.6 - trailLength * 0.5, 5, trailLength * 0.35, 2);
    ctx.restore();

    // Relation glow (kept soft)
    if (isLantern && (options.nightStrength ?? 0) > 0.08) {
      ctx.shadowColor = "#b8ff76";
      ctx.shadowBlur = 4 + (options.nightStrength ?? 0) * CONFIG.dayNight.rareGlowNightBoost;
    } else if (isGold && (options.nightStrength ?? 0) > 0.08) {
      ctx.shadowColor = "#ffe37a";
      ctx.shadowBlur = 5 + (options.nightStrength ?? 0) * CONFIG.dayNight.rareGlowNightBoost;
    } else if (options.relation === "prey" || options.relation === "fringe") {
      ctx.shadowColor = options.relation === "fringe" ? "#ffd45e" : "#72f5cf";
      ctx.shadowBlur = options.highContrast
        ? 12
        : options.relation === "fringe" ? 7 : 3;
    } else if (options.relation === "predator") {
      ctx.shadowColor = "#ff5b62";
      ctx.shadowBlur = options.highContrast ? 14 : 8;
    } else if (options.isPlayer) {
      ctx.shadowColor = "#baffef";
      ctx.shadowBlur = fish.invulnerable > 0 ? 14 : 5;
    }

    ctx.globalAlpha = baseAlpha;
    ctx.imageSmoothingEnabled = false;
    const swimAmplitude = 0.01 + Math.min(1, motion) * 0.022;
    const swim = 1 + Math.sin(animationPhase * 0.85) * swimAmplitude;
    ctx.drawImage(
      sprite,
      -width * 0.52,
      -height * 0.5 * swim,
      width,
      height * swim,
    );

    // Crisp outer rim so upscaled pixels still read on bright water
    if (options.isPlayer || options.relation === "predator" || isGold) {
      ctx.globalAlpha = baseAlpha * 0.18;
      ctx.strokeStyle = isGold ? "#fff3a0" : options.relation === "predator" ? "#ff8a90" : "#d8fff4";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, 0, width * 0.46, height * 0.36, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (fish.dashing) {
      ctx.globalAlpha = baseAlpha * 0.42;
      ctx.fillStyle = options.isPlayer ? "#a7ffe3" : "#d9edf0";
      ctx.fillRect(-width * 0.86, -3, width * 0.26, 5);
      ctx.fillRect(-width * 0.76, -8, width * 0.12, 2);
      ctx.fillRect(-width * 0.76, 6, width * 0.12, 2);
    }
    ctx.restore();
  }

  drawJelly(ctx, x, y, radius, time) {
    const pulse = 1 + Math.sin(time * 3.2 + x * 0.01) * 0.08;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.scale(pulse, 1 / pulse);
    // Pixel-ish dome via stepped arcs
    ctx.shadowColor = "#cc74ff";
    ctx.shadowBlur = 12;
    const dome = ctx.createRadialGradient(0, -radius * 0.2, radius * 0.08, 0, 0, radius);
    dome.addColorStop(0, "rgba(245, 210, 255, 0.9)");
    dome.addColorStop(0.55, "rgba(193, 117, 238, 0.72)");
    dome.addColorStop(1, "rgba(100, 55, 160, 0.22)");
    ctx.fillStyle = dome;
    ctx.beginPath();
    ctx.arc(0, 0, radius, Math.PI, 0);
    ctx.lineTo(radius, radius * 0.18);
    ctx.lineTo(-radius, radius * 0.18);
    ctx.closePath();
    ctx.fill();
    // Outline
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#14252f";
    ctx.lineWidth = Math.max(1.5, radius * 0.08);
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 245, 255, 0.6)";
    ctx.fillRect(-radius * 0.5, -radius * 0.35, radius * 0.22, radius * 0.16);
    ctx.fillRect(radius * 0.12, -radius * 0.45, radius * 0.2, radius * 0.14);
    ctx.strokeStyle = "#d8a0ff";
    ctx.lineWidth = Math.max(1.5, radius * 0.09);
    ctx.lineCap = "round";
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * radius * 0.28, radius * 0.1);
      ctx.quadraticCurveTo(
        i * radius * 0.34 + Math.sin(time * 4 + i) * 5,
        radius * 0.82,
        i * radius * 0.16 + Math.sin(time * 3 + i) * 3,
        radius * 1.28,
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  drawMine(ctx, x, y, radius, armed, time) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.rotate(time * 0.18);
    ctx.shadowColor = armed ? "#ff665e" : "transparent";
    ctx.shadowBlur = armed ? 10 : 0;
    ctx.fillStyle = armed ? "#243440" : "#4a6670";
    ctx.strokeStyle = "#14252f";
    ctx.lineWidth = Math.max(2, radius * 0.1);
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = armed && Math.sin(time * 8) > 0.45 ? "#ff5c5c" : "#9ab0ad";
    ctx.lineWidth = Math.max(2, radius * 0.12);
    for (let i = 0; i < 8; i++) {
      ctx.rotate(Math.PI / 4);
      ctx.beginPath();
      ctx.moveTo(radius * 0.7, 0);
      ctx.lineTo(radius * 1.2, 0);
      ctx.stroke();
    }
    ctx.fillStyle = armed ? "#ff665e" : "#a7c7c2";
    ctx.fillRect(-radius * 0.12, -radius * 0.12, radius * 0.24, radius * 0.24);
    ctx.restore();
  }
}

export const AVAILABLE_SKINS = Object.keys(PLAYER_SKINS);
