import { CONFIG } from "./config.js";
import {
  clamp,
  damp,
  distanceSq,
  normalize,
  moveAngleTowards,
  circlesIntersect,
  wrap,
  wrapDelta,
} from "./math.js";
import { Camera } from "./camera.js";
import {
  RELATION,
  canEat,
  getRelation,
  getTier,
  getVisualRadius,
  getMoveSpeed,
  getMassGain,
  getEatScore,
  createComboState,
  updateCombo,
} from "./rules.js";
import { clearProgress, loadSave, saveSave, updateResults } from "./save.js";
import { InputController } from "./input.js";
import { SpriteFactory, AVAILABLE_SKINS } from "./sprites.js";
import { AudioSystem, vibrate } from "./audio.js";
import { Effects } from "./effects.js";
import { SPECIES, createPlayer, createNetWarning } from "./entities.js";
import { Director } from "./director.js";
import { WorldRenderer } from "./world.js";
import { createRunResult, getRunRecordLabels } from "./run.js";
import { AutoQualityController } from "./quality.js";
import {
  MAX_UPGRADE_LEVEL,
  UPGRADE_TYPES,
  getNextUpgradePrice,
  getUpgradeEffects,
  getUpgradeLevel,
  purchaseUpgrade,
} from "./upgrades.js";

const STATE = Object.freeze({
  TITLE: "title",
  PLAYING: "playing",
  APEX: "apex",
  ENDLESS: "endless",
  DYING: "dying",
  PAUSED: "paused",
  SETTINGS: "settings",
  SHOP: "shop",
  RESULTS: "results",
  VICTORY: "victory",
});

const SKIN_META = {
  reef: { name: "珊瑚青", cost: 0 },
  coral: { name: "赤珊瑚", cost: 12 },
  midnight: { name: "午夜蓝", cost: 22 },
  koi: { name: "锦鲤白", cost: 36 },
};

const $ = (id) => document.getElementById(id);

class Game {
  constructor() {
    this.canvas = $("game-canvas");
    this.ctx = this.canvas.getContext("2d", { alpha: false });
    this.ctx.imageSmoothingEnabled = false;
    this.dom = this.collectDom();

    this.save = loadSave();
    this.upgradeEffects = getUpgradeEffects(this.save.upgrades);
    this.state = STATE.TITLE;
    this.previousState = STATE.TITLE;
    this.returnFromSettings = STATE.TITLE;
    this.portraitBlocked = false;
    this.cssWidth = 1280;
    this.cssHeight = 720;
    this.dpr = 1;
    this.time = 0;
    this.elapsed = 0;
    this.lastNow = performance.now();
    this.accumulator = 0;
    this.slowMotion = 1;
    this.dyingTimer = 0;
    this.resumeCountdown = 0;
    this.toastTimer = 0;
    this.tierToastTimer = 0;
    this.runCommitted = false;
    this.runWasVictory = false;
    this.victoryElapsedMs = null;
    this.endlessElapsed = 0;
    this.endlessNetTimer = 4;
    this.tutorialStep = 0;
    this.clearProgressConfirmUntil = 0;
    this.deathReason = "";
    this.score = 0;
    this.maxCombo = 0;
    this.combo = createComboState();
    this.apexRemaining = CONFIG.hazards.apexDurationSeconds;
    this.apexNetTimer = 2.4;
    this.lastDangerDistance = Infinity;
    this.hitStop = 0;
    this.tierCameraTimer = 0;
    this.cameraMode = "normal";
    this.trailTimer = 0;
    this.baitFeastCount = 0;
    this.baitFeastTimer = 0;
    this.debug = new URLSearchParams(location.search).get("debug") === "1";
    this.debugFps = 60;
    this.frameSamples = [];
    this.autoQuality = new AutoQualityController({ maxDpr: CONFIG.viewport.maxDpr });
    this.metrics = this.createMetrics();

    this.camera = new Camera({
      worldWidth: CONFIG.world.width,
      worldHeight: CONFIG.world.height,
      wrap: CONFIG.world.wrap,
      x: CONFIG.world.width / 2,
      y: CONFIG.world.height / 2,
    });
    this.worldRenderer = new WorldRenderer(CONFIG.world.width, CONFIG.world.height);
    this.sprites = new SpriteFactory();
    this.effects = new Effects();
    this.effects.setQuality(this.save.settings.quality);
    this.audio = new AudioSystem(() => this.save.settings);
    this.director = new Director(CONFIG.world, this.getSeed());

    this.player = createPlayer(CONFIG.world.width / 2, CONFIG.world.height / 2, this.save.selectedSkin);
    this.camera.setTarget(this.player);
    this.fish = [];
    this.specials = [];

    this.input = new InputController(this.canvas, {
      dashButton: this.dom.dashButton,
      cameraProvider: () => this.camera,
      playerProvider: () => this.player,
      touchModeProvider: () => this.save.settings.touchMode,
      enabledProvider: () => [STATE.PLAYING, STATE.APEX, STATE.ENDLESS].includes(this.state),
    });

    this.bindUi();
    this.applySettingsToUi();
    this.resize();
    this.buildTitleScene();
    this.showState(STATE.TITLE);
    requestAnimationFrame((now) => this.frame(now));
  }

  collectDom() {
    const ids = [
      "title-screen", "start-button", "shop-button", "skin-button", "settings-button", "high-score", "best-clear-time",
      "shop-screen", "shop-coins", "shop-back-button",
      "shop-speed-level", "shop-speed-cost", "shop-speed-buy",
      "shop-stamina-level", "shop-stamina-cost", "shop-stamina-buy",
      "shop-mouth-level", "shop-mouth-cost", "shop-mouth-buy",
      "hud", "score-value", "combo-wrap", "combo-value", "tier-name", "tier-progress",
      "apex-wrap", "apex-time", "pause-button", "stamina-fill", "dash-button",
      "pause-screen", "resume-button", "pause-settings-button", "quit-button",
      "settings-screen", "volume-input", "mute-toggle", "vibration-toggle", "shake-toggle",
      "touch-mode", "quality-select", "contrast-toggle", "settings-back-button",
      "clear-progress-button", "clear-progress-status",
      "results-screen", "result-title", "result-reason", "result-score", "result-tier",
      "result-time", "result-combo", "result-coins", "result-pearls", "result-record", "retry-button", "results-home-button",
      "victory-screen", "victory-score", "victory-time", "victory-record", "endless-button", "victory-home-button",
      "rotate-overlay", "tier-toast", "message-toast", "debug-panel",
    ];
    const dom = {};
    for (const id of ids) dom[toCamel(id)] = $(id);
    return dom;
  }

  bindUi() {
    const click = (element, handler) => element?.addEventListener("click", (event) => {
      event.preventDefault();
      try {
        this.audio.unlock();
        this.audio.play("ui");
      } catch {
        // Audio must never block UI actions.
      }
      try {
        handler();
      } catch (error) {
        console.error("[ui click]", error);
      }
    });

    window.addEventListener("pointerdown", () => this.audio.unlock(), { once: true });
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("orientationchange", () => window.setTimeout(() => this.resize(), 80));
    window.addEventListener("blur", () => {
      if ([STATE.PLAYING, STATE.APEX, STATE.ENDLESS].includes(this.state)) this.pause();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && [STATE.PLAYING, STATE.APEX, STATE.ENDLESS].includes(this.state)) this.pause();
    });
    window.addEventListener("pagehide", (event) => {
      if (!event.persisted && this.runWasVictory && !this.runCommitted) this.commitRun(true);
    });
    window.addEventListener("keydown", (event) => {
      if (event.code === "Backquote") {
        this.debug = !this.debug;
        this.dom.debugPanel.hidden = !this.debug;
      }
      if (!this.debug || ![STATE.PLAYING, STATE.APEX, STATE.ENDLESS].includes(this.state)) return;
      if (event.code === "BracketRight") this.debugTier(1);
      if (event.code === "BracketLeft") this.debugTier(-1);
      if (event.code === "KeyI") this.player.invulnerable = this.player.invulnerable > 20 ? 0 : 999;
    });

    click(this.dom.startButton, () => this.startGame());
    click(this.dom.shopButton, () => this.openShop());
    click(this.dom.shopBackButton, () => this.closeShop());
    click(this.dom.shopSpeedBuy, () => this.buyUpgrade(UPGRADE_TYPES.SPEED));
    click(this.dom.shopStaminaBuy, () => this.buyUpgrade(UPGRADE_TYPES.STAMINA));
    click(this.dom.shopMouthBuy, () => this.buyUpgrade(UPGRADE_TYPES.MOUTH));
    click(this.dom.skinButton, () => this.cycleSkin());
    click(this.dom.settingsButton, () => this.openSettings(STATE.TITLE));
    click(this.dom.pauseButton, () => this.pause());
    click(this.dom.resumeButton, () => this.resume());
    click(this.dom.pauseSettingsButton, () => this.openSettings(STATE.PAUSED));
    click(this.dom.quitButton, () => this.quitRun());
    click(this.dom.settingsBackButton, () => this.closeSettings());
    click(this.dom.clearProgressButton, () => this.requestClearProgress());
    click(this.dom.retryButton, () => this.startGame());
    click(this.dom.resultsHomeButton, () => this.goHome());
    click(this.dom.endlessButton, () => this.continueEndless());
    click(this.dom.victoryHomeButton, () => {
      this.commitRun(true);
      this.goHome();
    });

    this.dom.volumeInput?.addEventListener("input", () => {
      this.save.settings.volume = clamp(Number(this.dom.volumeInput.value) / 100, 0, 1);
      this.save.settings.muted = false;
      if (this.dom.muteToggle) this.dom.muteToggle.checked = false;
      const output = document.querySelector("[data-volume-value]");
      if (output) output.textContent = `${Math.round(this.save.settings.volume * 100)}%`;
      saveSave(this.save);
    });
    this.bindToggle(this.dom.muteToggle, "muted");
    this.bindToggle(this.dom.vibrationToggle, "vibration");
    this.bindToggle(this.dom.shakeToggle, "screenShake");
    this.bindToggle(this.dom.contrastToggle, "highContrast", () => this.applyContrast());
    this.dom.touchMode?.addEventListener("change", () => {
      this.save.settings.touchMode = this.dom.touchMode.value;
      saveSave(this.save);
    });
    this.dom.qualitySelect?.addEventListener("change", () => {
      this.save.settings.quality = this.dom.qualitySelect.value;
      if (this.save.settings.quality === "auto") this.autoQuality.reset();
      this.effects.setQuality(this.save.settings.quality);
      saveSave(this.save);
      this.resize();
    });
  }

  bindToggle(element, key, after = null) {
    element?.addEventListener("change", () => {
      this.save.settings[key] = element.checked;
      saveSave(this.save);
      after?.();
    });
  }

  applySettingsToUi() {
    if (this.dom.volumeInput) this.dom.volumeInput.value = Math.round(this.save.settings.volume * 100);
    const volumeOutput = document.querySelector("[data-volume-value]");
    if (volumeOutput) volumeOutput.textContent = `${Math.round(this.save.settings.volume * 100)}%`;
    if (this.dom.muteToggle) this.dom.muteToggle.checked = this.save.settings.muted;
    if (this.dom.vibrationToggle) this.dom.vibrationToggle.checked = this.save.settings.vibration;
    if (this.dom.shakeToggle) this.dom.shakeToggle.checked = this.save.settings.screenShake;
    if (this.dom.touchMode) this.dom.touchMode.value = this.save.settings.touchMode;
    if (this.dom.qualitySelect) this.dom.qualitySelect.value = this.save.settings.quality;
    if (this.dom.contrastToggle) this.dom.contrastToggle.checked = this.save.settings.highContrast;
    this.applyContrast();
    this.updateTitleStats();
    this.updateSkinButton();
    this.updateShopUi();
  }

  applyContrast() {
    document.body.classList.toggle("high-contrast", this.save.settings.highContrast);
  }

  getSeed() {
    const requested = Number(new URLSearchParams(location.search).get("seed"));
    return Number.isFinite(requested) && requested > 0 ? requested : Date.now();
  }

  createMetrics() {
    return {
      seed: 0,
      firstEatTime: null,
      tierTimes: {},
      eaten: 0,
      edgeEaten: 0,
      dashes: 0,
      longestNoPrey: 0,
      deaths: [],
    };
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.cssWidth = Math.max(1, Math.round(rect.width || innerWidth));
    this.cssHeight = Math.max(1, Math.round(rect.height || innerHeight));
    const qualityDpr = this.save.settings.quality === "low" ? 1
      : this.save.settings.quality === "medium" ? 1.5
        : this.save.settings.quality === "auto" ? this.autoQuality.dprCap
          : CONFIG.viewport.maxDpr;
    this.dpr = Math.min(devicePixelRatio || 1, qualityDpr);
    this.canvas.width = Math.round(this.cssWidth * this.dpr);
    this.canvas.height = Math.round(this.cssHeight * this.dpr);
    this.ctx.imageSmoothingEnabled = false;
    this.camera.resize(this.cssWidth, this.cssHeight);

    const wasBlocked = this.portraitBlocked;
    this.portraitBlocked = this.cssWidth < this.cssHeight;
    if (this.dom.rotateOverlay) this.dom.rotateOverlay.hidden = !this.portraitBlocked;
    if (this.portraitBlocked && !wasBlocked) this.input?.reset();
    if (!this.portraitBlocked && wasBlocked && [STATE.PLAYING, STATE.APEX, STATE.ENDLESS].includes(this.state)) {
      this.resumeCountdown = 2.4;
    }
  }

  buildTitleScene() {
    this.player = createPlayer(CONFIG.world.width / 2, CONFIG.world.height / 2, this.save.selectedSkin);
    this.player.stamina = this.getMaxStamina();
    this.player.mass = 34;
    this.player.displayMass = 34;
    this.player.tier = 3;
    this.player.invulnerable = 999;
    this.camera.x = this.player.x;
    this.camera.y = this.player.y;
    this.camera.zoom = 0.84;
    this.camera.setTarget(this.player);
    this.fish = [];
    this.specials = [];
    this.director.reset(this.getSeed());
    this.director.populateInitial(this);
  }

  startGame() {
    if (this.state === STATE.VICTORY && !this.runCommitted) this.commitRun(true);
    const seed = this.getSeed();
    this.player = createPlayer(CONFIG.world.width / 2, CONFIG.world.height / 2, this.save.selectedSkin);
    this.player.stamina = this.getMaxStamina();
    this.camera.wrap = CONFIG.world.wrap;
    this.camera.x = this.player.x;
    this.camera.y = this.player.y;
    this.camera.zoom = 1;
    this.camera.punch = 0;
    this.camera.punchTarget = 0;
    this.camera.setMode("normal");
    this.cameraMode = "normal";
    this.camera.setTarget(this.player);
    this.fish = [];
    this.specials = [];
    this.effects.clear();
    this.director.reset(seed);
    this.director.populateInitial(this);
    this.score = 0;
    this.combo = createComboState();
    this.maxCombo = 0;
    this.elapsed = 0;
    this.hitStop = 0;
    this.tierCameraTimer = 0;
    this.trailTimer = 0;
    this.baitFeastCount = 0;
    this.baitFeastTimer = 0;
    this.apexRemaining = CONFIG.hazards.apexDurationSeconds;
    this.apexNetTimer = 2.6;
    this.runCommitted = false;
    this.runWasVictory = false;
    this.victoryElapsedMs = null;
    this.endlessElapsed = 0;
    this.endlessNetTimer = 4;
    this.deathReason = "";
    this.slowMotion = 1;
    this.resumeCountdown = 0;
    this.portraitBlocked = false;
    this.metrics = this.createMetrics();
    this.metrics.seed = seed;
    this.input.reset();
    this.resize();
    this.showState(STATE.PLAYING);
    this.tutorialStep = this.save.milestones["tutorial.completed"] ? 0 : 1;
    if (this.tutorialStep === 1) {
      this.showMessage(matchMedia("(pointer: coarse)").matches ? "第一步：在左侧拖动游动" : "第一步：移动鼠标或按方向键游动", 4);
    } else {
      this.showMessage("吃更小的鱼成长，红色警示要躲开", 2.8);
    }
    this.updateHud();
  }

  frame(now) {
    try {
      const rawFrame = Math.min((now - this.lastNow) / 1000, CONFIG.simulation.maxFrameTime);
      this.lastNow = now;
      this.time += rawFrame;
      this.sampleFrameTime(rawFrame);

      // Hit-stop freezes gameplay simulation briefly while presentation keeps moving.
      if (this.hitStop > 0) {
        this.hitStop = Math.max(0, this.hitStop - rawFrame);
        this.effects.update(rawFrame * 0.35);
        this.camera.update(rawFrame);
      } else if (!this.portraitBlocked) {
        this.accumulator += rawFrame * this.slowMotion;
        let updates = 0;
        while (this.accumulator >= CONFIG.simulation.fixedStep && updates < CONFIG.simulation.maxUpdatesPerFrame) {
          this.update(CONFIG.simulation.fixedStep);
          this.accumulator -= CONFIG.simulation.fixedStep;
          updates++;
        }
        if (updates >= CONFIG.simulation.maxUpdatesPerFrame) this.accumulator = 0;
      }

      this.render();
    } catch (error) {
      // Keep the loop alive so a single render/update fault does not freeze the UI.
      console.error("[game frame]", error);
    }
    requestAnimationFrame((nextNow) => this.frame(nextNow));
  }

  sampleFrameTime(frame) {
    this.frameSamples.push(frame);
    if (this.frameSamples.length > 40) this.frameSamples.shift();
    const average = this.frameSamples.reduce((sum, value) => sum + value, 0) / this.frameSamples.length;
    this.debugFps = average > 0 ? Math.round(1 / average) : 60;
    const active = this.save.settings.quality === "auto"
      && [STATE.PLAYING, STATE.APEX, STATE.ENDLESS].includes(this.state)
      && !this.portraitBlocked;
    const qualityChange = this.autoQuality.update(frame, this.debugFps, active);
    if (qualityChange) {
      this.resize();
      this.showMessage(
        qualityChange.direction === "down" ? "已自动降低渲染精度，保持操作流畅" : "帧率稳定，已恢复更清晰画面",
        2.4,
      );
    }
  }

  update(dt) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0 && this.dom.messageToast) {
        this.dom.messageToast.hidden = true;
        this.dom.messageToast.setAttribute("aria-hidden", "true");
      }
    }
    if (this.tierToastTimer > 0) {
      this.tierToastTimer -= dt;
      if (this.tierToastTimer <= 0 && this.dom.tierToast) {
        this.dom.tierToast.hidden = true;
        this.dom.tierToast.setAttribute("aria-hidden", "true");
      }
    }

    if (this.input.consumePause()) {
      if (this.state === STATE.PAUSED) this.resume();
      else if ([STATE.PLAYING, STATE.APEX, STATE.ENDLESS].includes(this.state)) this.pause();
    }

    if (this.resumeCountdown > 0) {
      this.resumeCountdown -= dt;
      return;
    }

    if (this.state === STATE.TITLE) {
      this.updateTitleScene(dt);
      this.effects.update(dt);
      this.camera.update(dt);
      return;
    }

    if (this.state === STATE.DYING) {
      this.dyingTimer -= dt;
      this.effects.update(dt);
      this.camera.setMode("death");
      this.cameraMode = "death";
      this.camera.update(dt);
      if (this.dyingTimer <= 0) this.showResults();
      return;
    }

    if (![STATE.PLAYING, STATE.APEX, STATE.ENDLESS].includes(this.state)) return;

    this.elapsed += dt;
    this.tierCameraTimer = Math.max(0, this.tierCameraTimer - dt);
    this.combo = updateCombo(this.combo, dt);
    this.baitFeastTimer = Math.max(0, this.baitFeastTimer - dt);
    if (this.baitFeastTimer <= 0) this.baitFeastCount = 0;
    this.maxCombo = Math.max(this.maxCombo, this.combo.count);
    this.updatePlayer(dt);
    this.updateFish(dt, false);
    this.updateSpecials(dt);
    this.resolveCollisions();
    this.fish = this.fish.filter((fish) => fish.active);
    this.specials = this.specials.filter((item) => item.active);
    this.effects.update(dt);
    this.updateCameraMode();
    this.camera.update(dt);
    this.director.update(dt, this);

    if (this.state === STATE.APEX) this.updateApex(dt);
    else if (this.state === STATE.ENDLESS) this.updateEndless(dt);
    this.metrics.longestNoPrey = Math.max(this.metrics.longestNoPrey, this.director.noPreyTime);
    this.updateHud();
    this.updateDebug();
  }

  updateCameraMode() {
    let mode = "normal";
    if (this.state === STATE.DYING) mode = "death";
    else if (this.tierCameraTimer > 0) mode = "tier";
    else if (this.player.dashing) mode = "dash";
    else if (this.lastDangerDistance < 210) mode = "danger";
    if (mode !== this.cameraMode) {
      this.cameraMode = mode;
      this.camera.setMode(mode);
    }
  }

  updateTitleScene(dt) {
    this.player.angle = Math.sin(this.time * 0.42) * 0.18;
    this.player.vx = Math.cos(this.player.angle) * 24;
    this.player.vy = Math.sin(this.player.angle) * 24;
    this.player.x += this.player.vx * dt;
    this.player.y += this.player.vy * dt;
    this.wrapEntity(this.player);
    this.updateFish(dt, true);
  }

  wrapEntity(entity) {
    if (!CONFIG.world.wrap) return;
    entity.x = wrap(entity.x, CONFIG.world.width);
    entity.y = wrap(entity.y, CONFIG.world.height);
  }

  /** Shortest vector from A to B on the current map topology. */
  deltaTo(ax, ay, bx, by) {
    if (CONFIG.world.wrap) {
      return {
        x: wrapDelta(bx, ax, CONFIG.world.width),
        y: wrapDelta(by, ay, CONFIG.world.height),
      };
    }
    return { x: bx - ax, y: by - ay };
  }

  wrapDistanceSq(ax, ay, bx, by) {
    if (CONFIG.world.wrap) {
      return distanceSq(ax, ay, bx, by, CONFIG.world.width, CONFIG.world.height);
    }
    return distanceSq(ax, ay, bx, by);
  }

  updatePlayer(dt) {
    const player = this.player;
    player.previousX = player.x;
    player.previousY = player.y;
    player.invulnerable = Math.max(0, player.invulnerable - dt);
    player.stunned = Math.max(0, player.stunned - dt);
    player.displayMass = damp(player.displayMass, player.mass, 9.5, dt);

    const newTier = getTier(player.displayMass);
    if (newTier.index > player.tier) this.onTierUp(newTier);
    player.tier = newTier.index;

    const input = this.input.sample();
    if (this.tutorialStep === 1 && input.moveStrength > 0.2) {
      this.tutorialStep = 2;
      this.showMessage(matchMedia("(pointer: coarse)").matches ? "第二步：按住右下按钮冲刺" : "第二步：按住空格或鼠标右键冲刺", 4);
    }
    const dashWasActive = player.dashing;
    if (!input.dashHeld) player.dashLock = false;
    if (input.dashHeld && !player.dashing && !player.dashLock && player.stamina >= CONFIG.dash.activationThreshold) {
      player.dashing = true;
      player.dashMinTime = CONFIG.dash.minimumDuration;
      player.dashBoostTime = CONFIG.dash.boostDuration;
      player.staminaDelay = CONFIG.dash.recoveryDelay;
      // Startup impulse so dash feels snappy, not just a speed multiplier.
      player.vx += Math.cos(player.angle) * CONFIG.dash.boostImpulse;
      player.vy += Math.sin(player.angle) * CONFIG.dash.boostImpulse;
      this.metrics.dashes++;
      this.audio.play("dash");
      this.effects.burst(
        player.x - Math.cos(player.angle) * 12,
        player.y - Math.sin(player.angle) * 12,
        "#9dffe0",
        7,
        140,
        { shape: "drop", gravity: -20, lifeScale: 0.55 },
      );
      this.camera.punchZoom(0.03);
      if (this.tutorialStep === 2) {
        this.tutorialStep = 0;
        this.save.milestones["tutorial.completed"] = true;
        saveSave(this.save);
        this.showMessage("完成！用冲刺追猎，也要留体力逃生", 2.8);
      }
    }
    player.dashMinTime = Math.max(0, player.dashMinTime - dt);
    player.dashBoostTime = Math.max(0, (player.dashBoostTime || 0) - dt);
    if (player.dashing && (!input.dashHeld && player.dashMinTime <= 0)) player.dashing = false;
    if (player.dashing) {
      player.stamina = Math.max(0, player.stamina - CONFIG.dash.drainPerSecond * dt);
      player.staminaDelay = CONFIG.dash.recoveryDelay;
      if (player.stamina <= 0) {
        player.dashing = false;
        player.dashLock = true;
        this.audio.play("empty");
      }
    } else {
      player.staminaDelay = Math.max(0, player.staminaDelay - dt);
      if (player.staminaDelay <= 0) {
        player.stamina = Math.min(
          this.getMaxStamina(),
          player.stamina + CONFIG.dash.recoveryPerSecond * this.upgradeEffects.staminaRecoveryMultiplier * dt,
        );
      }
    }
    if (dashWasActive && !player.dashing) player.staminaDelay = CONFIG.dash.recoveryDelay;

    const prevAngle = player.angle;
    const hasMove = input.moveStrength > 0.01;
    const massInertia = Math.pow(
      Math.max(CONFIG.mass.start, player.displayMass) / CONFIG.mass.start,
      CONFIG.movement.massInertiaExponent,
    );
    if (hasMove) {
      const targetAngle = Math.atan2(input.moveY, input.moveX);
      const turnScale = player.dashing ? CONFIG.dash.turnMultiplier : 1;
      const turnRate = CONFIG.movement.turnRateDeg * Math.PI / 180 * turnScale / massInertia;
      player.angle = moveAngleTowards(player.angle, targetAngle, turnRate * dt);

      let speed = getMoveSpeed(player.displayMass) * input.moveStrength * this.upgradeEffects.speedMultiplier;
      if (player.dashing) speed *= CONFIG.dash.speedMultiplier;
      if ((player.dashBoostTime || 0) > 0) speed *= CONFIG.dash.boostSpeedMultiplier;
      if (player.stunned > 0) speed *= CONFIG.hazards.jellyfishSpeedScale;
      const targetVx = Math.cos(player.angle) * speed;
      const targetVy = Math.sin(player.angle) * speed;
      const acceleration = CONFIG.movement.acceleration
        * (player.dashing ? CONFIG.dash.accelerationMultiplier : 1)
        / massInertia;
      player.vx = approach(player.vx, targetVx, acceleration * dt);
      player.vy = approach(player.vy, targetVy, acceleration * dt);
    } else {
      const speed = Math.hypot(player.vx, player.vy);
      let damping = player.stunned > 0
        ? 8.5
        : speed > CONFIG.movement.idleSpeedSplit
          ? CONFIG.movement.idleDampingFast
          : CONFIG.movement.idleDamping;
      // Heavier fish glide a bit longer before the hard brake.
      damping /= Math.max(1, massInertia * 0.85);
      player.vx *= Math.exp(-damping * dt);
      player.vy *= Math.exp(-damping * dt);
    }

    player.bodyTwist = damp(
      player.bodyTwist || 0,
      clamp((player.angle - prevAngle) / Math.max(dt, 1e-4) * 0.08, -0.45, 0.45),
      12,
      dt,
    );

    if (!CONFIG.world.wrap) {
      this.applySoftBoundary(player, dt, getVisualRadius(player.displayMass));
      player.x = clamp(player.x + player.vx * dt, 24, CONFIG.world.width - 24);
      player.y = clamp(player.y + player.vy * dt, 24, CONFIG.world.height - 24);
    } else {
      player.x += player.vx * dt;
      player.y += player.vy * dt;
      this.wrapEntity(player);
    }
    this.updatePlayerTrail(dt);
  }

  updatePlayerTrail(dt) {
    this.trailTimer -= dt;
    const speed = Math.hypot(this.player.vx, this.player.vy);
    if (speed < CONFIG.effects.trailSpeedThreshold || this.trailTimer > 0) return;

    const radius = getVisualRadius(this.player.displayMass);
    const tailX = this.player.x - Math.cos(this.player.angle) * radius * 1.35;
    const tailY = this.player.y - Math.sin(this.player.angle) * radius * 1.35;
    this.effects.burst(
      tailX,
      tailY,
      this.player.dashing ? "#c8fff0" : "#94ded4",
      this.player.dashing ? CONFIG.effects.trailDashCount : CONFIG.effects.trailNormalCount,
      CONFIG.effects.trailSpeed,
      {
        shape: "drop",
        gravity: -14,
        lifeScale: CONFIG.effects.trailLifeScale,
        sizeScale: this.player.dashing ? 0.72 : 0.55,
        angle: this.player.angle + Math.PI,
        spread: CONFIG.effects.trailSpread,
      },
    );
    this.trailTimer = this.player.dashing
      ? CONFIG.effects.trailDashInterval
      : CONFIG.effects.trailNormalInterval;
  }

  updateFish(dt, demoOnly) {
    let activeChasers = 0;
    const maxChasers = this.player.tier <= 2 ? 1 : this.player.tier <= 4 ? 2 : 3;
    this.lastDangerDistance = Infinity;

    for (const fish of this.fish) {
      if (!fish.active) continue;
      fish.previousX = fish.x;
      fish.previousY = fish.y;
      fish.spawnGrace = Math.max(0, fish.spawnGrace - dt);
      fish.stateTime += dt;
      fish.decisionTimer -= dt;
      fish.dashCooldown = Math.max(0, fish.dashCooldown - dt);
      fish.dashTimer = Math.max(0, fish.dashTimer - dt);
      fish.panicTimer = Math.max(0, fish.panicTimer - dt);
      fish.directFearTimer = Math.max(0, fish.directFearTimer - dt);
      fish.dashing = fish.dashTimer > 0;
      fish.displayMass = damp(fish.displayMass, fish.mass, 8, dt);
      fish.tier = getTier(fish.displayMass).index;

      const toPlayer = this.deltaTo(fish.x, fish.y, this.player.x, this.player.y);
      const dx = toPlayer.x;
      const dy = toPlayer.y;
      const distance = Math.hypot(dx, dy);
      let relation = getRelation(this.player.mass, fish.mass);
      if (this.state === STATE.APEX && relation === RELATION.THREAT) relation = RELATION.NEUTRAL;
      const species = SPECIES[fish.species] || SPECIES.silver;

      if (fish.decisionTimer <= 0) {
        fish.decisionTimer = 0.08 + (fish.id % 7) * 0.017;
        const schooling = fish.baitSchool || fish.species === "bluefin"
          ? this.sampleSchooling(fish)
          : null;
        if (schooling) {
          fish.flockX = fish.flockX * 0.58 + schooling.wanderX * 0.42;
          fish.flockY = fish.flockY * 0.58 + schooling.wanderY * 0.42;
          fish.flockFleeX = schooling.fleeX;
          fish.flockFleeY = schooling.fleeY;
          const alarmDistance = fish.baitSchool
            ? CONFIG.baitSchool.panicPropagationDistance
            : 520;
          if (schooling.alarmed && relation === RELATION.PREY && distance < alarmDistance) {
            fish.panicTimer = fish.baitSchool ? CONFIG.baitSchool.panicDuration : 0.65;
          }
        }
        let nextState = "wander";
        const directFear = !demoOnly && relation === RELATION.PREY && distance < species.sense * 1.15;
        if (directFear) {
          fish.directFearTimer = fish.baitSchool ? CONFIG.baitSchool.panicDuration : 0.28;
        }
        if (directFear || (!demoOnly && relation === RELATION.PREY && fish.panicTimer > 0)) nextState = "flee";
        else if (!demoOnly && relation === RELATION.THREAT && fish.spawnGrace <= 0 && distance < species.sense && activeChasers < maxChasers) nextState = "chase";
        if (nextState !== fish.state) {
          fish.state = nextState;
          fish.stateTime = 0;
          if (nextState === "flee" && fish.species === "bluefin" && fish.dashCooldown <= 0) {
            fish.dashTimer = 0.2;
            fish.dashCooldown = 2.8;
          }
        }
      }

      let desiredAngle = fish.wanderAngle;
      if (fish.state === "wander" && (fish.baitSchool || fish.species === "bluefin")) {
        desiredAngle = Math.atan2(fish.flockY, fish.flockX);
      }
      if (fish.state === "flee") {
        const away = normalize(-dx, -dy);
        desiredAngle = fish.baitSchool
          ? Math.atan2(fish.flockFleeY || away.y, fish.flockFleeX || away.x)
          : Math.atan2(away.y + fish.flockFleeY * 0.34, away.x + fish.flockFleeX * 0.34);
      }
      else if (fish.state === "chase") {
        desiredAngle = Math.atan2(dy + this.player.vy * 0.12, dx + this.player.vx * 0.12);
        activeChasers++;
        this.lastDangerDistance = Math.min(this.lastDangerDistance, distance);
        if (fish.stateTime > 0.45 && fish.stateTime < 1.6 && fish.dashCooldown <= 0 && distance < 220) {
          fish.dashTimer = 0.32;
          fish.dashCooldown = 3.4 + (fish.id % 5) * 0.3;
        }
        if (fish.stateTime > 2.0) {
          fish.state = "recover";
          fish.stateTime = 0;
        }
      } else if (fish.state === "recover") {
        desiredAngle = fish.angle + Math.sin(fish.id) * 0.35;
        if (fish.stateTime > 0.65) fish.state = "wander";
      } else if (fish.stateTime > 0.9 + (fish.id % 9) * 0.17) {
        fish.wanderAngle += (Math.sin(fish.id * 13.7 + this.time) * 0.9);
        fish.stateTime = 0;
      }

      const prevAngle = fish.angle;
      const turnRate = CONFIG.ai.turnRateDeg * Math.PI / 180 * species.turn * (fish.dashing ? 0.5 : 0.72);
      fish.angle = moveAngleTowards(fish.angle, desiredAngle, turnRate * dt);
      fish.bodyTwist = damp(
        fish.bodyTwist || 0,
        clamp((fish.angle - prevAngle) / Math.max(dt, 1e-4) * 0.07, -0.4, 0.4),
        10,
        dt,
      );
      let speed = getMoveSpeed(fish.displayMass) * species.speed * CONFIG.ai.globalSpeedScale;
      if (fish.state === "wander") speed *= CONFIG.ai.wanderSpeedScale;
      if (fish.state === "flee") speed *= CONFIG.ai.fleeSpeedScale;
      if (fish.state === "chase") {
        speed = Math.min(speed, getMoveSpeed(this.player.mass) * CONFIG.ai.chaseSpeedCap);
      }
      if (fish.state === "recover") speed *= CONFIG.ai.recoverSpeedScale;
      if (fish.dashing) speed *= CONFIG.ai.dashSpeedMultiplier;
      const targetVx = Math.cos(fish.angle) * speed;
      const targetVy = Math.sin(fish.angle) * speed;
      const accel = fish.state === "flee" ? CONFIG.ai.fleeAccel : CONFIG.ai.normalAccel;
      fish.vx = damp(fish.vx, targetVx, accel, dt);
      fish.vy = damp(fish.vy, targetVy, accel, dt);
      if (!CONFIG.world.wrap) {
        this.applySoftBoundary(fish, dt, getVisualRadius(fish.displayMass));
        fish.x = clamp(fish.x + fish.vx * dt, 18, CONFIG.world.width - 18);
        fish.y = clamp(fish.y + fish.vy * dt, 18, CONFIG.world.height - 18);
      } else {
        fish.x += fish.vx * dt;
        fish.y += fish.vy * dt;
        this.wrapEntity(fish);
      }
    }

    if (this.lastDangerDistance < 190) this.audio.danger();
  }

  sampleSchooling(fish) {
    const bait = fish.baitSchool === true;
    const neighborRadius = bait ? CONFIG.baitSchool.neighborRadius : 180;
    const separationRadius = bait ? CONFIG.baitSchool.separationRadius : 58;
    const propagationRadius = bait ? CONFIG.baitSchool.panicPropagationDistance : 230;
    const neighborLimit = bait ? CONFIG.baitSchool.neighborLimit : 12;
    let count = 0;
    let centerOffsetX = 0;
    let centerOffsetY = 0;
    let alignX = 0;
    let alignY = 0;
    let separateX = 0;
    let separateY = 0;
    let alarmed = false;
    for (const other of this.fish) {
      if (other === fish || !other.active) continue;
      if (bait) {
        if (!other.baitSchool || other.schoolId !== fish.schoolId) continue;
      } else if (other.species !== "bluefin" || other.baitSchool) continue;
      const offset = this.deltaTo(fish.x, fish.y, other.x, other.y);
      const dx = offset.x;
      const dy = offset.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < propagationRadius * propagationRadius && other.directFearTimer > 0) alarmed = true;
      if (distSq > neighborRadius * neighborRadius) continue;
      count++;
      centerOffsetX += dx;
      centerOffsetY += dy;
      alignX += other.vx;
      alignY += other.vy;
      if (distSq < separationRadius * separationRadius) {
        const inverse = 1 / Math.max(64, distSq);
        separateX -= dx * inverse;
        separateY -= dy * inverse;
      }
      if (count >= neighborLimit) break;
    }
    const playerOffset = this.deltaTo(fish.x, fish.y, this.player.x, this.player.y);
    const averageOffsetX = count > 0 ? centerOffsetX / count : 0;
    const averageOffsetY = count > 0 ? centerOffsetY / count : 0;
    const schoolAway = normalize(
      averageOffsetX - playerOffset.x,
      averageOffsetY - playerOffset.y,
      -playerOffset.x,
      -playerOffset.y,
    );
    if (count < (bait ? 1 : 2)) {
      return {
        wanderX: Math.cos(fish.wanderAngle),
        wanderY: Math.sin(fish.wanderAngle),
        fleeX: bait ? schoolAway.x : 0,
        fleeY: bait ? schoolAway.y : 0,
        alarmed,
      };
    }
    const cohesion = normalize(averageOffsetX, averageOffsetY);
    const alignment = normalize(alignX, alignY);
    const separation = normalize(separateX, separateY, 0, 0);
    const wander = bait
      ? normalize(
        Math.cos(fish.wanderAngle) * 0.24
          + cohesion.x * CONFIG.baitSchool.cohesionWeight
          + alignment.x * CONFIG.baitSchool.alignmentWeight
          + separation.x * CONFIG.baitSchool.separationWeight,
        Math.sin(fish.wanderAngle) * 0.24
          + cohesion.y * CONFIG.baitSchool.cohesionWeight
          + alignment.y * CONFIG.baitSchool.alignmentWeight
          + separation.y * CONFIG.baitSchool.separationWeight,
      )
      : normalize(
        Math.cos(fish.wanderAngle) * 0.45 + cohesion.x * 0.32 + alignment.x * 0.52 + separation.x * 1.1,
        Math.sin(fish.wanderAngle) * 0.45 + cohesion.y * 0.32 + alignment.y * 0.52 + separation.y * 1.1,
      );
    const flee = bait
      ? normalize(
        schoolAway.x * CONFIG.baitSchool.fleePlayerWeight
          + alignment.x * CONFIG.baitSchool.fleeSchoolWeight
          + cohesion.x * 0.45
          + separation.x * 0.4,
        schoolAway.y * CONFIG.baitSchool.fleePlayerWeight
          + alignment.y * CONFIG.baitSchool.fleeSchoolWeight
          + cohesion.y * 0.45
          + separation.y * 0.4,
        schoolAway.x,
        schoolAway.y,
      )
      : normalize(alignment.x * 0.28 + separation.x * 0.9, alignment.y * 0.28 + separation.y * 0.9, 0, 0);
    return { wanderX: wander.x, wanderY: wander.y, fleeX: flee.x, fleeY: flee.y, alarmed };
  }

  applySoftBoundary(entity, dt, radius) {
    const margin = CONFIG.world.softBoundary + radius;
    let steerX = 0;
    let steerY = 0;
    if (entity.x < margin) steerX = (margin - entity.x) / margin;
    else if (entity.x > CONFIG.world.width - margin) steerX = -(entity.x - (CONFIG.world.width - margin)) / margin;
    if (entity.y < margin) steerY = (margin - entity.y) / margin;
    else if (entity.y > CONFIG.world.height - margin) steerY = -(entity.y - (CONFIG.world.height - margin)) / margin;
    if (steerX || steerY) {
      const strength = CONFIG.movement.acceleration * CONFIG.movement.boundarySteerStrength * dt;
      entity.vx += steerX * strength;
      entity.vy += steerY * strength;
      const targetAngle = Math.atan2(steerY || entity.vy, steerX || entity.vx);
      entity.angle = moveAngleTowards(entity.angle, targetAngle, Math.PI * dt * 1.6);
    }
  }

  updateSpecials(dt) {
    const bounds = this.camera.getVisibleWorldBounds(150);
    for (const item of this.specials) {
      if (!item.active) continue;
      if (item.type === "jelly") {
        item.previousX = item.x;
        item.previousY = item.y;
        item.cooldown = Math.max(0, item.cooldown - dt);
        item.y += item.vy * dt;
        item.x += (item.vx + Math.sin(this.time * 1.4 + item.phase) * 6) * dt;
        if (CONFIG.world.wrap) {
          this.wrapEntity(item);
        } else {
          if (item.y > CONFIG.world.height - 50 || item.y < 50) item.vy *= -1;
          if (item.x > CONFIG.world.width - 50 || item.x < 50) item.vx *= -1;
        }
      } else if (item.type === "mine") {
        item.armTime = Math.max(0, item.armTime - dt);
        item.y += Math.sin(this.time * 1.5 + item.phase) * 1.5 * dt;
        if (CONFIG.world.wrap) this.wrapEntity(item);
        if (item.triggered) {
          item.fuseTime = Math.max(0, item.fuseTime - dt);
          if (item.fuseTime <= 0) this.explodeMine(item);
        }
      } else if (item.type === "net") {
        if (item.warningTime > 0) item.warningTime -= dt;
        else {
          item.activeTime += dt;
          item.y += item.speed * dt;
          if (item.y > bounds.bottom + 120) item.active = false;
        }
      }
    }
  }

  resolveCollisions() {
    if (!this.player.alive) return;
    const playerBody = this.bodyCircle(this.player);
    const playerMouth = this.mouthCircle(this.player);

    for (const fish of this.fish) {
      if (!fish.active) continue;
      const fishBody = this.bodyCircle(fish);
      const fishMouth = this.mouthCircle(fish);

      if (fish.spawnGrace <= 0 && canEat(this.player.mass, fish.mass) && this.mouthHits(this.player, playerMouth, fishBody)) {
        this.eatFish(fish);
        continue;
      }

      const fishCanKill = this.state !== STATE.APEX
        && fish.spawnGrace <= 0
        && this.player.invulnerable <= 0
        && canEat(fish.mass, this.player.mass);
      if (fishCanKill && this.mouthHits(fish, fishMouth, playerBody)) {
        this.die(`被${fish.label}吞食`);
        return;
      }

      if (getRelation(this.player.mass, fish.mass) === RELATION.NEUTRAL && this.circlesOverlapWrapped(playerBody, fishBody)) {
        this.separateBodies(playerBody, fishBody, fish);
      }
    }

    for (const item of this.specials) {
      if (!item.active) continue;
      if (item.type === "jelly" && item.cooldown <= 0) {
        const jellyBody = { x: item.x, y: item.y + item.radius * 0.25, radius: item.radius * 0.72 };
        if (this.circlesOverlapWrapped(playerBody, jellyBody)) {
          item.cooldown = 1.5;
          this.player.stunned = CONFIG.hazards.jellyfishStunSeconds;
          this.player.dashing = false;
          this.effects.burst(this.player.x, this.player.y, "#d697ff", 12, 80);
          this.effects.floatText(this.player.x, this.player.y - 30, "麻痹!", "#efc7ff", 17);
          this.effects.addShake(3);
          this.audio.play("stun");
          vibrate(25, this.save.settings);
        }
      } else if (item.type === "mine" && item.armTime <= 0 && !item.triggered) {
        const triggerCircle = { x: item.x, y: item.y, radius: item.radius * 0.78 };
        if (this.circlesOverlapWrapped(playerBody, triggerCircle)) this.triggerMine(item);
        if (!item.triggered) {
          for (const fish of this.fish) {
            if (!fish.active || fish.spawnGrace > 0) continue;
            if (this.circlesOverlapWrapped(this.bodyCircle(fish), triggerCircle)) {
              this.triggerMine(item);
              break;
            }
          }
        }
      } else if (item.type === "net" && item.warningTime <= 0) {
        const dx = CONFIG.world.wrap
          ? wrapDelta(this.player.x, item.x, CONFIG.world.width)
          : this.player.x - item.x;
        const dy = this.player.y - item.y;
        const insideX = Math.abs(dx) < item.width / 2 + playerBody.radius;
        const insideY = dy + playerBody.radius > 0 && dy - playerBody.radius < item.height;
        if (insideX && insideY) {
          this.die("被渔网捕获");
          return;
        }
      }
    }
  }

  triggerMine(item) {
    if (!item.active || item.triggered) return;
    item.triggered = true;
    item.fuseTime = 0.2;
    this.effects.floatText(item.x, item.y - item.radius, "危险!", "#ffb06b", 13);
    this.effects.addShake(2);
    this.audio.play("danger");
  }

  explodeMine(item) {
    if (!item.active) return;
    item.active = false;
    const blast = { x: item.x, y: item.y, radius: item.radius * 1.18 };
    this.effects.burst(item.x, item.y, "#ff745f", 28, 230);
    this.effects.addShake(8);
    this.audio.play("mine");
    vibrate([25, 18, 45], this.save.settings);
    for (const fish of this.fish) {
      if (fish.active && this.circlesOverlapWrapped(this.bodyCircle(fish), blast)) fish.active = false;
    }
    if (this.player.alive && this.circlesOverlapWrapped(this.bodyCircle(this.player), blast)) this.die("被水雷炸伤");
  }

  bodyCircle(entity) {
    const visual = getVisualRadius(entity.displayMass ?? entity.mass ?? 10);
    return { x: entity.x, y: entity.y, radius: visual * CONFIG.mass.collisionRadiusScale };
  }

  mouthCircle(entity) {
    const bodyRadius = getVisualRadius(entity.displayMass ?? entity.mass ?? 10) * CONFIG.mass.collisionRadiusScale;
    const mouthMultiplier = entity === this.player ? this.upgradeEffects.mouthMultiplier : 1;
    return {
      x: entity.x + Math.cos(entity.angle) * bodyRadius * CONFIG.mass.mouthOffsetScale,
      y: entity.y + Math.sin(entity.angle) * bodyRadius * CONFIG.mass.mouthOffsetScale,
      radius: bodyRadius * CONFIG.mass.mouthRadiusScale * mouthMultiplier,
    };
  }

  circlesOverlapWrapped(a, b) {
    if (!CONFIG.world.wrap) return circlesIntersect(a, b);
    const dx = wrapDelta(b.x, a.x, CONFIG.world.width);
    const dy = wrapDelta(b.y, a.y, CONFIG.world.height);
    const combined = Math.max(0, a.radius) + Math.max(0, b.radius);
    return dx * dx + dy * dy <= combined * combined;
  }

  mouthHits(predator, mouth, preyBody) {
    if (!this.circlesOverlapWrapped(mouth, preyBody)) return false;
    const offset = this.deltaTo(predator.x, predator.y, preyBody.x, preyBody.y);
    const forward = offset.x * Math.cos(predator.angle) + offset.y * Math.sin(predator.angle);
    return forward > -preyBody.radius * 0.15;
  }

  separateBodies(playerBody, fishBody, fish) {
    const offset = this.deltaTo(playerBody.x, playerBody.y, fishBody.x, fishBody.y);
    const direction = normalize(offset.x, offset.y, 1, 0);
    const overlap = playerBody.radius + fishBody.radius - direction.length;
    if (overlap <= 0) return;
    const impulse = Math.min(80, overlap * 7);
    this.player.vx -= direction.x * impulse * 0.35;
    this.player.vy -= direction.y * impulse * 0.35;
    fish.vx += direction.x * impulse * 0.65;
    fish.vy += direction.y * impulse * 0.65;
  }

  eatFish(fish) {
    fish.active = false;
    const species = SPECIES[fish.species] || SPECIES.silver;
    const preyRatio = fish.mass / this.player.mass;
    const nextCombo = updateCombo(this.combo, 0, { ate: true, preyRatio });
    const score = getEatScore(this.player.mass, fish.mass, {
      comboMultiplier: nextCombo.multiplier,
      speciesScore: species.score,
    });
    this.combo = nextCombo;
    this.score += score;
    this.player.mass += getMassGain(fish.mass, species.nutrition);
    this.metrics.eaten++;
    if (preyRatio >= 0.6) this.metrics.edgeEaten++;
    if (this.metrics.firstEatTime === null) this.metrics.firstEatTime = this.elapsed;

    const fringe = preyRatio >= 0.6;
    const gold = fish.species === "gold";
    const bait = fish.baitSchool || fish.species === "sardine";
    const color = gold ? "#ffd34d" : fringe ? "#ffcf5b" : "#79f0c5";
    const mouth = this.mouthCircle(this.player);

    if (bait) {
      this.baitFeastCount = this.baitFeastTimer > 0 ? this.baitFeastCount + 1 : 1;
      this.baitFeastTimer = CONFIG.effects.baitFeastWindowSeconds;
    }

    const suckRadiusScale = bait
      ? CONFIG.effects.baitSuckRadiusScale
      : gold
        ? CONFIG.effects.eatSuckGoldScale
        : fringe
          ? CONFIG.effects.eatSuckFringeScale
          : 1;
    const suckDurationScale = bait
      ? CONFIG.effects.baitSuckDurationScale
      : gold
        ? CONFIG.effects.eatSuckGoldScale
        : fringe
          ? CONFIG.effects.eatSuckFringeScale
          : 1;

    this.effects.suck({
      fromX: fish.x,
      fromY: fish.y,
      toX: mouth.x,
      toY: mouth.y,
      radius: getVisualRadius(fish.displayMass) * suckRadiusScale,
      color,
      angle: fish.angle,
      species: fish.species,
      tier: fish.tier,
      duration: CONFIG.feel.suckDuration * suckDurationScale,
    });

    if (bait) {
      if (this.baitFeastCount === 1 || this.baitFeastCount % CONFIG.effects.baitSplashEvery === 0) {
        this.effects.splash(fish.x, fish.y, color, CONFIG.effects.baitSplashIntensity);
      }
    } else {
      this.effects.splash(
        fish.x,
        fish.y,
        color,
        gold
          ? CONFIG.effects.eatSplashGold
          : fringe
            ? CONFIG.effects.eatSplashFringe
            : CONFIG.effects.eatSplashNormal,
      );
    }
    this.effects.burst(
      fish.x,
      fish.y,
      color,
      bait
        ? CONFIG.effects.baitBurstCount
        : gold
          ? CONFIG.effects.eatBurstGold
          : fringe
            ? CONFIG.effects.eatBurstFringe
            : CONFIG.effects.eatBurstNormal,
      gold ? 190 : bait ? 82 : 120,
      {
      shape: "scale",
      gravity: 24,
      },
    );
    this.effects.floatText(fish.x, fish.y - 18, `+${score}`, color, gold ? 21 : bait ? 12 : 15);
    if (!bait && fringe) this.effects.floatText(fish.x, fish.y - 40, gold ? "金色猎物!" : "险食!", color, 13);
    if (bait && this.baitFeastCount === CONFIG.effects.baitFeastThreshold) {
      this.effects.floatText(
        this.player.x,
        this.player.y - 48,
        `鱼群盛宴 · 连吞 x${this.baitFeastCount}`,
        "#fff0a0",
        19,
      );
    } else if (!bait && this.combo.count >= 3) {
      this.effects.floatText(this.player.x, this.player.y - 36, `${this.combo.count} 连!`, "#fff2a8", 14);
    }
    this.effects.addShake(
      bait
        ? CONFIG.effects.baitShake
        : gold
          ? CONFIG.effects.eatShakeGold
          : fringe
            ? CONFIG.effects.eatShakeFringe
            : CONFIG.effects.eatShakeNormal,
    );
    this.hitStop = Math.max(
      this.hitStop,
      bait
        ? CONFIG.effects.baitHitStop
        : gold
          ? CONFIG.feel.hitStopGold
          : fringe
            ? CONFIG.feel.hitStopFringe
            : CONFIG.feel.hitStopEat,
    );
    this.camera.punchZoom(
      bait
        ? CONFIG.effects.baitZoomPunch
        : gold
          ? CONFIG.feel.goldZoomPunch
          : fringe
            ? CONFIG.feel.fringeZoomPunch
            : CONFIG.feel.eatZoomPunch,
    );
    this.audio.play(gold || fringe ? "fringe" : "eat", { intensity: preyRatio });
    if (!bait || this.baitFeastCount % CONFIG.effects.baitSplashEvery === 0) {
      vibrate(gold ? [18, 20, 24] : fringe ? 18 : bait ? 6 : 8, this.save.settings);
    }
  }

  onTierUp(tier) {
    this.player.stamina = Math.min(this.getMaxStamina(), this.player.stamina + CONFIG.dash.tierUpRefill);
    this.metrics.tierTimes[tier.id] = this.elapsed;
    this.effects.burst(this.player.x, this.player.y, tier.accent, 28, 180, { shape: "scale", gravity: 10 });
    this.effects.splash(this.player.x, this.player.y, tier.accent, 1.2);
    this.effects.ring(this.player.x, this.player.y, tier.accent, 10, 90, 0.45, 4);
    this.effects.ring(this.player.x, this.player.y, "#ffffff", 6, 58, 0.28, 2);
    this.effects.addShake(6.5);
    this.hitStop = Math.max(this.hitStop, CONFIG.feel.hitStopTier);
    this.tierCameraTimer = 0.55;
    this.camera.setMode("tier");
    this.cameraMode = "tier";
    this.camera.punchZoom(CONFIG.feel.tierZoomPunch);
    this.audio.play("tier");
    vibrate([20, 24, 35], this.save.settings);
    this.showTierToast(`${tier.id} · ${tier.name}`);
    if (tier.index === 3) this.showMessage("水母不可食，紫色电光要避开", 2.6);
    if (tier.index === 5) this.showMessage("水雷已出现，变大也不能大意", 2.8);
    if (tier.index === 6 && this.state === STATE.PLAYING) this.beginApex();
  }

  beginApex() {
    this.state = STATE.APEX;
    this.apexRemaining = CONFIG.hazards.apexDurationSeconds;
    this.apexNetTimer = 2.5;
    this.player.invulnerable = Math.max(this.player.invulnerable, 1.2);
    this.showMessage("霸主时刻：坚持 30 秒！", 3);
    document.body.dataset.state = this.state;
  }

  updateApex(dt) {
    this.apexRemaining = Math.max(0, this.apexRemaining - dt);
    this.apexNetTimer -= dt;
    if (this.apexNetTimer <= 0) {
      if (this.activeNetCount() < 2) this.spawnApexNet();
      const progress = 1 - this.apexRemaining / CONFIG.hazards.apexDurationSeconds;
      this.apexNetTimer = 3.1 - progress * 1.15;
    }
    if (this.apexRemaining <= 0) this.showVictory();
  }

  spawnApexNet() {
    const bounds = this.camera.getVisibleWorldBounds();
    const width = Math.min(bounds.width * 0.26, 340);
    const safeSide = this.player.x < this.camera.x ? 1 : -1;
    let x = this.player.x + safeSide * (bounds.width * 0.28 + this.director.randomRange(0, bounds.width * 0.16));
    x = clamp(x, bounds.left + width / 2, bounds.right - width / 2);
    const net = createNetWarning(x, width);
    net.y = bounds.top - 70;
    this.specials.push(net);
    this.showMessage("渔网来袭", 1.2);
  }

  activeNetCount() {
    return this.specials.reduce((count, item) => count + Number(item.active && item.type === "net"), 0);
  }

  updateEndless(dt) {
    this.endlessElapsed += dt;
    this.endlessNetTimer -= dt;
    if (this.endlessNetTimer <= 0) {
      if (this.activeNetCount() < 2) this.spawnApexNet();
      this.endlessNetTimer = Math.max(1.8, 4.2 - this.endlessElapsed * 0.014);
    }
  }

  die(reason) {
    if (!this.player.alive || this.state === STATE.DYING) return;
    this.player.alive = false;
    this.player.dashing = false;
    this.deathReason = reason;
    this.state = STATE.DYING;
    this.dyingTimer = 0.85;
    this.slowMotion = 0.28;
    this.hitStop = Math.max(this.hitStop, CONFIG.feel.hitStopDeath);
    this.camera.setMode("death");
    this.cameraMode = "death";
    this.camera.punchZoom(CONFIG.feel.deathZoomPunch);
    this.effects.burst(this.player.x, this.player.y, "#ff765f", 36, 240, { shape: "scale", gravity: 40 });
    this.effects.burst(this.player.x, this.player.y, "#ffd0a8", 14, 160, { shape: "drop", gravity: -10 });
    this.effects.ring(this.player.x, this.player.y, "#ff8a72", 16, 110, 0.5, 4);
    this.effects.addShake(13);
    this.audio.play("death");
    vibrate([45, 30, 70], this.save.settings);
    this.metrics.deaths.push({ reason, time: this.elapsed, tier: this.player.tier, stamina: this.player.stamina });
    document.body.dataset.state = this.state;
  }

  showResults() {
    this.slowMotion = 1;
    const wasVictory = this.runWasVictory;
    const records = this.getRunRecords(wasVictory);
    const earned = this.commitRun(wasVictory);
    if (this.dom.resultTitle) this.dom.resultTitle.textContent = wasVictory ? "霸主远征结束" : "本局结束";
    if (this.dom.resultReason) this.dom.resultReason.textContent = this.deathReason || "完成挑战";
    if (this.dom.resultScore) this.dom.resultScore.textContent = formatNumber(this.score);
    if (this.dom.resultTier) this.dom.resultTier.textContent = getTier(this.player.displayMass).name;
    if (this.dom.resultTime) this.dom.resultTime.textContent = formatTime(this.elapsed);
    if (this.dom.resultCombo) this.dom.resultCombo.textContent = `${this.maxCombo} 连`;
    if (this.dom.resultCoins) this.dom.resultCoins.textContent = `+${earned.coins}`;
    if (this.dom.resultPearls) this.dom.resultPearls.textContent = `+${earned.pearls}`;
    if (this.dom.resultRecord) {
      this.dom.resultRecord.hidden = records.length === 0;
      this.dom.resultRecord.textContent = records.join(" · ");
    }
    this.showState(STATE.RESULTS);
  }

  showVictory() {
    if (this.state === STATE.VICTORY) return;
    this.runWasVictory = true;
    this.victoryElapsedMs ??= Math.round(this.elapsed * 1000);
    this.player.dashing = false;
    this.camera.punchZoom(CONFIG.feel.victoryZoomPunch);
    this.effects.burst(this.player.x, this.player.y, "#f7efad", 40, 200, { shape: "scale", gravity: 8 });
    this.effects.splash(this.player.x, this.player.y, "#ffe98a", 1.5);
    this.effects.ring(this.player.x, this.player.y, "#fff3b0", 18, 140, 0.6, 5);
    this.effects.ring(this.player.x, this.player.y, "#7ee7df", 10, 90, 0.4, 3);
    this.effects.addShake(8);
    if (this.dom.victoryScore) this.dom.victoryScore.textContent = formatNumber(this.score);
    if (this.dom.victoryTime) this.dom.victoryTime.textContent = formatTime(this.elapsed);
    const records = this.getRunRecords(true);
    if (this.dom.victoryRecord) {
      this.dom.victoryRecord.hidden = records.length === 0;
      this.dom.victoryRecord.textContent = records.join(" · ");
    }
    this.audio.play("victory");
    vibrate([30, 30, 30, 30, 70], this.save.settings);
    this.showState(STATE.VICTORY);
  }

  continueEndless() {
    this.runWasVictory = true;
    this.player.alive = true;
    this.player.invulnerable = 1.5;
    this.endlessElapsed = 0;
    this.endlessNetTimer = 4;
    this.showState(STATE.ENDLESS);
    this.showMessage("无尽模式：看看你能称霸多久", 2.8);
  }

  commitRun(victory) {
    if (this.runCommitted) return { coins: 0, pearls: 0 };
    const beforePearls = this.save.wallet.pearls;
    const beforeCoins = this.save.upgrades.coins;
    this.save = updateResults(this.save, createRunResult({
      score: this.score,
      elapsedSeconds: this.elapsed,
      victory,
      victoryElapsedMs: this.victoryElapsedMs,
      reachedTier: getTier(this.player.displayMass).id,
    }));
    saveSave(this.save);
    this.runCommitted = true;
    this.updateTitleStats();
    return {
      coins: this.save.upgrades.coins - beforeCoins,
      pearls: this.save.wallet.pearls - beforePearls,
    };
  }

  getRunRecords(victory) {
    return getRunRecordLabels(this.save, createRunResult({
      score: this.score,
      elapsedSeconds: this.elapsed,
      victory,
      victoryElapsedMs: this.victoryElapsedMs,
      reachedTier: getTier(this.player.displayMass).id,
    }));
  }

  pause() {
    if (![STATE.PLAYING, STATE.APEX, STATE.ENDLESS].includes(this.state)) return;
    this.previousState = this.state;
    this.input.reset();
    this.showState(STATE.PAUSED);
  }

  resume() {
    if (this.state !== STATE.PAUSED) return;
    this.showState(this.previousState);
    this.resumeCountdown = 2.35;
  }

  openSettings(fromState) {
    this.returnFromSettings = fromState;
    this.previousState = fromState === STATE.PAUSED ? this.previousState : fromState;
    this.applySettingsToUi();
    this.showState(STATE.SETTINGS);
  }

  closeSettings() {
    this.resetClearProgressPrompt();
    this.showState(this.returnFromSettings);
  }

  openShop() {
    this.updateShopUi();
    this.showState(STATE.SHOP);
  }

  closeShop() {
    this.showState(STATE.TITLE);
  }

  buyUpgrade(type) {
    const result = purchaseUpgrade(this.save.upgrades, type);
    if (!result.success) {
      this.showMessage(result.reason === "max-level" ? "这项能力已经满级" : "金币不足，再完成一局吧", 2);
      return;
    }
    this.save.upgrades = result.state;
    this.refreshUpgradeEffects();
    saveSave(this.save);
    this.updateShopUi();
    this.updateTitleStats();
    this.showMessage(`升级成功 · Lv.${result.level}`, 1.8);
  }

  refreshUpgradeEffects() {
    this.upgradeEffects = getUpgradeEffects(this.save.upgrades);
  }

  getMaxStamina() {
    return CONFIG.dash.maxStamina + this.upgradeEffects.staminaBonus;
  }

  updateShopUi() {
    if (this.dom.shopCoins) this.dom.shopCoins.textContent = formatNumber(this.save.upgrades.coins);
    const controls = {
      [UPGRADE_TYPES.SPEED]: [this.dom.shopSpeedLevel, this.dom.shopSpeedCost, this.dom.shopSpeedBuy],
      [UPGRADE_TYPES.STAMINA]: [this.dom.shopStaminaLevel, this.dom.shopStaminaCost, this.dom.shopStaminaBuy],
      [UPGRADE_TYPES.MOUTH]: [this.dom.shopMouthLevel, this.dom.shopMouthCost, this.dom.shopMouthBuy],
    };
    for (const [type, [levelOutput, costOutput, button]] of Object.entries(controls)) {
      const level = getUpgradeLevel(this.save.upgrades, type);
      const price = getNextUpgradePrice(this.save.upgrades, type);
      if (levelOutput) levelOutput.textContent = `${level} / ${MAX_UPGRADE_LEVEL}`;
      if (costOutput) costOutput.textContent = price === null ? "满级" : formatNumber(price);
      if (button) {
        button.disabled = price === null;
        button.classList.toggle("is-low-funds", price !== null && this.save.upgrades.coins < price);
        const card = button.closest("[data-upgrade-card]");
        card?.classList.toggle("is-maxed", price === null);
      }
    }
  }

  requestClearProgress() {
    const now = performance.now();
    if (now > this.clearProgressConfirmUntil) {
      this.clearProgressConfirmUntil = now + 4000;
      if (this.dom.clearProgressButton) this.dom.clearProgressButton.textContent = "再次点击确认";
      if (this.dom.clearProgressStatus) this.dom.clearProgressStatus.textContent = "4 秒内再次点击将清除纪录、珍珠和皮肤";
      window.setTimeout(() => {
        if (performance.now() >= this.clearProgressConfirmUntil) this.resetClearProgressPrompt();
      }, 4100);
      return;
    }

    this.save = clearProgress(this.save);
    this.refreshUpgradeEffects();
    this.player.stamina = Math.min(this.player.stamina, this.getMaxStamina());
    saveSave(this.save);
    this.player.skin = this.save.selectedSkin;
    this.applySettingsToUi();
    this.resetClearProgressPrompt("进度已清除，设置已保留");
    this.showMessage("本地进度已清除", 2);
  }

  resetClearProgressPrompt(status = "保留当前操控和声音设置") {
    this.clearProgressConfirmUntil = 0;
    if (this.dom.clearProgressButton) this.dom.clearProgressButton.textContent = "清除进度";
    if (this.dom.clearProgressStatus) this.dom.clearProgressStatus.textContent = status;
  }

  quitRun() {
    if (!this.runCommitted && this.elapsed > 0) this.commitRun(this.runWasVictory);
    this.goHome();
  }

  goHome() {
    this.buildTitleScene();
    this.input.reset();
    this.showState(STATE.TITLE);
    this.updateTitleStats();
  }

  showState(state) {
    this.state = state;
    document.body.dataset.state = state;
    const map = {
      [STATE.TITLE]: this.dom.titleScreen,
      [STATE.PAUSED]: this.dom.pauseScreen,
      [STATE.SETTINGS]: this.dom.settingsScreen,
      [STATE.SHOP]: this.dom.shopScreen,
      [STATE.RESULTS]: this.dom.resultsScreen,
      [STATE.VICTORY]: this.dom.victoryScreen,
    };
    for (const screen of [this.dom.titleScreen, this.dom.shopScreen, this.dom.pauseScreen, this.dom.settingsScreen, this.dom.resultsScreen, this.dom.victoryScreen]) {
      if (screen) screen.hidden = screen !== map[state];
    }
    if (this.dom.hud) this.dom.hud.hidden = ![STATE.PLAYING, STATE.APEX, STATE.ENDLESS, STATE.DYING].includes(state);
    if (this.dom.dashButton) this.dom.dashButton.hidden = ![STATE.PLAYING, STATE.APEX, STATE.ENDLESS].includes(state);
    if (this.dom.debugPanel) this.dom.debugPanel.hidden = !this.debug;
  }

  cycleSkin() {
    const currentIndex = AVAILABLE_SKINS.indexOf(this.save.selectedSkin);
    const next = AVAILABLE_SKINS[(currentIndex + 1) % AVAILABLE_SKINS.length];
    const meta = SKIN_META[next];
    if (!this.save.unlocks.skins.includes(next)) {
      if (this.save.wallet.pearls < meta.cost) {
        this.showMessage(`${meta.name} 需要 ${meta.cost} 珍珠`, 2);
        return;
      }
      this.save.wallet.pearls -= meta.cost;
      this.save.unlocks.skins.push(next);
      this.showMessage(`已解锁 ${meta.name}`, 2);
    }
    this.save.selectedSkin = next;
    this.player.skin = next;
    saveSave(this.save);
    this.updateSkinButton();
    this.updateTitleStats();
  }

  updateSkinButton() {
    if (!this.dom.skinButton) return;
    const meta = SKIN_META[this.save.selectedSkin] || SKIN_META.reef;
    const label = this.dom.skinButton.querySelector(".button-label, span:last-child");
    if (label) label.textContent = meta.name;
    else this.dom.skinButton.setAttribute("aria-label", `切换皮肤，当前${meta.name}`);
  }

  updateTitleStats() {
    if (this.dom.highScore) this.dom.highScore.textContent = formatNumber(this.save.stats.highScore);
    if (this.dom.bestClearTime) {
      this.dom.bestClearTime.textContent = this.save.stats.bestClearTimeMs === null
        ? "--:--"
        : formatTime(this.save.stats.bestClearTimeMs / 1000);
    }
    const pearlTarget = document.querySelector("[data-pearls]");
    if (pearlTarget) pearlTarget.textContent = formatNumber(this.save.wallet.pearls);
    const coinTarget = document.querySelector("[data-coins]");
    if (coinTarget) coinTarget.textContent = formatNumber(this.save.upgrades.coins);
  }

  updateHud() {
    if (this.dom.scoreValue) this.dom.scoreValue.textContent = formatNumber(this.score);
    if (this.dom.comboWrap) this.dom.comboWrap.hidden = this.combo.count < 2;
    if (this.dom.comboValue) this.dom.comboValue.textContent = `x${this.combo.multiplier.toFixed(2)}`;
    const tier = getTier(this.player.displayMass);
    if (this.dom.tierName) this.dom.tierName.textContent = `${tier.id} ${tier.name}`;
    const next = CONFIG.tiers[tier.index] || tier;
    const progress = next === tier ? 1 : clamp((this.player.displayMass - tier.threshold) / (next.threshold - tier.threshold), 0, 1);
    if (this.dom.tierProgress) this.dom.tierProgress.style.width = `${progress * 100}%`;
    const tierMeter = this.dom.tierProgress?.parentElement;
    tierMeter?.setAttribute("aria-valuenow", String(Math.round(progress * 100)));
    const staminaProgress = this.player.stamina / this.getMaxStamina();
    if (this.dom.staminaFill) this.dom.staminaFill.style.width = `${staminaProgress * 100}%`;
    this.dom.staminaFill?.parentElement?.setAttribute("aria-valuenow", String(Math.round(staminaProgress * 100)));
    if (this.dom.dashButton) {
      this.dom.dashButton.classList.toggle("is-active", this.player.dashing);
      this.dom.dashButton.classList.toggle("is-exhausted", this.player.stamina < CONFIG.dash.activationThreshold);
    }
    if (this.dom.apexWrap) this.dom.apexWrap.hidden = this.state !== STATE.APEX;
    if (this.dom.apexTime) this.dom.apexTime.textContent = this.apexRemaining.toFixed(1);
  }

  updateDebug() {
    if (!this.debug || !this.dom.debugPanel) return;
    const relationCounts = { prey: 0, neutral: 0, threat: 0 };
    for (const fish of this.fish) relationCounts[getRelation(this.player.mass, fish.mass)]++;
    const baitMembers = this.director.countBaitMembers(this);
    const baitSchools = this.director.countBaitSchools(this);
    const output = this.dom.debugPanel.querySelector("[data-debug-output]") || this.dom.debugPanel;
    output.textContent = [
      `FPS ${this.debugFps} | DPR ${this.dpr.toFixed(2)} | seed ${this.director.seed}`,
      `state ${this.state} | t ${this.elapsed.toFixed(1)}s`,
      `mass ${this.player.displayMass.toFixed(1)} -> ${this.player.mass.toFixed(1)} | T${this.player.tier}`,
      `speed ${Math.hypot(this.player.vx, this.player.vy).toFixed(0)} | stamina ${this.player.stamina.toFixed(0)}`,
      `fish ${this.fish.length} | P ${relationCounts.prey} N ${relationCounts.neutral} X ${relationCounts.threat}`,
      `bait ${baitSchools} school / ${baitMembers} fish | particles ${this.effects.particles.length}`,
      `special ${this.specials.length} | no prey ${this.director.noPreyTime.toFixed(1)}s`,
      "[ / ] 调档 · I 无敌 · ` 关闭",
    ].join("\n");
  }

  debugTier(direction) {
    const tier = getTier(this.player.mass);
    const nextIndex = clamp(tier.index - 1 + direction, 0, CONFIG.tiers.length - 1);
    this.player.mass = CONFIG.tiers[nextIndex].threshold + 0.05;
    this.player.displayMass = this.player.mass;
    this.player.tier = CONFIG.tiers[nextIndex].index;
    if (this.player.tier >= 6 && this.state === STATE.PLAYING) this.beginApex();
  }

  showMessage(message, duration = 2) {
    if (!this.dom.messageToast) return;
    this.dom.messageToast.textContent = message;
    this.dom.messageToast.hidden = false;
    this.dom.messageToast.setAttribute("aria-hidden", "false");
    this.toastTimer = duration;
  }

  showTierToast(message) {
    if (!this.dom.tierToast) return;
    const label = this.dom.tierToast.querySelector("strong") || this.dom.tierToast;
    label.textContent = message;
    this.dom.tierToast.hidden = false;
    this.dom.tierToast.setAttribute("aria-hidden", "false");
    this.tierToastTimer = 1.8;
  }

  render() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const shake = this.effects.getShake(this.save.settings.screenShake && this.state !== STATE.TITLE);
    ctx.save();
    ctx.translate(shake.x, shake.y);
    this.worldRenderer.draw(ctx, this.camera, this.time);
    this.renderSpecials(ctx);
    this.renderFish(ctx);
    this.renderPlayer(ctx);
    this.effects.drawWorld(ctx, this.camera, this.sprites);
    if (this.debug) this.renderDebugGeometry(ctx);
    ctx.restore();

    this.input.drawTouchGuide(ctx);
    if (this.resumeCountdown > 0 && !this.portraitBlocked) this.renderCountdown(ctx);
  }

  renderFish(ctx) {
    const ordered = this.fish.filter((fish) => fish.active).sort((a, b) => a.y - b.y);
    let glowBudget = this.save.settings.quality === "low"
      ? CONFIG.visuals.glowBudgetLow
      : CONFIG.visuals.glowBudgetHigh;
    const showRelationHints = ![STATE.TITLE, STATE.SHOP].includes(this.state);
    const hintDistance = this.save.settings.highContrast
      ? CONFIG.visuals.relationHintDistanceContrast
      : CONFIG.visuals.relationHintDistance;
    const threatDistance = this.save.settings.highContrast
      ? CONFIG.visuals.threatMarkerDistanceContrast
      : CONFIG.visuals.threatMarkerDistance;
    for (const fish of ordered) {
      const radius = getVisualRadius(fish.displayMass);
      if (!this.camera.isWorldPointVisible(fish.x, fish.y, radius * 2.2)) continue;
      const screen = this.camera.worldToScreen(fish.x, fish.y);
      let relation = getRelation(this.player.mass, fish.mass);
      if (this.state === STATE.APEX && relation === RELATION.THREAT) relation = RELATION.NEUTRAL;
      const distance = Math.sqrt(this.wrapDistanceSq(this.player.x, this.player.y, fish.x, fish.y));
      const ratio = fish.mass / this.player.mass;
      // Only glow nearby meaningful relations — far fish stay visually quiet.
      let relationHint = null;
      if (showRelationHints && distance < hintDistance) {
        if (relation === RELATION.THREAT) relationHint = "predator";
        else if (relation === RELATION.PREY && ratio >= 0.55) {
          relationHint = ratio >= 0.6 ? "fringe" : "prey";
        } else if (relation === RELATION.PREY && distance < hintDistance * 0.55) {
          relationHint = "prey";
        }
      }
      if (["predator", "prey", "fringe"].includes(relationHint)) {
        if (glowBudget <= 0) relationHint = null;
        else glowBudget--;
      }
      const drawRadius = radius * this.camera.zoom * (fish.species === "gold" ? 1.08 : 1);
      const depthShade = this.worldRenderer.getDepthShade(this.camera, screen.y);
      const spawnAlpha = fish.spawnGrace > 0 ? 0.58 + Math.sin(this.time * 12) * 0.18 : 1;
      this.sprites.drawFish(ctx, fish, screen, drawRadius, {
        relation: relationHint,
        highContrast: this.save.settings.highContrast,
        time: this.time,
        alpha: spawnAlpha * depthShade,
      });
      if (showRelationHints && relation === RELATION.THREAT && distance < threatDistance) {
        this.drawThreatMarker(ctx, screen, radius * this.camera.zoom, fish.spawnGrace);
      }
      if (showRelationHints && this.save.settings.highContrast && relation === RELATION.PREY && distance < threatDistance) {
        this.drawPreyMarker(ctx, screen, radius * this.camera.zoom, ratio >= 0.6);
      }
      if (fish.species === "gold") this.drawGoldMarker(ctx, screen, radius * this.camera.zoom);
    }
  }

  renderPlayer(ctx) {
    if (!this.player.alive && this.dyingTimer < 0.45) return;
    const screen = this.camera.worldToScreen(this.player.x, this.player.y);
    const radius = getVisualRadius(this.player.displayMass) * this.camera.zoom;
    const flash = this.player.invulnerable > 0 && Math.sin(this.time * 16) < -0.15 ? 0.5 : 1;
    const depthShade = this.worldRenderer.getDepthShade(this.camera, screen.y);
    this.sprites.drawFish(ctx, this.player, screen, radius, {
      isPlayer: true,
      skin: this.save.selectedSkin,
      time: this.time,
      alpha: flash * Math.max(0.55, depthShade),
    });
    if (this.player.stunned > 0) {
      ctx.fillStyle = "#e6b8ff";
      for (let i = 0; i < 3; i++) {
        const angle = this.time * 5 + i * Math.PI * 2 / 3;
        ctx.fillRect(screen.x + Math.cos(angle) * radius - 2, screen.y - radius - 8 + Math.sin(angle) * 4, 4, 4);
      }
    }
  }

  renderSpecials(ctx) {
    for (const item of this.specials) {
      if (!item.active) continue;
      if (item.type === "jelly") {
        if (!this.camera.isWorldPointVisible(item.x, item.y, item.radius * 2)) continue;
        const screen = this.camera.worldToScreen(item.x, item.y);
        this.sprites.drawJelly(ctx, screen.x, screen.y, item.radius * this.camera.zoom, this.time + item.phase);
      } else if (item.type === "mine") {
        if (!this.camera.isWorldPointVisible(item.x, item.y, item.radius * 2)) continue;
        const screen = this.camera.worldToScreen(item.x, item.y);
        this.sprites.drawMine(ctx, screen.x, screen.y, item.radius * this.camera.zoom, item.armTime <= 0, this.time + item.phase);
        if (item.triggered) this.drawMineFuse(ctx, screen, item.radius * this.camera.zoom, item.fuseTime);
      } else if (item.type === "net") {
        this.drawNet(ctx, item);
      }
    }
  }

  drawNet(ctx, net) {
    const left = this.camera.worldToScreen(net.x - net.width / 2, net.y);
    const right = this.camera.worldToScreen(net.x + net.width / 2, net.y + net.height);
    const width = right.x - left.x;
    const height = Math.max(10, right.y - left.y);
    if (net.warningTime > 0) {
      const bounds = this.camera.getVisibleWorldBounds();
      const top = this.camera.worldToScreen(net.x, bounds.top + 10);
      ctx.save();
      ctx.globalAlpha = 0.18 + Math.sin(this.time * 10) * 0.08;
      ctx.fillStyle = "#ffba64";
      ctx.fillRect(left.x, top.y, width, this.cssHeight - top.y);
      ctx.strokeStyle = "#ffd08a";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);
      ctx.strokeRect(left.x, top.y, width, this.cssHeight - top.y);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.fillStyle = "rgba(215, 224, 200, 0.38)";
    ctx.strokeStyle = "#d8cda6";
    ctx.lineWidth = Math.max(1, 2 * this.camera.zoom);
    ctx.fillRect(left.x, left.y, width, height);
    const spacing = Math.max(8, 18 * this.camera.zoom);
    for (let x = left.x; x <= left.x + width; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, left.y);
      ctx.lineTo(x, left.y + height);
      ctx.stroke();
    }
    for (let y = left.y; y <= left.y + height; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(left.x, y);
      ctx.lineTo(left.x + width, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawMineFuse(ctx, screen, radius, fuseTime) {
    const progress = clamp(1 - fuseTime / 0.2, 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.5 + Math.sin(this.time * 45) * 0.25;
    ctx.strokeStyle = "#ffb05f";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, radius * (1.15 + progress * 0.5), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawThreatMarker(ctx, screen, radius, grace) {
    ctx.save();
    ctx.translate(screen.x, screen.y - radius - 9);
    ctx.globalAlpha = grace > 0 ? 0.35 : 0.82;
    ctx.fillStyle = "#ff665f";
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(7, 5);
    ctx.lineTo(-7, 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#fff3dc";
    ctx.fillRect(-1, -3, 2, 5);
    ctx.restore();
  }

  drawGoldMarker(ctx, screen, radius) {
    const pulse = 2 + Math.sin(this.time * 5) * 1.5;
    ctx.save();
    ctx.strokeStyle = "rgba(255, 220, 83, 0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(
      screen.x,
      screen.y,
      radius + pulse + 4,
      radius * 0.72 + pulse,
      this.time * 0.6,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = "rgba(255, 245, 180, 0.9)";
    ctx.beginPath();
    ctx.ellipse(
      screen.x,
      screen.y,
      radius * 0.7 + pulse * 0.5,
      radius * 0.45 + pulse * 0.4,
      -this.time * 0.8,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
    ctx.restore();
  }

  drawPreyMarker(ctx, screen, radius, fringe) {
    ctx.save();
    ctx.translate(screen.x, screen.y - radius - 10);
    ctx.strokeStyle = fringe ? "#ffe063" : "#75f0b0";
    ctx.fillStyle = fringe ? "#ffe063" : "#75f0b0";
    ctx.lineWidth = 2;
    if (fringe) {
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-4, -4, 8, 8);
    } else {
      ctx.beginPath();
      ctx.moveTo(-6, -3);
      ctx.lineTo(0, 4);
      ctx.lineTo(6, -3);
      ctx.stroke();
    }
    ctx.restore();
  }

  renderDebugGeometry(ctx) {
    ctx.save();
    ctx.lineWidth = 1;
    for (const entity of [this.player, ...this.fish]) {
      if (!entity.active && entity !== this.player) continue;
      if (!this.camera.isWorldPointVisible(entity.x, entity.y, 80)) continue;
      const body = this.bodyCircle(entity);
      const mouth = this.mouthCircle(entity);
      const bodyScreen = this.camera.worldToScreen(body.x, body.y);
      const mouthScreen = this.camera.worldToScreen(mouth.x, mouth.y);
      ctx.strokeStyle = entity === this.player ? "#7fffd9" : "rgba(255,255,255,.5)";
      ctx.beginPath();
      ctx.arc(bodyScreen.x, bodyScreen.y, body.radius * this.camera.zoom, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "#ffd15c";
      ctx.beginPath();
      ctx.arc(mouthScreen.x, mouthScreen.y, mouth.radius * this.camera.zoom, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  renderCountdown(ctx) {
    const count = Math.max(1, Math.ceil(this.resumeCountdown));
    ctx.save();
    ctx.fillStyle = "rgba(4, 24, 34, 0.35)";
    ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "800 64px ui-monospace, monospace";
    ctx.lineWidth = 7;
    ctx.strokeStyle = "#123746";
    ctx.strokeText(String(count), this.cssWidth / 2, this.cssHeight / 2);
    ctx.fillStyle = "#ecfff7";
    ctx.fillText(String(count), this.cssWidth / 2, this.cssHeight / 2);
    ctx.restore();
  }
}

function toCamel(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function approach(current, target, maxDelta) {
  if (current < target) return Math.min(target, current + maxDelta);
  return Math.max(target, current - maxDelta);
}

function formatNumber(value) {
  return Math.max(0, Math.round(value)).toLocaleString("zh-CN");
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

new Game();
