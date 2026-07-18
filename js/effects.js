import { CONFIG } from "./config.js";
import { clamp, lerp } from "./math.js";

export class Effects {
  constructor() {
    this.particles = [];
    this.texts = [];
    this.rings = [];
    this.sucks = [];
    this.shake = 0;
    this.lowQuality = false;
    this.particleScale = 1;
  }

  setQuality(quality) {
    this.lowQuality = quality === "low";
    this.particleScale = this.lowQuality ? CONFIG.effects.lowQualityParticleScale : 1;
  }

  burst(x, y, color, count = 9, speed = 110, options = {}) {
    const shape = options.shape || "spark";
    const gravity = options.gravity ?? 18;
    const lifeScale = options.lifeScale ?? 1;
    const sizeScale = options.sizeScale ?? 1;
    const particleCount = Math.max(0, Math.round(count * this.particleScale));
    for (let i = 0; i < particleCount; i++) {
      const angle = Number.isFinite(options.angle)
        ? options.angle + (Math.random() - 0.5) * (options.spread ?? Math.PI * 2)
        : Math.random() * Math.PI * 2;
      const magnitude = speed * (0.35 + Math.random() * 0.65);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * magnitude,
        vy: Math.sin(angle) * magnitude,
        life: (0.28 + Math.random() * 0.42) * lifeScale,
        maxLife: 0.75 * lifeScale,
        size: (2 + Math.random() * 4.5) * sizeScale,
        color,
        shape,
        gravity,
        spin: (Math.random() - 0.5) * 10,
        angle: Math.random() * Math.PI * 2,
      });
    }
    this.#trimParticles();
  }

  /** Water-splash arc + outward foam for eats. */
  splash(x, y, color = "#9cf3d8", intensity = 1) {
    const count = Math.round(8 + intensity * 10);
    this.burst(x, y, color, count, 90 + intensity * 70, {
      shape: "drop",
      gravity: -35,
      lifeScale: 0.85 + intensity * 0.2,
    });
    this.burst(x, y, "#e8fff7", Math.round(4 + intensity * 4), 50 + intensity * 40, {
      shape: "spark",
      gravity: 10,
      lifeScale: 0.7,
    });
    this.ring(x, y, color, 12 + intensity * 10, 48 + intensity * 36, 0.28 + intensity * 0.08);
  }

  ring(x, y, color, startRadius, endRadius, life = 0.35, width = 3) {
    this.rings.push({
      x,
      y,
      color,
      startRadius,
      endRadius,
      life,
      maxLife: life,
      width,
    });
    if (this.rings.length > 40) this.rings.splice(0, this.rings.length - 40);
  }

  /** Short suck of a fish silhouette toward the predator mouth. */
  suck(options = {}) {
    this.sucks.push({
      fromX: options.fromX,
      fromY: options.fromY,
      toX: options.toX,
      toY: options.toY,
      radius: options.radius ?? 14,
      color: options.color ?? "#9cf3d8",
      angle: options.angle ?? 0,
      species: options.species ?? "silver",
      tier: options.tier ?? 1,
      life: options.duration ?? CONFIG.feel.suckDuration,
      maxLife: options.duration ?? CONFIG.feel.suckDuration,
      skin: options.skin,
      isPlayer: false,
    });
    if (this.sucks.length > 24) this.sucks.splice(0, this.sucks.length - 24);
  }

  floatText(x, y, text, color = "#ffffff", size = 16) {
    this.texts.push({
      x,
      y,
      text,
      color,
      size,
      life: 0.95,
      maxLife: 0.95,
      vy: 36 + size * 0.4,
    });
  }

  addShake(amount) {
    this.shake = Math.min(18, this.shake + amount);
  }

  update(dt) {
    for (const particle of this.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += particle.gravity * dt;
      particle.vx *= Math.exp(-3.2 * dt);
      particle.vy *= Math.exp(-2.4 * dt);
      particle.angle += particle.spin * dt;
    }
    this.particles = this.particles.filter((particle) => particle.life > 0);

    for (const ring of this.rings) {
      ring.life -= dt;
    }
    this.rings = this.rings.filter((ring) => ring.life > 0);

    for (const item of this.sucks) {
      item.life -= dt;
    }
    this.sucks = this.sucks.filter((item) => item.life > 0);

    for (const item of this.texts) {
      item.life -= dt;
      item.y -= item.vy * dt;
      item.vy *= Math.exp(-1.2 * dt);
    }
    this.texts = this.texts.filter((item) => item.life > 0);
    this.shake = lerp(this.shake, 0, 1 - Math.exp(-8.5 * dt));
  }

  getShake(enabled = true) {
    if (!enabled || this.shake < 0.05) return { x: 0, y: 0 };
    return {
      x: (Math.random() * 2 - 1) * this.shake,
      y: (Math.random() * 2 - 1) * this.shake,
    };
  }

  drawWorld(ctx, camera, sprites = null) {
    for (const ring of this.rings) {
      const t = 1 - ring.life / ring.maxLife;
      const radius = lerp(ring.startRadius, ring.endRadius, easeOutCubic(t)) * camera.zoom;
      for (const screen of camera.getVisibleWrappedScreens(ring.x, ring.y, ring.endRadius)) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, (1 - t) * 0.85);
        ctx.strokeStyle = ring.color;
        ctx.lineWidth = Math.max(1, ring.width * (1 - t * 0.55) * camera.zoom);
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, Math.max(1, radius), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    for (const item of this.sucks) {
      const t = 1 - item.life / item.maxLife;
      const ease = Math.pow(t, CONFIG.feel.suckEase > 0 ? 1 / CONFIG.feel.suckEase : 0.5);
      const x = lerp(item.fromX, item.toX, ease);
      const y = lerp(item.fromY, item.toY, ease);
      const scale = lerp(1, 0.25, ease);
      const radius = item.radius * scale * camera.zoom;
      for (const screen of camera.getVisibleWrappedScreens(x, y, item.radius * 2)) {
        if (sprites?.drawFish) {
          sprites.drawFish(ctx, {
          species: item.species,
          angle: item.angle + t * 1.2,
          tier: item.tier,
          dashing: false,
          animOffset: 0,
          }, screen, radius, {
          time: t * 3,
          alpha: 1 - t * 0.35,
          skin: item.skin,
          isPlayer: false,
          relation: null,
          });
        } else {
          ctx.save();
          ctx.globalAlpha = 1 - t * 0.4;
          ctx.fillStyle = item.color;
          ctx.beginPath();
          ctx.ellipse(screen.x, screen.y, radius * 1.4, radius * 0.75, item.angle, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    }

    for (const particle of this.particles) {
      const alpha = Math.max(0, particle.life / particle.maxLife);
      const size = Math.max(1, particle.size * camera.zoom * (0.55 + alpha * 0.55));
      for (const screen of camera.getVisibleWrappedScreens(particle.x, particle.y, particle.size * 2)) {
        ctx.save();
        ctx.translate(Math.round(screen.x), Math.round(screen.y));
        ctx.rotate(particle.angle || 0);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = particle.color;
        if (particle.shape === "drop") {
          ctx.beginPath();
          ctx.ellipse(0, 0, size * 0.45, size * 0.85, 0, 0, Math.PI * 2);
          ctx.fill();
        } else if (particle.shape === "scale") {
          ctx.beginPath();
          ctx.moveTo(0, -size);
          ctx.lineTo(size * 0.7, size * 0.4);
          ctx.lineTo(-size * 0.7, size * 0.4);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.fillRect(-Math.ceil(size / 2), -Math.ceil(size / 2), Math.ceil(size), Math.ceil(size));
        }
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const item of this.texts) {
      const t = item.life / item.maxLife;
      ctx.globalAlpha = Math.min(1, t * 2.2);
      const pop = 1 + (1 - t) * 0.18;
      ctx.font = `700 ${Math.round(item.size * pop)}px ui-monospace, monospace`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(6, 25, 35, 0.72)";
      for (const screen of camera.getVisibleWrappedScreens(item.x, item.y, item.size * 6)) {
        ctx.strokeText(item.text, screen.x, screen.y);
        ctx.fillStyle = item.color;
        ctx.fillText(item.text, screen.x, screen.y);
      }
    }
    ctx.globalAlpha = 1;
  }

  clear() {
    this.particles.length = 0;
    this.texts.length = 0;
    this.rings.length = 0;
    this.sucks.length = 0;
    this.shake = 0;
  }

  #trimParticles() {
    const budget = this.lowQuality
      ? CONFIG.effects.particleBudgetLow
      : CONFIG.effects.particleBudgetHigh;
    if (this.particles.length > budget) {
      this.particles.splice(0, this.particles.length - budget);
    }
  }
}

function easeOutCubic(t) {
  const x = clamp(t, 0, 1);
  return 1 - (1 - x) ** 3;
}
