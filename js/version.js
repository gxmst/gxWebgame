/** Release version shared by the page bootstrap and service worker. */
export const APP_VERSION = "6.0.0";

export const CACHE_PREFIX = "gxwebgame";
export const PRECACHE_CACHE_NAME = `${CACHE_PREFIX}-precache-v${APP_VERSION}`;
export const RUNTIME_CACHE_NAME = `${CACHE_PREFIX}-runtime-v${APP_VERSION}`;

/** Files required to launch and play offline after the first successful visit. */
export const PRECACHE_URLS = Object.freeze([
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./assets/bg-ocean.jpg",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./js/bootstrap.js",
  "./js/version.js",
  "./js/game.js",
  "./js/audio.js",
  "./js/biomes.js",
  "./js/camera.js",
  "./js/config.js",
  "./js/cosmetics.js",
  "./js/day-night.js",
  "./js/difficulty.js",
  "./js/director.js",
  "./js/effects.js",
  "./js/entities.js",
  "./js/environment.js",
  "./js/game-state.js",
  "./js/hazards.js",
  "./js/input.js",
  "./js/math.js",
  "./js/quality.js",
  "./js/rules.js",
  "./js/run-builds.js",
  "./js/run.js",
  "./js/save.js",
  "./js/sovereign-goals.js",
  "./js/sprites.js",
  "./js/telemetry.js",
  "./js/upgrades.js",
  "./js/world.js",
]);
