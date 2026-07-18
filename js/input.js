import { CONFIG } from "./config.js";
import { clamp, normalize, wrapDelta } from "./math.js";

export function getWorldTargetDelta(camera, player, target) {
  if (camera?.wrap) {
    return {
      x: wrapDelta(target.x, player.x, camera.worldWidth),
      y: wrapDelta(target.y, player.y, camera.worldHeight),
    };
  }
  return { x: target.x - player.x, y: target.y - player.y };
}

export class InputController {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.dashButton = options.dashButton || null;
    this.cameraProvider = options.cameraProvider || (() => null);
    this.playerProvider = options.playerProvider || (() => null);
    this.touchModeProvider = options.touchModeProvider || (() => "relative");
    this.enabledProvider = options.enabledProvider || (() => true);

    this.pointer = null;
    this.mouse = { x: 0, y: 0, seen: false };
    this.keys = new Set();
    this.dashSources = new Set();
    this.pauseQueued = false;
    this.relativeRadius = CONFIG.input.relativeRadius;

    this.bindEvents();
  }

  bindEvents() {
    this.canvas.addEventListener("pointerdown", (event) => this.onPointerDown(event));
    this.canvas.addEventListener("pointermove", (event) => this.onPointerMove(event));
    this.canvas.addEventListener("pointerup", (event) => this.onPointerUp(event));
    this.canvas.addEventListener("pointercancel", (event) => this.onPointerUp(event));
    this.canvas.addEventListener("contextmenu", (event) => event.preventDefault());

    window.addEventListener("keydown", (event) => {
      if (!this.enabledProvider() || isFormControl(event.target)) return;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
        event.preventDefault();
      }
      this.keys.add(event.code);
      if (event.code === "Space") this.dashSources.add("keyboard");
      if ((event.code === "Escape" || event.code === "KeyP") && !event.repeat) {
        this.pauseQueued = true;
      }
    }, { passive: false });

    window.addEventListener("keyup", (event) => {
      this.keys.delete(event.code);
      if (event.code === "Space") this.dashSources.delete("keyboard");
    });
    window.addEventListener("pointerup", (event) => this.onPointerUp(event));
    window.addEventListener("pointercancel", (event) => this.onPointerUp(event));

    window.addEventListener("blur", () => this.reset());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.reset();
    });

    if (this.dashButton) {
      const startDash = (event) => {
        event.preventDefault();
        this.dashSources.add(`button-${event.pointerId}`);
        this.dashButton.setPointerCapture?.(event.pointerId);
      };
      const stopDash = (event) => {
        event.preventDefault();
        this.dashSources.delete(`button-${event.pointerId}`);
      };
      this.dashButton.addEventListener("pointerdown", startDash, { passive: false });
      this.dashButton.addEventListener("pointerup", stopDash, { passive: false });
      this.dashButton.addEventListener("pointercancel", stopDash, { passive: false });
      this.dashButton.addEventListener("lostpointercapture", stopDash, { passive: false });
    }
  }

  canvasPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  onPointerDown(event) {
    const point = this.canvasPoint(event);
    if (event.pointerType === "mouse") {
      this.mouse = { ...point, seen: true };
      if (event.button === 2) {
        this.dashSources.add("mouse-right");
        this.canvas.setPointerCapture?.(event.pointerId);
      }
      return;
    }

    if (this.pointer) return;
    event.preventDefault();
    this.canvas.setPointerCapture?.(event.pointerId);
    this.pointer = {
      id: event.pointerId,
      startX: point.x,
      startY: point.y,
      x: point.x,
      y: point.y,
    };
  }

  onPointerMove(event) {
    const point = this.canvasPoint(event);
    if (event.pointerType === "mouse") {
      this.mouse = { ...point, seen: true };
      return;
    }
    if (!this.pointer || this.pointer.id !== event.pointerId) return;
    event.preventDefault();
    this.pointer.x = point.x;
    this.pointer.y = point.y;
  }

  onPointerUp(event) {
    if (event.pointerType === "mouse") {
      if (event.button === 2) this.dashSources.delete("mouse-right");
      return;
    }
    if (this.pointer?.id === event.pointerId) this.pointer = null;
  }

  sample() {
    let moveX = 0;
    let moveY = 0;
    let moveStrength = 0;
    let inputMode = "idle";

    const keyX = Number(this.keys.has("KeyD") || this.keys.has("ArrowRight"))
      - Number(this.keys.has("KeyA") || this.keys.has("ArrowLeft"));
    const keyY = Number(this.keys.has("KeyS") || this.keys.has("ArrowDown"))
      - Number(this.keys.has("KeyW") || this.keys.has("ArrowUp"));

    if (keyX || keyY) {
      const direction = normalize(keyX, keyY);
      moveX = direction.x;
      moveY = direction.y;
      moveStrength = 1;
      inputMode = "keyboard";
    } else if (this.pointer) {
      const mode = this.touchModeProvider();
      if (mode === "absolute" || mode === "point") {
        ({ moveX, moveY, moveStrength } = this.absoluteVector(this.pointer.x, this.pointer.y));
        inputMode = "touch-absolute";
      } else {
        const dx = this.pointer.x - this.pointer.startX;
        const dy = this.pointer.y - this.pointer.startY;
        const length = Math.hypot(dx, dy);
        const deadzone = CONFIG.input.relativeDeadzone;
        if (length > deadzone) {
          moveX = dx / length;
          moveY = dy / length;
          const raw = clamp((length - deadzone) / Math.max(1, this.relativeRadius - deadzone), 0, 1);
          moveStrength = Math.pow(raw, CONFIG.input.relativeExponent);
        }
        inputMode = "touch-relative";
      }
    } else if (this.mouse.seen) {
      ({ moveX, moveY, moveStrength } = this.absoluteVector(this.mouse.x, this.mouse.y));
      inputMode = "mouse";
    }

    return {
      moveX,
      moveY,
      moveStrength,
      dashHeld: this.dashSources.size > 0,
      inputMode,
    };
  }

  absoluteVector(screenX, screenY) {
    const camera = this.cameraProvider();
    const player = this.playerProvider();
    if (!camera || !player) return { moveX: 0, moveY: 0, moveStrength: 0 };
    const target = camera.screenToWorld(screenX, screenY);
    const { x: dx, y: dy } = getWorldTargetDelta(camera, player, target);
    const length = Math.hypot(dx, dy);
    const deadzone = CONFIG.input.absoluteDeadzone;
    if (length < deadzone) return { moveX: 0, moveY: 0, moveStrength: 0 };

    const full = CONFIG.input.absoluteFullDistance;
    const raw = clamp((length - deadzone) / Math.max(1, full - deadzone), 0, 1);
    let strength = CONFIG.input.absoluteMinStrength
      + (1 - CONFIG.input.absoluteMinStrength) * Math.pow(raw, CONFIG.input.absoluteExponent);

    // Soft near-distance curve so pointer orbiting the fish does not full-throttle.
    const near = CONFIG.input.nearSlowRadius;
    if (length < near) {
      const nearT = clamp((length - deadzone) / Math.max(1, near - deadzone), 0, 1);
      const nearStrength = CONFIG.input.nearSlowFloor
        + (1 - CONFIG.input.nearSlowFloor) * Math.pow(nearT, 1.15);
      strength = Math.min(strength, nearStrength);
    }

    return {
      moveX: dx / length,
      moveY: dy / length,
      moveStrength: clamp(strength, 0, 1),
    };
  }

  consumePause() {
    const queued = this.pauseQueued;
    this.pauseQueued = false;
    return queued;
  }

  reset() {
    this.pointer = null;
    this.mouse.seen = false;
    this.keys.clear();
    this.dashSources.clear();
  }

  drawTouchGuide(ctx) {
    if (!this.pointer || ["absolute", "point"].includes(this.touchModeProvider())) return;
    const dx = this.pointer.x - this.pointer.startX;
    const dy = this.pointer.y - this.pointer.startY;
    const length = Math.hypot(dx, dy);
    const scale = length > this.relativeRadius ? this.relativeRadius / length : 1;
    const knobX = this.pointer.startX + dx * scale;
    const knobY = this.pointer.startY + dy * scale;
    ctx.save();
    ctx.globalAlpha = 0.58;
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#d9fff5";
    ctx.fillStyle = "rgba(7, 30, 45, 0.42)";
    ctx.beginPath();
    ctx.arc(this.pointer.startX, this.pointer.startY, this.relativeRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Inner deadzone ring
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    ctx.arc(this.pointer.startX, this.pointer.startY, CONFIG.input.relativeDeadzone + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.78;
    ctx.fillStyle = "rgba(117, 255, 215, 0.78)";
    ctx.beginPath();
    ctx.arc(knobX, knobY, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#effff9";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
}

function isFormControl(target) {
  return target instanceof Element
    && Boolean(target.closest("input, select, textarea, button, [contenteditable='true']"));
}
