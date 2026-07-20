/**
 * 程序化音效:全部由 WebAudio 现场合成,零资源文件。
 * AudioContext 懒创建;浏览器在用户手势前保持 suspended 时排队到恢复后播放,
 * 同类音效有最小间隔,3× 速度下不会连成噪音。
 */

const MIN_GAP_MS = 45;
const MASTER_VOLUME = 1;

export class GameAudio {
  constructor() {
    this.enabled = true;
    this.context = null;
    this.lastPlayed = new Map();
    this.pendingTypes = new Set();
  }

  setEnabled(enabled) {
    this.enabled = enabled === true;
  }

  ensureContext() {
    if (this.context) return this.context;
    const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctor) return null;
    try {
      this.context = new Ctor();
    } catch {
      return null;
    }
    return this.context;
  }

  play(type) {
    if (!this.enabled) return;
    const now = globalThis.performance?.now?.() ?? Date.now();
    const last = this.lastPlayed.get(type) ?? -Infinity;
    if (now - last < MIN_GAP_MS) return;
    this.lastPlayed.set(type, now);
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      if (this.pendingTypes.has(type)) return;
      this.pendingTypes.add(type);
      Promise.resolve(ctx.resume?.())
        .then(() => {
          this.pendingTypes.delete(type);
          if (this.enabled && ctx.state !== "suspended") this.playNow(type, ctx);
        })
        .catch(() => this.pendingTypes.delete(type));
      return;
    }
    this.playNow(type, ctx);
  }

  playNow(type, ctx) {
    const t = ctx.currentTime + 0.01;
    try {
      switch (type) {
        case "hit":
          this.noise(ctx, t, 0.05, 0.05);
          this.tone(ctx, { time: t, freq: 170, freqEnd: 95, duration: 0.08, type: "square", volume: 0.05 });
          break;
        case "crit":
          this.noise(ctx, t, 0.06, 0.07);
          this.tone(ctx, { time: t, freq: 660, freqEnd: 210, duration: 0.14, type: "triangle", volume: 0.1 });
          break;
        case "dodge":
          this.tone(ctx, { time: t, freq: 1250, freqEnd: 1850, duration: 0.06, type: "sine", volume: 0.035 });
          break;
        case "heal":
          this.tone(ctx, { time: t, freq: 520, freqEnd: 780, duration: 0.16, type: "sine", volume: 0.06 });
          break;
        case "buff":
          this.tone(ctx, { time: t, freq: 330, freqEnd: 495, duration: 0.14, type: "triangle", volume: 0.06 });
          break;
        case "burn":
          this.tone(ctx, { time: t, freq: 230, freqEnd: 140, duration: 0.12, type: "sawtooth", volume: 0.035 });
          break;
        case "loot":
          this.tone(ctx, { time: t, freq: 880, duration: 0.09, type: "sine", volume: 0.07 });
          this.tone(ctx, { time: t + 0.08, freq: 1318, duration: 0.12, type: "sine", volume: 0.07 });
          break;
        case "coin":
          this.tone(ctx, { time: t, freq: 1180, freqEnd: 1420, duration: 0.07, type: "triangle", volume: 0.06 });
          break;
        case "victory":
          this.tone(ctx, { time: t, freq: 523, duration: 0.12, type: "triangle", volume: 0.08 });
          this.tone(ctx, { time: t + 0.11, freq: 659, duration: 0.12, type: "triangle", volume: 0.08 });
          this.tone(ctx, { time: t + 0.22, freq: 784, duration: 0.2, type: "triangle", volume: 0.08 });
          break;
        case "defeat":
          this.tone(ctx, { time: t, freq: 220, freqEnd: 104, duration: 0.45, type: "sawtooth", volume: 0.07 });
          break;
        case "levelup":
          for (const [index, freq] of [523, 659, 784, 1046].entries()) {
            this.tone(ctx, { time: t + index * 0.09, freq, duration: 0.14, type: "triangle", volume: 0.07 });
          }
          break;
        default:
          break;
      }
    } catch {
      // 音效永远不允许影响游戏流程。
    }
  }

  tone(ctx, { time, freq, freqEnd = 0, duration, type = "sine", volume = 0.08 }) {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(1, freq), time);
    if (freqEnd > 0) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), time + duration);
    }
    gain.gain.setValueAtTime(volume * MASTER_VOLUME, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.03);
  }

  noise(ctx, time, duration, volume) {
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      data[index] = (Math.random() * 2 - 1) * (1 - index / length);
    }
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffer;
    gain.gain.setValueAtTime(volume * MASTER_VOLUME, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start(time);
  }
}
