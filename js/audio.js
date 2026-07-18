export class AudioSystem {
  constructor(settingsProvider = () => ({})) {
    this.settingsProvider = settingsProvider;
    this.context = null;
    this.master = null;
    this.lastDangerAt = 0;
  }

  unlock() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.connect(this.context.destination);
    }
    if (this.context.state === "suspended") this.context.resume().catch(() => {});
  }

  play(name, options = {}) {
    const settings = this.settingsProvider();
    if (settings.muted || !this.context || !this.master) return;
    const volume = Math.max(0, Math.min(1, settings.volume ?? 0.7));
    this.master.gain.setValueAtTime(volume * 0.26, this.context.currentTime);
    const intensity = options.intensity ?? 0;

    switch (name) {
      case "ui":
        this.tone(440, 0.035, "square", 0.14);
        break;
      case "eat":
        // Bite + soft water bloom
        this.tone(210 + intensity * 90, 0.05, "square", 0.2);
        this.tone(340 + intensity * 70, 0.08, "triangle", 0.14, 0.02);
        this.noiseBurst(0.04, 0.08, 0.018);
        break;
      case "fringe":
        this.tone(280, 0.05, "square", 0.18);
        this.tone(430, 0.1, "triangle", 0.24, 0.03);
        this.tone(560, 0.08, "sine", 0.12, 0.07);
        this.noiseBurst(0.055, 0.12, 0.03);
        break;
      case "tier":
        this.tone(480, 0.12, "triangle", 0.24);
        this.tone(620, 0.16, "triangle", 0.2, 0.07);
        this.tone(780, 0.18, "sine", 0.14, 0.14);
        break;
      case "dash":
        this.tone(120, 0.06, "sawtooth", 0.12);
        this.tone(190, 0.1, "sawtooth", 0.1, 0.02);
        this.noiseBurst(0.05, 0.1, 0.02);
        break;
      case "empty":
        this.tone(90, 0.1, "square", 0.1);
        this.tone(70, 0.12, "sine", 0.08, 0.04);
        break;
      case "stun":
        this.tone(110, 0.14, "sawtooth", 0.14);
        this.tone(160, 0.1, "square", 0.1, 0.05);
        break;
      case "mine":
        this.tone(68, 0.22, "sawtooth", 0.28);
        this.tone(48, 0.28, "sine", 0.18, 0.04);
        this.noiseBurst(0.12, 0.2, 0.08);
        break;
      case "danger":
        this.tone(74, 0.14, "sine", 0.16);
        this.tone(98, 0.1, "triangle", 0.1, 0.05);
        break;
      case "death":
        this.tone(180, 0.18, "sawtooth", 0.2);
        this.tone(110, 0.28, "sawtooth", 0.16, 0.08);
        this.tone(55, 0.4, "sine", 0.14, 0.16);
        break;
      case "victory":
        this.tone(520, 0.14, "triangle", 0.2);
        this.tone(660, 0.2, "triangle", 0.22, 0.1);
        this.tone(830, 0.28, "sine", 0.18, 0.22);
        this.tone(990, 0.22, "sine", 0.12, 0.36);
        break;
      default:
        break;
    }
  }

  danger() {
    const now = performance.now();
    if (now - this.lastDangerAt < 780) return;
    this.lastDangerAt = now;
    this.play("danger");
  }

  tone(frequency, duration, type, gainValue, delay = 0) {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(40, frequency * 0.78),
      now + duration,
    );
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.03);
  }

  /** Soft filtered noise for water / splash texture. */
  noiseBurst(duration, gainValue, delay = 0) {
    if (!this.context || !this.master) return;
    const sampleRate = this.context.sampleRate;
    const length = Math.max(1, Math.floor(sampleRate * duration));
    const buffer = this.context.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const envelope = 1 - i / length;
      data[i] = (Math.random() * 2 - 1) * envelope * envelope;
    }
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    const filter = this.context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 900;
    filter.Q.value = 0.7;
    const gain = this.context.createGain();
    const now = this.context.currentTime + delay;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(now);
    source.stop(now + duration + 0.02);
  }
}

export function vibrate(pattern, settings) {
  if (!settings?.vibration || typeof navigator.vibrate !== "function") return;
  navigator.vibrate(pattern);
}
