import { AudioSystem } from "../js/audio.js";
import { CONFIG } from "../js/config.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

class FakeParam {
  constructor(value = 0) {
    this.value = value;
    this.lastMethod = null;
  }

  setValueAtTime(value) {
    this.value = value;
    this.lastMethod = "setValueAtTime";
  }

  linearRampToValueAtTime(value) {
    this.value = value;
    this.lastMethod = "linearRampToValueAtTime";
  }

  exponentialRampToValueAtTime(value) {
    this.value = value;
  }

  setTargetAtTime(value) {
    this.value = value;
    this.lastMethod = "setTargetAtTime";
  }

  cancelScheduledValues() {}

  cancelAndHoldAtTime() {}
}

class FakeNode {
  connect(target) {
    this.target = target;
    return target;
  }

  disconnect() {}
}

class FakeOscillator extends FakeNode {
  constructor() {
    super();
    this.frequency = new FakeParam();
    this.detune = new FakeParam();
    this.started = false;
    this.stopped = false;
  }

  start() {
    this.started = true;
  }

  stop() {
    if (this.stopped) throw new Error("already stopped");
    this.stopped = true;
    this.onended?.();
  }
}

class FakeContext {
  constructor() {
    this.state = "suspended";
    this.currentTime = 0;
    this.sampleRate = 48000;
    this.destination = new FakeNode();
    this.oscillators = [];
    this.resumeCount = 0;
    this.suspendCount = 0;
    this.deferSuspend = false;
    this.resolvePendingSuspend = null;
  }

  createGain() {
    const node = new FakeNode();
    node.gain = new FakeParam(1);
    return node;
  }

  createOscillator() {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }

  createBiquadFilter() {
    const node = new FakeNode();
    node.frequency = new FakeParam();
    node.Q = new FakeParam();
    return node;
  }

  resume() {
    this.resumeCount++;
    this.state = "running";
  }

  suspend() {
    this.suspendCount++;
    if (!this.deferSuspend) {
      this.state = "suspended";
      return undefined;
    }
    return new Promise((resolve) => {
      this.resolvePendingSuspend = () => {
        this.state = "suspended";
        resolve();
      };
    });
  }

  finishPendingSuspend() {
    this.resolvePendingSuspend?.();
    this.resolvePendingSuspend = null;
  }
}

function createAudio(settings) {
  const context = new FakeContext();
  let contextsCreated = 0;
  const audio = new AudioSystem(() => settings, {
    contextFactory: () => {
      contextsCreated++;
      return context;
    },
    setIntervalFn: () => 1,
    clearIntervalFn: () => {},
  });
  return { audio, context, getContextsCreated: () => contextsCreated };
}

export const tests = [
  {
    name: "audio unlock creates one lightweight music session after interaction",
    async run() {
      const settings = { volume: 0.7, muted: false, music: true };
      const { audio, context, getContextsCreated } = createAudio(settings);
      assert(audio.musicSession === null, "loading must not start audio");
      await audio.unlock();
      assert(getContextsCreated() === 1);
      assert(audio.musicSession !== null);
      assert(context.oscillators.length === CONFIG.music.voiceWaveforms.length + 1);
      await audio.unlock();
      assert(getContextsCreated() === 1);
      assert(context.oscillators.length === CONFIG.music.voiceWaveforms.length + 1);
    },
  },
  {
    name: "music toggle stops only music while sound effects remain available",
    async run() {
      const settings = { volume: 0.6, muted: false, music: true };
      const { audio, context } = createAudio(settings);
      await audio.unlock();
      const before = context.oscillators.length;
      settings.music = false;
      audio.syncSettings();
      assert(audio.musicSession === null);
      audio.play("ui");
      assert(context.oscillators.length === before + 1, "UI sound should still create a tone");
    },
  },
  {
    name: "volume mute and background state update the master bus immediately",
    async run() {
      const settings = { volume: 0.4, muted: false, music: true };
      const { audio, context } = createAudio(settings);
      await audio.unlock();
      assert(audio.master.gain.value === 0.4);
      settings.muted = true;
      audio.syncSettings();
      assert(audio.master.gain.value === 0 && audio.musicSession === null);
      settings.muted = false;
      audio.syncSettings();
      assert(audio.master.gain.value === 0.4 && audio.musicSession !== null);
      audio.setBackgrounded(true);
      assert(audio.master.gain.value === 0 && audio.musicSession === null);
      assert(context.suspendCount === 1);
      await audio.setBackgrounded(false);
      assert(context.resumeCount === 2);
      assert(audio.musicSession !== null);
    },
  },
  {
    name: "foreground recovery wins a delayed background suspend race",
    async run() {
      const settings = { volume: 0.5, muted: false, music: true };
      const { audio, context } = createAudio(settings);
      await audio.unlock();
      context.deferSuspend = true;
      const hiding = audio.setBackgrounded(true);
      const showing = audio.setBackgrounded(false);
      await showing;
      context.finishPendingSuspend();
      await hiding;
      assert(context.state === "running");
      assert(audio.backgrounded === false && audio.musicSession !== null);
    },
  },
  {
    name: "music scene changes ramp the bus instead of snapping",
    async run() {
      const settings = { volume: 0.7, muted: false, music: true };
      const { audio } = createAudio(settings);
      await audio.unlock();
      audio.setScene("paused");
      assert(audio.musicBus.gain.lastMethod === "linearRampToValueAtTime");
      assert(audio.musicBus.gain.value
        === CONFIG.music.baseVolume * CONFIG.music.sceneVolume.paused);
    },
  },
];
