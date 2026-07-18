import { CONFIG } from "./config.js";
import { clamp, damp, wrap, wrapDelta } from "./math.js";

/**
 * CSS-pixel camera for a world that may be bounded or toroidal (wrap).
 * All methods consume and return CSS-pixel coordinates.
 */
export class Camera {
  constructor(options = {}) {
    this.worldWidth = finitePositive(options.worldWidth, CONFIG.world.width);
    this.worldHeight = finitePositive(options.worldHeight, CONFIG.world.height);
    this.wrap = options.wrap ?? CONFIG.world.wrap ?? false;
    this.width = finitePositive(options.width, CONFIG.viewport.referenceWidth);
    this.height = finitePositive(options.height, CONFIG.viewport.referenceHeight);
    this.minZoom = finitePositive(options.minZoom, CONFIG.camera.minZoom);
    this.maxZoom = Math.max(
      this.minZoom,
      finitePositive(options.maxZoom, CONFIG.camera.maxZoom),
    );
    this.zoom = clamp(
      finitePositive(options.zoom, this.maxZoom),
      this.minZoom,
      this.maxZoom,
    );
    this.x = finiteNumber(options.x, this.worldWidth / 2);
    this.y = finiteNumber(options.y, this.worldHeight / 2);
    this.target = null;
    this.targetZoom = this.zoom;
    this.followResponsiveness = finitePositive(
      options.followResponsiveness,
      CONFIG.camera.followResponsiveness,
    );
    this.zoomResponsiveness = finitePositive(
      options.zoomResponsiveness,
      CONFIG.camera.zoomResponsiveness,
    );
    this.lookAheadSeconds = finiteNumber(
      options.lookAheadSeconds,
      CONFIG.camera.lookAheadSeconds,
    );
    this.maxLookAhead = finitePositive(
      options.maxLookAhead,
      CONFIG.camera.maxLookAhead,
    );
    this.mode = "normal";
    this.modeZoomBias = 0;
    this.punch = 0;
    this.punchTarget = 0;
    this.#applyMode("normal", true);
    this.#constrainToWorld();
  }

  get viewportWidth() {
    return this.width;
  }

  get viewportHeight() {
    return this.height;
  }

  /** 0 at surface (top of map), 1 at abyss (bottom). */
  get depthT() {
    if (!(this.worldHeight > 0)) return 0.5;
    if (this.wrap) {
      const phase = wrap(this.y, this.worldHeight) / this.worldHeight * Math.PI * 2;
      return 0.5 - Math.cos(phase) * 0.5;
    }
    return clamp(this.y / this.worldHeight, 0, 1);
  }

  resize(cssWidth, cssHeight) {
    this.width = finitePositive(cssWidth, this.width);
    this.height = finitePositive(cssHeight, this.height);
    this.#constrainToWorld();
    return this;
  }

  setTarget(target, options = {}) {
    this.target = target && Number.isFinite(target.x) && Number.isFinite(target.y)
      ? target
      : null;

    if (Number.isFinite(options.zoom)) {
      this.targetZoom = clamp(options.zoom, this.minZoom, this.maxZoom);
    } else if (this.target) {
      this.#refreshMassZoom(options.displayMass);
    }
    return this;
  }

  setMode(mode = "normal") {
    const next = CONFIG.camera.modes[mode] ? mode : "normal";
    if (next === this.mode) return this;
    this.#applyMode(next, false);
    return this;
  }

  punchZoom(amount = 0.05) {
    if (!Number.isFinite(amount) || amount === 0) return this;
    this.punchTarget = clamp(this.punchTarget + amount, -0.22, 0.28);
    this.punch = clamp(this.punch + amount * 0.85, -0.22, 0.28);
    return this;
  }

  update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return this;

    this.punch = damp(this.punch, this.punchTarget, CONFIG.feel.punchDecay, dt);
    this.punchTarget = damp(this.punchTarget, 0, CONFIG.feel.punchDecay * 0.65, dt);

    if (this.target) {
      this.#refreshMassZoom();
    }

    const zoomGoal = clamp(
      this.targetZoom * (1 + this.modeZoomBias) * (1 + this.punch),
      this.minZoom * 0.92,
      this.maxZoom * 1.08,
    );

    this.zoom = damp(
      this.zoom,
      zoomGoal,
      this.zoomResponsiveness,
      dt,
    );
    this.zoom = clamp(this.zoom, this.minZoom * 0.9, this.maxZoom * 1.12);

    if (this.target) {
      const velocity = readVelocity(this.target);
      const rawLookX = velocity.x * this.lookAheadSeconds;
      const rawLookY = velocity.y * this.lookAheadSeconds;
      const rawLength = Math.hypot(rawLookX, rawLookY);
      const lookScale = rawLength > this.maxLookAhead
        ? this.maxLookAhead / rawLength
        : 1;
      const desiredX = this.target.x + rawLookX * lookScale;
      const desiredY = this.target.y + rawLookY * lookScale;

      if (this.wrap) {
        const dx = wrapDelta(desiredX, this.x, this.worldWidth);
        const dy = wrapDelta(desiredY, this.y, this.worldHeight);
        const blend = 1 - Math.exp(-this.followResponsiveness * dt);
        this.x = wrap(this.x + dx * blend, this.worldWidth);
        this.y = wrap(this.y + dy * blend, this.worldHeight);
      } else {
        this.x = damp(this.x, desiredX, this.followResponsiveness, dt);
        this.y = damp(this.y, desiredY, this.followResponsiveness, dt);
      }
    }

    this.#constrainToWorld();
    return this;
  }

  /**
   * Maps a world point to screen using the nearest toroidal image when wrap is on.
   */
  worldToScreen(xOrPoint, y) {
    const point = readPoint(xOrPoint, y);
    let dx = point.x - this.x;
    let dy = point.y - this.y;
    if (this.wrap) {
      dx = wrapDelta(point.x, this.x, this.worldWidth);
      dy = wrapDelta(point.y, this.y, this.worldHeight);
    }
    return {
      x: dx * this.zoom + this.width / 2,
      y: dy * this.zoom + this.height / 2,
    };
  }

  /** All toroidal images of a point that intersect the viewport. */
  getVisibleWrappedScreens(xOrPoint, yOrRadius, radius = 0) {
    let x;
    let y;
    let worldRadius;
    if (typeof xOrPoint === "object") {
      x = xOrPoint.x;
      y = xOrPoint.y;
      worldRadius = finiteNumber(yOrRadius, xOrPoint.radius ?? xOrPoint.r ?? 0);
    } else {
      x = xOrPoint;
      y = yOrRadius;
      worldRadius = finiteNumber(radius, 0);
    }

    const base = this.worldToScreen(x, y);
    const margin = Math.max(0, worldRadius) * this.zoom;
    if (!this.wrap) {
      return base.x >= -margin && base.x <= this.width + margin
        && base.y >= -margin && base.y <= this.height + margin
        ? [base]
        : [];
    }

    const periodX = this.worldWidth * this.zoom;
    const periodY = this.worldHeight * this.zoom;
    const minX = Math.ceil((-margin - base.x) / periodX);
    const maxX = Math.floor((this.width + margin - base.x) / periodX);
    const minY = Math.ceil((-margin - base.y) / periodY);
    const maxY = Math.floor((this.height + margin - base.y) / periodY);
    const screens = [];
    for (let iy = minY; iy <= maxY; iy++) {
      for (let ix = minX; ix <= maxX; ix++) {
        screens.push({ x: base.x + ix * periodX, y: base.y + iy * periodY });
      }
    }
    return screens;
  }

  screenToWorld(xOrPoint, y) {
    const point = readPoint(xOrPoint, y);
    let x = (point.x - this.width / 2) / this.zoom + this.x;
    let yPos = (point.y - this.height / 2) / this.zoom + this.y;
    if (this.wrap) {
      x = wrap(x, this.worldWidth);
      yPos = wrap(yPos, this.worldHeight);
    }
    return { x, y: yPos };
  }

  getVisibleWorldBounds(padding = 0) {
    const worldPadding = finiteNumber(padding, 0);
    const halfWidth = this.width / (2 * this.zoom) + worldPadding;
    const halfHeight = this.height / (2 * this.zoom) + worldPadding;
    // When wrapping, bounds may extend outside [0, world] — callers should use wrap tests.
    return {
      left: this.x - halfWidth,
      top: this.y - halfHeight,
      right: this.x + halfWidth,
      bottom: this.y + halfHeight,
      width: halfWidth * 2,
      height: halfHeight * 2,
    };
  }

  isWorldPointVisible(xOrPoint, yOrRadius, radius = 0) {
    let x;
    let y;
    let testRadius;
    if (typeof xOrPoint === "object") {
      x = xOrPoint.x;
      y = xOrPoint.y;
      testRadius = finiteNumber(yOrRadius, xOrPoint.radius ?? xOrPoint.r ?? 0);
    } else {
      x = xOrPoint;
      y = yOrRadius;
      testRadius = finiteNumber(radius, 0);
    }

    if (this.wrap) {
      const dx = Math.abs(wrapDelta(x, this.x, this.worldWidth));
      const dy = Math.abs(wrapDelta(y, this.y, this.worldHeight));
      const halfWidth = this.width / (2 * this.zoom) + testRadius;
      const halfHeight = this.height / (2 * this.zoom) + testRadius;
      return dx <= halfWidth && dy <= halfHeight;
    }

    const bounds = this.getVisibleWorldBounds();
    return x + testRadius >= bounds.left
      && x - testRadius <= bounds.right
      && y + testRadius >= bounds.top
      && y - testRadius <= bounds.bottom;
  }

  /** Shortest vector from this camera focus toward a world point. */
  offsetTo(x, y) {
    if (this.wrap) {
      return {
        x: wrapDelta(x, this.x, this.worldWidth),
        y: wrapDelta(y, this.y, this.worldHeight),
      };
    }
    return { x: x - this.x, y: y - this.y };
  }

  #applyMode(mode, instant) {
    const profile = CONFIG.camera.modes[mode] || CONFIG.camera.modes.normal;
    this.mode = mode;
    this.modeZoomBias = finiteNumber(profile.zoomBias, 0);
    const follow = finitePositive(profile.follow, CONFIG.camera.followResponsiveness);
    const zoom = finitePositive(profile.zoom, CONFIG.camera.zoomResponsiveness);
    const lookAhead = finiteNumber(profile.lookAhead, CONFIG.camera.lookAheadSeconds);
    const maxLook = finitePositive(profile.maxLookAhead, CONFIG.camera.maxLookAhead);
    this.followResponsiveness = follow;
    this.zoomResponsiveness = zoom;
    this.lookAheadSeconds = lookAhead;
    this.maxLookAhead = maxLook;
    void instant;
  }

  #refreshMassZoom(displayMassOverride) {
    if (!this.target) return;
    const displayMass = finitePositive(
      displayMassOverride ?? this.target.displayMass ?? this.target.mass,
      CONFIG.mass.start,
    );
    this.targetZoom = clamp(
      1 / Math.pow(displayMass / CONFIG.mass.start, CONFIG.camera.massZoomExponent),
      this.minZoom,
      this.maxZoom,
    );
  }

  #constrainToWorld() {
    if (this.wrap) {
      this.x = wrap(this.x, this.worldWidth);
      this.y = wrap(this.y, this.worldHeight);
      return;
    }
    const halfWidth = this.width / (2 * this.zoom);
    const halfHeight = this.height / (2 * this.zoom);
    this.x = halfWidth * 2 >= this.worldWidth
      ? this.worldWidth / 2
      : clamp(this.x, halfWidth, this.worldWidth - halfWidth);
    this.y = halfHeight * 2 >= this.worldHeight
      ? this.worldHeight / 2
      : clamp(this.y, halfHeight, this.worldHeight - halfHeight);
  }
}

function readPoint(xOrPoint, y) {
  return typeof xOrPoint === "object"
    ? { x: xOrPoint.x, y: xOrPoint.y }
    : { x: xOrPoint, y };
}

function readVelocity(target) {
  return {
    x: finiteNumber(target.vx ?? target.velocity?.x, 0),
    y: finiteNumber(target.vy ?? target.velocity?.y, 0),
  };
}

function finiteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function finitePositive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
