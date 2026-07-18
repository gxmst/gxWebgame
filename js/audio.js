import { CONFIG } from "./config.js";

const SILENCE = 0.0001;
const SFX_BUS_GAIN = 0.26;

export class AudioSystem {
  constructor(settingsProvider = () => ({}), options = {}) {
    this.settingsProvider = settingsProvider;
    this.contextFactory = options.contextFactory || createDefaultContext;
    this.setIntervalFn = options.setIntervalFn || globalThis.setInterval?.bind(globalThis);
    this.clearIntervalFn = options.clearIntervalFn || globalThis.clearInterval?.bind(globalThis);
    this.context = null;
    this.master = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.musicSession = null;
    this.retiringMusicSessions = new Set();
    this.musicScene = "title";
    this.musicGainTarget = null;
    this.backgrounded = false;
    this.backgroundGeneration = 0;
    this.lastDangerAt = 0;
  }

  /** Unlocks Web Audio after a user gesture. Repeated calls reuse one context. */
  unlock() {
    if (!this.context) {
      let context;
      try {
        context = this.contextFactory?.();
      } catch {
        return Promise.resolve(false);
      }
      if (!context) return Promise.resolve(false);
      this.context = context;
      this.master = context.createGain();
      this.sfxBus = context.createGain();
      this.musicBus = context.createGain();
      this.sfxBus.gain.value = SFX_BUS_GAIN;
      this.musicBus.gain.value = 0;
      this.sfxBus.connect(this.master);
      this.musicBus.connect(this.master);
      this.master.connect(context.destination);
      this.syncSettings();
    }

    const resume = ["suspended", "interrupted"].includes(this.context.state)
      ? safePromise(() => this.context.resume?.())
      : Promise.resolve();
    return resume
      .catch(() => {})
      .then(() => {
        this.syncSettings();
        return this.context?.state === "running";
      });
  }

  /** Applies volume/mute/music settings immediately without requiring an SFX. */
  syncSettings() {
    if (!this.context || !this.master) return;
    const settings = this.settingsProvider() || {};
    const volume = clamp01(settings.volume ?? 0.7);
    const audible = !this.backgrounded && !settings.muted ? volume : 0;
    setParamNow(this.master.gain, audible, this.context.currentTime);

    const sceneScale = CONFIG.music.sceneVolume[this.musicScene]
      ?? CONFIG.music.sceneVolume.title;
    const musicGainTarget = CONFIG.music.baseVolume * Math.max(0, sceneScale);
    if (musicGainTarget !== this.musicGainTarget) {
      this.musicGainTarget = musicGainTarget;
      rampParam(
        this.musicBus.gain,
        musicGainTarget,
        this.context.currentTime,
        CONFIG.music.sceneTransitionSeconds,
      );
    }

    if (this.shouldPlayMusic(settings)) this.startMusic();
    else this.stopMusic(this.backgrounded);
  }

  setScene(scene = "title") {
    this.musicScene = Object.hasOwn(CONFIG.music.sceneVolume, scene) ? scene : "title";
    this.syncSettings();
  }

  /** Stops all music and suspends the context while the page is hidden. */
  setBackgrounded(backgrounded) {
    const next = backgrounded === true;
    if (next === this.backgrounded) return Promise.resolve(false);
    this.backgrounded = next;
    const generation = ++this.backgroundGeneration;
    if (!this.context) return Promise.resolve(false);

    if (next) {
      this.syncSettings();
      this.stopMusic(true);
      return safePromise(() => this.context.suspend?.())
        .catch(() => false)
        .then(() => {
          if (generation !== this.backgroundGeneration && !this.backgrounded) {
            return this.restoreForegroundAudio();
          }
          return this.backgrounded;
        });
    }

    return this.restoreForegroundAudio(generation);
  }

  restoreForegroundAudio(generation = this.backgroundGeneration) {
    if (!this.context || this.backgrounded) return Promise.resolve(false);
    const resume = ["suspended", "interrupted"].includes(this.context.state)
      ? safePromise(() => this.context.resume?.())
      : Promise.resolve();
    return resume
      .then(() => {
        if (generation !== this.backgroundGeneration || this.backgrounded) return false;
        this.syncSettings();
        return this.context?.state === "running";
      })
      .catch(() => false);
  }

  play(name, options = {}) {
    const settings = this.settingsProvider() || {};
    if (settings.muted || clamp01(settings.volume ?? 0.7) <= 0
      || !this.context || !this.sfxBus || this.backgrounded) return;
    this.syncSettings();
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
    if (!this.context || !this.sfxBus) return;
    const now = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(40, frequency * 0.78),
      now + duration,
    );
    gain.gain.setValueAtTime(SILENCE, now);
    gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(SILENCE, now + duration);
    oscillator.connect(gain);
    gain.connect(this.sfxBus);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.03);
  }

  /** Soft filtered noise for water / splash texture. */
  noiseBurst(duration, gainValue, delay = 0) {
    if (!this.context || !this.sfxBus) return;
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
    gain.gain.setValueAtTime(SILENCE, now);
    gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(SILENCE, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxBus);
    source.start(now);
    source.stop(now + duration + 0.02);
  }

  shouldPlayMusic(settings = this.settingsProvider() || {}) {
    return this.context?.state === "running"
      && !this.backgrounded
      && settings.music !== false
      && !settings.muted
      && clamp01(settings.volume ?? 0.7) > 0;
  }

  startMusic() {
    if (!this.context || !this.musicBus || this.musicSession
      || !this.shouldPlayMusic()) return;
    this.forceStopRetiringSessions();

    const now = this.context.currentTime;
    const filter = this.context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = CONFIG.music.filterFrequency;
    filter.Q.value = CONFIG.music.filterQ;

    const breathGain = this.context.createGain();
    breathGain.gain.value = 1 - CONFIG.music.breathDepth;
    const sessionGain = this.context.createGain();
    sessionGain.gain.setValueAtTime(SILENCE, now);
    sessionGain.gain.linearRampToValueAtTime(1, now + CONFIG.music.fadeInSeconds);
    filter.connect(breathGain);
    breathGain.connect(sessionGain);
    sessionGain.connect(this.musicBus);

    const voices = CONFIG.music.voiceWaveforms.map((waveform, index) => {
      const oscillator = this.context.createOscillator();
      const voiceGain = this.context.createGain();
      oscillator.type = waveform;
      oscillator.detune.value = CONFIG.music.voiceDetuneCents[index] ?? 0;
      voiceGain.gain.value = CONFIG.music.voiceGains[index] ?? 0;
      oscillator.connect(voiceGain);
      voiceGain.connect(filter);
      oscillator.start(now);
      return oscillator;
    });

    const lfo = this.context.createOscillator();
    const lfoGain = this.context.createGain();
    lfo.type = "sine";
    lfo.frequency.value = CONFIG.music.breathFrequency;
    lfoGain.gain.value = CONFIG.music.breathDepth;
    lfo.connect(lfoGain);
    lfoGain.connect(breathGain.gain);
    lfo.start(now);

    const session = {
      voices,
      lfo,
      output: sessionGain,
      chordIndex: 0,
      intervalId: null,
      stopped: false,
    };
    this.musicSession = session;
    this.applyMusicChord(session, true);
    if (this.setIntervalFn) {
      session.intervalId = this.setIntervalFn(() => {
        if (this.musicSession !== session || session.stopped) return;
        session.chordIndex = (session.chordIndex + 1) % CONFIG.music.chordSemitones.length;
        this.applyMusicChord(session, false);
      }, CONFIG.music.chordDurationSeconds * 1000);
    }
  }

  applyMusicChord(session, immediate) {
    if (!this.context || session.stopped) return;
    const chord = CONFIG.music.chordSemitones[session.chordIndex]
      || CONFIG.music.chordSemitones[0];
    const now = this.context.currentTime;
    for (let index = 0; index < session.voices.length; index++) {
      const semitones = chord[index % chord.length];
      const frequency = CONFIG.music.rootFrequency * 2 ** (semitones / 12);
      const param = session.voices[index].frequency;
      param.cancelScheduledValues?.(now);
      if (immediate || !param.setTargetAtTime) param.setValueAtTime(frequency, now);
      else param.setTargetAtTime(frequency, now, Math.max(0.01, CONFIG.music.glideSeconds / 3));
    }
  }

  stopMusic(immediate = false) {
    const session = this.musicSession;
    if (!session) return;
    this.musicSession = null;
    session.stopped = true;
    if (session.intervalId != null) this.clearIntervalFn?.(session.intervalId);

    const now = this.context?.currentTime ?? 0;
    const release = immediate ? 0.02 : CONFIG.music.fadeOutSeconds;
    holdParam(session.output.gain, now);
    session.output.gain.linearRampToValueAtTime(0, now + release);
    this.retiringMusicSessions.add(session);
    this.scheduleMusicSessionStop(session, now + release + 0.03);
  }

  scheduleMusicSessionStop(session, stopAt) {
    const nodes = [...session.voices, session.lfo];
    let remaining = nodes.length;
    const cleanup = () => {
      remaining--;
      if (remaining > 0) return;
      this.retiringMusicSessions.delete(session);
      session.output.disconnect?.();
    };
    for (const node of nodes) {
      node.onended = cleanup;
      try {
        node.stop(stopAt);
      } catch {
        cleanup();
      }
    }
  }

  forceStopRetiringSessions() {
    const now = this.context?.currentTime ?? 0;
    for (const session of this.retiringMusicSessions) {
      setParamNow(session.output.gain, 0, now);
      for (const node of [...session.voices, session.lfo]) {
        try {
          node.stop(now + 0.01);
        } catch {
          // A scheduled or already stopped oscillator is harmless.
        }
      }
    }
  }
}

export function vibrate(pattern, settings) {
  if (!settings?.vibration || typeof navigator.vibrate !== "function") return;
  navigator.vibrate(pattern);
}

function createDefaultContext() {
  const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
  return AudioContext ? new AudioContext() : null;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function safePromise(action) {
  try {
    return Promise.resolve(action?.());
  } catch (error) {
    return Promise.reject(error);
  }
}

function setParamNow(param, value, now) {
  param.cancelScheduledValues?.(now);
  param.setValueAtTime(value, now);
}

function holdParam(param, now) {
  if (param.cancelAndHoldAtTime) {
    param.cancelAndHoldAtTime(now);
    return;
  }
  const current = Number.isFinite(param.value) ? param.value : 1;
  param.cancelScheduledValues?.(now);
  param.setValueAtTime(Math.max(0, current), now);
}

function rampParam(param, value, now, duration) {
  holdParam(param, now);
  param.linearRampToValueAtTime(value, now + Math.max(0, duration));
}
