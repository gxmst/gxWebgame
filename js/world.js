import { CONFIG } from "./config.js";
import { clamp, lerp, wrap, wrapDelta } from "./math.js";

function hash(index) {
  const value = Math.sin(index * 91.731 + 17.23) * 43758.5453;
  return value - Math.floor(value);
}

/** Parse #rgb / #rrggbb / rgb() / rgba() into [r,g,b]. */
function parseColor(color) {
  if (Array.isArray(color) && color.length >= 3) {
    return [
      clamp(Number(color[0]) || 0, 0, 255),
      clamp(Number(color[1]) || 0, 0, 255),
      clamp(Number(color[2]) || 0, 0, 255),
    ];
  }
  const text = String(color || "").trim();
  const rgbMatch = text.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (rgbMatch) {
    return [
      clamp(Number(rgbMatch[1]), 0, 255),
      clamp(Number(rgbMatch[2]), 0, 255),
      clamp(Number(rgbMatch[3]), 0, 255),
    ];
  }
  let hex = text.replace("#", "");
  if (hex.length === 3) {
    hex = hex.split("").map((ch) => ch + ch).join("");
  }
  if (hex.length >= 6 && /^[0-9a-f]+$/i.test(hex)) {
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  }
  return [8, 48, 64];
}

function mixColor(a, b, t) {
  const [ar, ag, ab] = parseColor(a);
  const [br, bg, bb] = parseColor(b);
  const u = clamp(Number.isFinite(t) ? t : 0, 0, 1);
  const r = Math.round(lerp(ar, br, u));
  const g = Math.round(lerp(ag, bg, u));
  const bch = Math.round(lerp(ab, bb, u));
  return `rgb(${r}, ${g}, ${bch})`;
}

function rgba(color, alpha) {
  const [r, g, b] = parseColor(color);
  return `rgba(${r}, ${g}, ${b}, ${clamp(Number.isFinite(alpha) ? alpha : 1, 0, 1)})`;
}

export class WorldRenderer {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.farSilhouettes = [];
    this.midDecor = [];
    this.nearDecor = [];
    this.bubbles = [];
    this.motes = [];
    this.backgroundImage = null;
    this.backgroundReady = false;
    this.backgroundFailed = false;
    this.buildDecorations();
    this.loadBackgroundImage();
  }

  loadBackgroundImage() {
    if (!CONFIG.world.useBackgroundImage || typeof Image === "undefined") return;
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      this.backgroundImage = image;
      this.backgroundReady = true;
      this.backgroundFailed = false;
    };
    image.onerror = () => {
      this.backgroundImage = null;
      this.backgroundReady = false;
      this.backgroundFailed = true;
    };
    image.src = CONFIG.world.backgroundImageUrl;
  }

  buildDecorations() {
    for (let i = 0; i < 48; i++) {
      this.farSilhouettes.push({
        x: hash(i + 11) * this.width,
        y: this.height * (0.2 + hash(i + 12) * 0.7),
        w: 80 + hash(i + 13) * 160,
        h: 90 + hash(i + 14) * 180,
        kind: hash(i + 15) < 0.55 ? "ridge" : "kelp",
        phase: hash(i + 16) * Math.PI * 2,
      });
    }

    for (let i = 0; i < 120; i++) {
      this.midDecor.push({
        x: hash(i + 5) * this.width,
        y: this.height * (0.35 + hash(i + 6) * 0.6),
        type: hash(i + 7) < 0.55 ? "coral" : "rock",
        scale: 0.7 + hash(i + 9) * 1.5,
        colorIndex: Math.floor(hash(i + 10) * 4),
      });
    }

    for (let i = 0; i < 100; i++) {
      this.nearDecor.push({
        x: hash(i + 30) * this.width,
        y: this.height * (0.55 + hash(i + 31) * 0.42),
        type: hash(i + 32) < 0.62 ? "grass" : hash(i + 33) < 0.5 ? "anemone" : "pebble",
        scale: 0.7 + hash(i + 34) * 1.2,
        phase: hash(i + 35) * Math.PI * 2,
      });
    }

    for (let i = 0; i < 130; i++) {
      this.bubbles.push({
        x: hash(i + 100) * this.width,
        y: hash(i + 200) * this.height,
        size: 2 + hash(i + 300) * 5.5,
        speed: 10 + hash(i + 400) * 18,
        phase: hash(i + 500) * Math.PI * 2,
      });
    }
    for (let i = 0; i < 200; i++) {
      this.motes.push({
        x: hash(i + 700) * this.width,
        y: hash(i + 900) * this.height,
        size: hash(i + 1100) < 0.78 ? 1 : 2,
        drift: 2 + hash(i + 1300) * 8,
        phase: hash(i + 1500) * Math.PI * 2,
      });
    }
  }

  /**
   * depthT 0 = surface (bright), 1 = abyss (dark). Driven by camera Y.
   */
  draw(ctx, camera, time, dayNight = null) {
    const width = camera.viewportWidth;
    const height = camera.viewportHeight;
    const L = CONFIG.lighting;
    const depthT = Number.isFinite(camera.depthT)
      ? camera.depthT
      : clamp(camera.y / Math.max(1, this.height), 0, 1);

    // --- Base water body: image when ready, gradient-only fallback otherwise ---
    const usingBackgroundImage = this.drawBackgroundImage(ctx, camera, width, height);
    const topCol = depthT < 0.45
      ? mixColor(L.surfaceColor, L.midColor, depthT / 0.45)
      : mixColor(L.midColor, L.deepColor, (depthT - 0.45) / 0.55);
    const botCol = depthT < 0.5
      ? mixColor(L.midColor, L.deepColor, depthT / 0.5)
      : mixColor(L.deepColor, L.abyssColor, (depthT - 0.5) / 0.5);

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    // Screen-space: top of view is "more surface-ward", bottom is deeper —
    // and overall palette already shifted by camera depth.
    const screenLift = L.screenGradientStrength * (1 - depthT * 0.35);
    gradient.addColorStop(0, mixColor(topCol, L.surfaceColor, 0.35 * screenLift));
    gradient.addColorStop(0.4, topCol);
    gradient.addColorStop(0.75, botCol);
    gradient.addColorStop(1, mixColor(botCol, L.abyssColor, 0.45 + depthT * 0.35));
    ctx.save();
    ctx.globalAlpha = usingBackgroundImage ? CONFIG.world.backgroundTintAlpha : 1;
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    // Surface bloom when high; abyss veil when deep
    if (depthT < 0.55) {
      const surface = ctx.createLinearGradient(0, 0, 0, height * 0.55);
      const glowAlpha = (1 - depthT / 0.55) * 0.55;
      surface.addColorStop(0, rgba(L.surfaceColor, 0.28 * glowAlpha));
      surface.addColorStop(0.55, rgba(L.surfaceColor, 0.08 * glowAlpha));
      surface.addColorStop(1, rgba(L.surfaceColor, 0));
      ctx.fillStyle = surface;
      ctx.fillRect(0, 0, width, height * 0.55);
    }

    this.drawSunbeams(ctx, camera, time, depthT, dayNight);
    this.drawCaustics(ctx, camera, time, depthT);
    // The photo already contains distant reefs; keep generated far/mid scenery
    // only for the gradient fallback so the two art layers never look muddy.
    if (!usingBackgroundImage) this.drawFarLayer(ctx, camera, time, depthT);

    // No world boundary — open water wraps forever.

    const halfW = width / (2 * camera.zoom) + 200;
    const halfH = height / (2 * camera.zoom) + 200;

    if (!usingBackgroundImage) {
      for (const item of this.midDecor) {
        if (!this.#nearCamera(camera, item.x, item.y, halfW, halfH)) continue;
        const scale = item.scale * camera.zoom;
        for (const point of camera.getVisibleWrappedScreens(item.x, item.y, 180 * item.scale)) {
          const shade = this.#entityShade(depthT, point.y, height);
          ctx.save();
          ctx.globalAlpha = shade;
          if (item.type === "coral") this.drawCoral(ctx, point.x, point.y, scale, item.colorIndex, 1);
          else this.drawRock(ctx, point.x, point.y, scale, 1);
          ctx.restore();
        }
      }
    }

    this.drawNearLayer(ctx, camera, time, halfW, halfH, depthT, height);

    // Bubbles rise while the whole water column drifts almost imperceptibly.
    const bubbleAlpha = lerp(0.4, 0.12, depthT);
    ctx.strokeStyle = `rgba(202, 247, 235, ${bubbleAlpha})`;
    ctx.lineWidth = 1.2;
    for (const bubble of this.bubbles) {
      const loopY = wrap(
        bubble.y - time * bubble.speed + time * CONFIG.visuals.currentDriftY,
        this.height,
      );
      const wx = wrap(
        bubble.x + time * CONFIG.visuals.currentDriftX + Math.sin(time + bubble.phase) * 10,
        this.width,
      );
      if (!this.#nearCamera(camera, wx, loopY, halfW, halfH)) continue;
      const r = Math.max(1.2, bubble.size * camera.zoom);
      for (const point of camera.getVisibleWrappedScreens(wx, loopY, bubble.size * 2)) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = `rgba(230, 255, 250, ${0.12 + (1 - depthT) * 0.12})`;
        ctx.beginPath();
        ctx.arc(point.x - r * 0.25, point.y - r * 0.25, r * 0.28, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.fillStyle = `rgba(218, 255, 232, ${0.12 + (1 - depthT) * 0.16})`;
    for (const mote of this.motes) {
      const driftX = Math.sin(time * 0.35 + mote.phase) * mote.drift;
      const loopY = wrap(
        mote.y + time * (CONFIG.visuals.currentDriftY - mote.drift * 0.35),
        this.height,
      );
      const wx = wrap(mote.x + time * CONFIG.visuals.currentDriftX + driftX, this.width);
      if (!this.#nearCamera(camera, wx, loopY, halfW, halfH)) continue;
      const size = Math.max(1, Math.round(mote.size * camera.zoom));
      for (const point of camera.getVisibleWrappedScreens(wx, loopY, mote.size * 2)) {
        ctx.fillRect(Math.round(point.x), Math.round(point.y), size, size);
      }
    }

    this.drawDayNightOverlay(ctx, width, height, dayNight);

    // Depth veil: stronger in abyss, heavier toward bottom of screen
    const veil = ctx.createLinearGradient(0, 0, 0, height);
    const abyssA = lerp(0.05, 0.55, depthT);
    veil.addColorStop(0, `rgba(0, 10, 18, ${abyssA * 0.15})`);
    veil.addColorStop(0.45, `rgba(0, 8, 16, ${abyssA * 0.45})`);
    veil.addColorStop(1, `rgba(0, 4, 10, ${abyssA})`);
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, width, height);

    // Soft vignette (focus, not map edge)
    const vig = ctx.createRadialGradient(
      width / 2,
      height * 0.42,
      height * 0.18,
      width / 2,
      height * 0.5,
      height * 0.82,
    );
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, `rgba(2, 12, 20, ${0.18 + depthT * 0.2})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, width, height);
  }

  drawBackgroundImage(ctx, camera, width, height) {
    const image = this.backgroundImage;
    if (!CONFIG.world.useBackgroundImage || !this.backgroundReady || !image?.naturalWidth) return false;

    const overscan = CONFIG.visuals.backgroundOverscan;
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight) * overscan;
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    const parallax = CONFIG.visuals.backgroundParallax;
    const phaseX = camera.x / Math.max(1, this.width) * Math.PI * 2;
    const phaseY = camera.y / Math.max(1, this.height) * Math.PI * 2;
    const travelX = Math.max(0, (drawWidth - width) * 0.45);
    const travelY = Math.max(0, (drawHeight - height) * 0.45);
    const offsetX = Math.sin(phaseX) * Math.min(travelX, width * parallax);
    const offsetY = Math.sin(phaseY) * Math.min(travelY, height * parallax);
    const x = (width - drawWidth) * 0.5 + offsetX;
    const y = (height - drawHeight) * 0.5 + offsetY;
    ctx.drawImage(image, x, y, drawWidth, drawHeight);
    return true;
  }

  /** Expose shade for entities (game can multiply alpha/brightness). */
  getDepthShade(camera, screenY = null) {
    const depthT = camera.depthT ?? 0.5;
    const height = camera.viewportHeight || 720;
    return this.#entityShade(depthT, screenY ?? height * 0.5, height);
  }

  #entityShade(depthT, screenY, viewHeight) {
    const L = CONFIG.lighting;
    const base = lerp(L.entityShadeSurface, L.entityShadeAbyss, depthT);
    const screenT = clamp(screenY / Math.max(1, viewHeight), 0, 1);
    // Higher on screen → slightly brighter (looking up toward light)
    const screenBoost = (1 - screenT) * 0.18 * (1 - depthT * 0.5);
    return clamp(base + screenBoost, 0.35, 1.05);
  }

  #nearCamera(camera, x, y, halfW, halfH) {
    if (camera.wrap) {
      return Math.abs(wrapDelta(x, camera.x, this.width)) <= halfW
        && Math.abs(wrapDelta(y, camera.y, this.height)) <= halfH;
    }
    return Math.abs(x - camera.x) <= halfW && Math.abs(y - camera.y) <= halfH;
  }

  drawFarLayer(ctx, camera, time, depthT) {
    const halfW = camera.viewportWidth / (2 * camera.zoom) + 320;
    const halfH = camera.viewportHeight / (2 * camera.zoom) + 320;
    const parallax = CONFIG.visuals.parallaxFar;
    ctx.save();
    ctx.globalAlpha = 0.1 + (1 - depthT) * 0.08;
    for (const item of this.farSilhouettes) {
      // Mild parallax without breaking wrap: offset in camera space only
      const ox = wrapDelta(item.x, camera.x, this.width) * parallax;
      // Reconstruct a world-ish point near camera for worldToScreen
      const drawX = wrap(camera.x + ox, this.width);
      const drawY = item.y;
      if (!this.#nearCamera(camera, drawX, drawY, halfW, halfH)) continue;
      const w = item.w * camera.zoom * 0.55;
      const h = item.h * camera.zoom * 0.55;
      for (const point of camera.getVisibleWrappedScreens(drawX, drawY, Math.max(item.w, item.h))) {
        if (item.kind === "ridge") {
          ctx.fillStyle = depthT > 0.55 ? "#061e28" : "#0a3a48";
          ctx.beginPath();
          ctx.moveTo(point.x - w, point.y + h * 0.2);
          ctx.quadraticCurveTo(point.x - w * 0.3, point.y - h, point.x, point.y - h * 0.55);
          ctx.quadraticCurveTo(point.x + w * 0.35, point.y - h * 1.05, point.x + w, point.y + h * 0.15);
          ctx.lineTo(point.x - w, point.y + h * 0.2);
          ctx.fill();
        } else {
          ctx.strokeStyle = depthT > 0.55 ? "#0a2832" : "#0d4654";
          ctx.lineWidth = Math.max(4, 10 * camera.zoom);
          for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            const sway = Math.sin(time * 0.6 + item.phase + i) * 12 * camera.zoom;
            ctx.moveTo(point.x + i * 14 * camera.zoom, point.y + h * 0.3);
            ctx.quadraticCurveTo(
              point.x + i * 14 * camera.zoom + sway,
              point.y - h * 0.2,
              point.x + i * 10 * camera.zoom + sway * 1.2,
              point.y - h,
            );
            ctx.stroke();
          }
        }
      }
    }
    ctx.restore();
  }

  drawNearLayer(ctx, camera, time, halfW, halfH, depthT, viewHeight) {
    for (const item of this.nearDecor) {
      if (!this.#nearCamera(camera, item.x, item.y, halfW, halfH)) continue;
      const scale = item.scale * camera.zoom;
      for (const point of camera.getVisibleWrappedScreens(item.x, item.y, 90 * item.scale)) {
        const shade = this.#entityShade(depthT, point.y, viewHeight);
        ctx.save();
        ctx.globalAlpha = shade;
        if (item.type === "grass") this.drawGrass(ctx, point.x, point.y, scale, time + item.phase);
        else if (item.type === "anemone") this.drawAnemone(ctx, point.x, point.y, scale, time + item.phase);
        else this.drawPebble(ctx, point.x, point.y, scale);
        ctx.restore();
      }
    }
  }

  drawSunbeams(ctx, camera, time, depthT, dayNight = null) {
    const L = CONFIG.lighting;
    const strength = lerp(L.sunbeamSurface, L.sunbeamAbyss, depthT) * (dayNight?.beamScale ?? 1);
    if (strength < 0.01) return;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const width = camera.viewportWidth;
    const height = camera.viewportHeight;
    const beams = depthT > 0.7 ? 3 : 7;
    for (let index = 0; index < beams; index++) {
      const phase = index * 173 + time * (1.6 + index * 0.12) - camera.x * 0.02;
      const topX = ((phase % (width + 360)) + width + 360) % (width + 360) - 180;
      const beamWidth = 28 + (index % 3) * 16;
      // Beams fade before reaching bottom when deep
      const reach = height * lerp(0.95, 0.45, depthT);
      const gradient = ctx.createLinearGradient(0, 0, 0, reach);
      gradient.addColorStop(0, `rgba(230, 255, 220, ${strength * (0.9 + (index % 2) * 0.2)})`);
      gradient.addColorStop(0.45, `rgba(170, 245, 216, ${strength * 0.35})`);
      gradient.addColorStop(1, "rgba(120, 220, 205, 0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(topX, 0);
      ctx.lineTo(topX + beamWidth, 0);
      ctx.lineTo(topX + beamWidth * 3.2 + 80, reach);
      ctx.lineTo(topX + beamWidth * 1.1 + 16, reach);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  drawDayNightOverlay(ctx, width, height, dayNight) {
    if (!dayNight) return;
    const tuning = CONFIG.dayNight;
    if (dayNight.warmStrength > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = dayNight.warmStrength * tuning.warmTintAlpha;
      ctx.fillStyle = dayNight.dawnStrength > dayNight.duskStrength
        ? tuning.dawnColor
        : tuning.duskColor;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
    if (dayNight.nightStrength > 0.01) {
      ctx.save();
      ctx.globalAlpha = dayNight.nightStrength * tuning.nightDarkenAlpha;
      ctx.fillStyle = tuning.nightColor;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
  }

  drawCaustics(ctx, camera, time, depthT) {
    const L = CONFIG.lighting;
    const alpha = lerp(L.causticSurface, L.causticAbyss, depthT);
    if (alpha < 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = depthT < 0.4 ? "#d8fff0" : "#7ab8b0";
    ctx.lineWidth = 1.6;
    const spacing = 110 + depthT * 40;
    const offsetX = ((-camera.x * camera.zoom * 0.2 + time * (5 + (1 - depthT) * 3)) % spacing) - spacing;
    const offsetY = ((-camera.y * camera.zoom * 0.14 + time * 2.2) % spacing) - spacing;
    for (let y = offsetY; y < camera.viewportHeight + spacing; y += spacing) {
      for (let x = offsetX; x < camera.viewportWidth + spacing; x += spacing) {
        const wobble = Math.sin(time * 1.5 + x * 0.02 + y * 0.015) * 6;
        ctx.beginPath();
        ctx.moveTo(x, y + 18 + wobble);
        ctx.quadraticCurveTo(x + 34, y - 10 - wobble, x + 72, y + 16);
        ctx.quadraticCurveTo(x + 98, y + 32 + wobble, x + 124, y + 6);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawEnvironment(ctx, camera, time, items, layer = "ground", quality = "auto") {
    for (const item of items) {
      if (!item.active) continue;
      const foreground = item.type === "seaweed";
      if ((layer === "foreground") !== foreground) continue;
      const screens = camera.getVisibleWrappedScreens(item.x, item.y, item.radius * 1.5);
      for (const point of screens) {
        if (item.type === "seaweed") {
          this.drawSeaweedPatch(ctx, point.x, point.y, item.radius * camera.zoom, time + item.phase, quality);
        } else if (item.type === "trash") {
          this.drawTrash(ctx, point.x, point.y, item.radius * camera.zoom, time + item.phase, item.kind);
        } else if (item.type === "shell") {
          this.drawShell(ctx, point.x, point.y, item.radius * camera.zoom, time + item.phase, item.rare);
        }
      }
    }
  }

  drawSeaweedPatch(ctx, x, y, radius, time, quality) {
    const blades = quality === "low" ? 3 : 5;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y + radius * 0.35));
    ctx.globalAlpha = 0.82;
    for (let index = 0; index < blades; index++) {
      const offset = (index / Math.max(1, blades - 1) - 0.5) * radius * 1.25;
      const height = radius * (0.85 + (index % 3) * 0.18);
      const sway = Math.sin(time * 1.25 + index * 0.8) * radius * 0.16;
      ctx.strokeStyle = index % 2 ? "#24795f" : "#3aa572";
      ctx.lineWidth = Math.max(3, radius * 0.12);
      ctx.beginPath();
      ctx.moveTo(offset, 0);
      ctx.quadraticCurveTo(offset - sway * 0.35, -height * 0.55, offset + sway, -height);
      ctx.stroke();
      ctx.fillStyle = "rgba(117, 207, 132, 0.45)";
      ctx.fillRect(Math.round(offset + sway - 2), Math.round(-height - 2), 4, 4);
    }
    ctx.restore();
  }

  drawTrash(ctx, x, y, radius, time, kind) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.rotate(Math.sin(time * 0.8) * 0.12);
    ctx.globalAlpha = 0.78;
    if (kind === "bag") {
      ctx.fillStyle = "#9ebbb4";
      ctx.strokeStyle = "#42636a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-radius * 0.55, -radius * 0.45);
      ctx.lineTo(radius * 0.5, -radius * 0.35);
      ctx.lineTo(radius * 0.4, radius * 0.55);
      ctx.lineTo(-radius * 0.45, radius * 0.45);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeRect(-radius * 0.28, -radius * 0.65, radius * 0.2, radius * 0.3);
      ctx.strokeRect(radius * 0.08, -radius * 0.62, radius * 0.2, radius * 0.28);
    } else {
      ctx.fillStyle = "#788e91";
      ctx.fillRect(-radius * 0.7, -radius * 0.2, radius * 1.4, radius * 0.45);
      ctx.fillStyle = "#b9c6b8";
      ctx.fillRect(-radius * 0.35, -radius * 0.42, radius * 0.5, radius * 0.25);
    }
    ctx.restore();
  }

  drawShell(ctx, x, y, radius, time, rare) {
    const bob = Math.sin(time * 1.6) * 2;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y + bob));
    ctx.shadowColor = rare ? "#ffe37a" : "#d9c8ff";
    ctx.shadowBlur = rare ? 12 : 5;
    ctx.fillStyle = rare ? "#ffd45c" : "#c9a9d8";
    ctx.strokeStyle = rare ? "#fff0a0" : "#f0dcf5";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.72, Math.PI, Math.PI * 2);
    ctx.lineTo(radius * 0.72, radius * 0.35);
    ctx.lineTo(-radius * 0.72, radius * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#fff8d2";
    ctx.beginPath();
    ctx.arc(0, -radius * 0.05, radius * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawCoral(ctx, x, y, scale, colorIndex, alpha = 1) {
    const palettes = [
      ["#ff7f78", "#b24a6a", "#ffb39a"],
      ["#ffca57", "#da6d47", "#ffe29a"],
      ["#c08be0", "#6d56a8", "#efc8ff"],
      ["#61d2ad", "#1a8a82", "#a8f0d4"],
    ];
    const [light, dark, tip] = palettes[colorIndex % palettes.length];
    const outline = "#14252f";
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(Math.round(x), Math.round(y));
    ctx.scale(scale, scale);
    ctx.fillStyle = outline;
    ctx.fillRect(-19, -7, 38, 12);
    ctx.fillRect(-5, -39, 10, 36);
    ctx.fillRect(-18, -29, 10, 28);
    ctx.fillRect(9, -25, 10, 24);
    ctx.fillRect(-27, -19, 10, 18);
    ctx.fillRect(19, -35, 9, 32);
    ctx.fillStyle = dark;
    ctx.fillRect(-18, -6, 36, 10);
    ctx.fillStyle = light;
    ctx.fillRect(-4, -38, 8, 34);
    ctx.fillRect(-17, -28, 8, 26);
    ctx.fillRect(10, -24, 8, 22);
    ctx.fillRect(-26, -18, 8, 16);
    ctx.fillRect(20, -34, 7, 30);
    ctx.fillStyle = tip;
    ctx.fillRect(-13, -34, 14, 5);
    ctx.fillRect(14, -27, 12, 5);
    ctx.fillRect(-24, -21, 12, 5);
    ctx.fillRect(2, -40, 6, 4);
    ctx.fillStyle = "#ffffff";
    ctx.globalAlpha = alpha * 0.35;
    ctx.fillRect(-3, -36, 2, 2);
    ctx.fillRect(12, -20, 2, 2);
    ctx.restore();
  }

  drawGrass(ctx, x, y, scale, time) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.scale(scale, scale);
    for (let i = -2; i <= 2; i++) {
      const sway = Math.round(Math.sin(time * 1.8 + i * 0.7) * 3);
      ctx.fillStyle = "#14252f";
      this.#pixelBlade(ctx, i * 6, 0, sway, -44 - Math.abs(i) * 3, 5);
      ctx.fillStyle = i % 2 === 0 ? "#3eaf78" : "#62d090";
      this.#pixelBlade(ctx, i * 6, 0, sway, -42 - Math.abs(i) * 3, 3);
      ctx.fillStyle = "#9af0c0";
      this.#pixelBlade(ctx, i * 6, -8, sway, -36 - Math.abs(i) * 2, 2);
    }
    ctx.restore();
  }

  #pixelBlade(ctx, x0, y0, sway, yTop, width) {
    const steps = 6;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const y = y0 + (yTop - y0) * t;
      const x = x0 + sway * t * t;
      const w = Math.max(1, Math.round(width * (1 - t * 0.7)));
      ctx.fillRect(Math.round(x - w / 2), Math.round(y), w, 3);
    }
  }

  drawAnemone(ctx, x, y, scale, time) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.scale(scale, scale);
    ctx.fillStyle = "#14252f";
    ctx.fillRect(-7, -5, 14, 10);
    ctx.fillStyle = "#7b4f8c";
    ctx.fillRect(-6, -4, 12, 8);
    ctx.fillStyle = "#a06ab4";
    ctx.fillRect(-4, -3, 8, 4);
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i - 2.5) * 0.35 + Math.sin(time * 2 + i) * 0.12;
      const tipX = Math.round(Math.cos(a) * 15);
      const tipY = Math.round(-26 + Math.sin(time + i) * 2);
      ctx.fillStyle = "#14252f";
      ctx.fillRect(tipX - 1, tipY, 3, 3);
      ctx.fillStyle = i % 2 ? "#ff9ec8" : "#ffc4e4";
      for (let s = 0; s < 5; s++) {
        const t = s / 4;
        ctx.fillRect(
          Math.round(tipX * t) - 1,
          Math.round(-2 + (tipY + 2) * t),
          2,
          3,
        );
      }
    }
    ctx.restore();
  }

  drawPebble(ctx, x, y, scale) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.scale(scale, scale);
    ctx.fillStyle = "#14252f";
    ctx.fillRect(-11, -5, 22, 12);
    ctx.fillStyle = "#3d5d68";
    ctx.fillRect(-10, -4, 20, 10);
    ctx.fillStyle = "#6a8a90";
    ctx.fillRect(-7, -3, 10, 5);
    ctx.fillStyle = "#9bb8b0";
    ctx.fillRect(-5, -2, 4, 2);
    ctx.restore();
  }

  drawRock(ctx, x, y, scale, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(Math.round(x), Math.round(y));
    ctx.scale(scale, scale);
    ctx.fillStyle = "#14252f";
    ctx.fillRect(-25, -13, 50, 18);
    ctx.fillRect(-17, -23, 34, 14);
    ctx.fillStyle = "#2c4c58";
    ctx.fillRect(-24, -12, 48, 16);
    ctx.fillStyle = "#4d6d76";
    ctx.fillRect(-16, -22, 32, 12);
    ctx.fillStyle = "#7a9a94";
    ctx.fillRect(-9, -27, 16, 6);
    ctx.fillStyle = "#9bb8b0";
    ctx.fillRect(-4, -29, 6, 3);
    ctx.restore();
  }
}
