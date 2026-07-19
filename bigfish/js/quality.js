export class AutoQualityController {
  constructor({ maxDpr = 2, minDpr = 1.25, step = 0.25 } = {}) {
    this.maxDpr = maxDpr;
    this.minDpr = minDpr;
    this.step = step;
    this.reset();
  }

  reset() {
    this.dprCap = this.maxDpr;
    this.lowFpsSeconds = 0;
    this.highFpsSeconds = 0;
    this.cooldown = 0;
  }

  update(dt, fps, active) {
    if (!active || !Number.isFinite(fps)) {
      this.lowFpsSeconds = 0;
      this.highFpsSeconds = 0;
      return null;
    }

    const elapsed = Math.max(0, Math.min(0.1, dt));
    this.cooldown = Math.max(0, this.cooldown - elapsed);
    this.lowFpsSeconds = fps < 48
      ? this.lowFpsSeconds + elapsed
      : Math.max(0, this.lowFpsSeconds - elapsed * 1.5);
    this.highFpsSeconds = fps > 57
      ? this.highFpsSeconds + elapsed
      : 0;

    if (this.cooldown <= 0 && this.lowFpsSeconds >= 4 && this.dprCap > this.minDpr) {
      this.dprCap = Math.max(this.minDpr, this.dprCap - this.step);
      this.lowFpsSeconds = 0;
      this.highFpsSeconds = 0;
      this.cooldown = 6;
      return { direction: "down", dprCap: this.dprCap };
    }

    if (this.cooldown <= 0 && this.highFpsSeconds >= 18 && this.dprCap < this.maxDpr) {
      this.dprCap = Math.min(this.maxDpr, this.dprCap + this.step);
      this.lowFpsSeconds = 0;
      this.highFpsSeconds = 0;
      this.cooldown = 12;
      return { direction: "up", dprCap: this.dprCap };
    }

    return null;
  }
}
