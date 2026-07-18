import { APP_VERSION } from "./version.js";
import "./game.js";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function isLocalDevelopment() {
  return (
    location.protocol === "file:" ||
    LOCAL_HOSTNAMES.has(location.hostname) ||
    location.hostname.endsWith(".localhost")
  );
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || isLocalDevelopment()) return;

  const scriptUrl = new URL("../sw.js", import.meta.url);
  const scopeUrl = new URL("../", import.meta.url);
  scriptUrl.searchParams.set("v", APP_VERSION);

  try {
    await navigator.serviceWorker.register(scriptUrl, {
      type: "module",
      scope: scopeUrl.pathname,
    });
  } catch (error) {
    console.warn("Service Worker registration failed.", error);
  }
}

if (document.readyState === "complete") {
  void registerServiceWorker();
} else {
  window.addEventListener("load", registerServiceWorker, { once: true });
}
