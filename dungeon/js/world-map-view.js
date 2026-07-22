/**
 * 世界地图 SVG 沉浸视图（纯表现层）。
 * - 只读 world 区域/节点/解锁状态，不改存档与战斗。
 * - 提供可测试的布局纯函数 + SVG 字符串渲染。
 * - 视图模式 map|list 由调用方经 settings 记忆。
 */

import { CONFIG } from "./config.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const DEFAULT_VIEW_BOX = Object.freeze([0, 0, 1000, 560]);
const NODE_TYPE_LABELS = Object.freeze({
  town: "城镇",
  outdoor: "野外",
  dungeon: "副本",
});

/** 规范化视图偏好：仅 map / list。 */
export function sanitizeWorldMapViewMode(value) {
  return value === "list" ? "list" : "map";
}

/** 读取 config.world.map，缺省时给出可用空布局。 */
export function getWorldMapLayout(inputConfig = CONFIG) {
  const world = isRecord(inputConfig?.world) ? inputConfig.world : {};
  const map = isRecord(world.map) ? world.map : {};
  const viewBox = normalizeViewBox(map.viewBox);
  const edges = Array.isArray(map.edges)
    ? map.edges
      .filter((pair) => Array.isArray(pair) && pair.length >= 2)
      .map((pair) => [String(pair[0]), String(pair[1])])
    : [];
  const regionShapes = isRecord(map.regionShapes) ? map.regionShapes : {};
  const decorations = Array.isArray(map.decorations)
    ? map.decorations.filter(isRecord).map((entry) => ({
      emoji: String(entry.emoji ?? "·"),
      kind: safeToken(entry.kind),
      x: finiteNumber(entry.x, viewBox[2] * 0.5),
      y: finiteNumber(entry.y, viewBox[3] * 0.5),
      size: clamp(finiteNumber(entry.size, 1), 0.5, 3),
      rotation: finiteNumber(entry.rotation, 0),
      opacity: clamp(finiteNumber(entry.opacity, 0.55), 0.08, 1),
    }))
    : [];
  return { viewBox, edges, regionShapes, decorations };
}

/**
 * 节点在 SVG 坐标系中的位置。
 * 优先 mapX/mapY；否则把 0–100 的 x/y 映射进 viewBox。
 */
export function resolveNodeMapPoint(node, viewBox = DEFAULT_VIEW_BOX) {
  const box = normalizeViewBox(viewBox);
  const [, , width, height] = box;
  if (!isRecord(node)) {
    return { x: width * 0.5, y: height * 0.5 };
  }
  if (Number.isFinite(Number(node.mapX)) && Number.isFinite(Number(node.mapY))) {
    return {
      x: clamp(Number(node.mapX), 0, width),
      y: clamp(Number(node.mapY), 0, height),
    };
  }
  const xRatio = Number.isFinite(Number(node.x)) ? Number(node.x) / 100 : 0.5;
  const yRatio = Number.isFinite(Number(node.y)) ? Number(node.y) / 100 : 0.5;
  return {
    x: clamp(xRatio * width, 0, width),
    y: clamp(yRatio * height, 0, height),
  };
}

/**
 * 把 listRegions 结果 + 当前世界状态整理成地图渲染模型（纯数据）。
 * @param {object[]} regions listRegions() 输出
 * @param {object} world 含 currentNodeId / currentRegionId / worldLevel
 * @param {object} [inputConfig]
 */
export function buildWorldMapModel(regions, world = {}, inputConfig = CONFIG) {
  const layout = getWorldMapLayout(inputConfig);
  const regionList = Array.isArray(regions) ? regions : [];
  const currentNodeId = typeof world.currentNodeId === "string" ? world.currentNodeId : null;
  const currentRegionId = typeof world.currentRegionId === "string"
    ? world.currentRegionId
    : null;

  const nodeById = new Map();
  const renderRegions = regionList.map((region) => {
    const shape = layout.regionShapes[region.id] ?? null;
    const nodes = (Array.isArray(region.nodes) ? region.nodes : []).map((node) => {
      const point = resolveNodeMapPoint(node, layout.viewBox);
      const entry = {
        ...node,
        mapX: point.x,
        mapY: point.y,
        regionId: region.id,
        regionName: region.name,
        unlocked: region.unlocked === true && node.locked !== true,
        isCurrent: node.id === currentNodeId,
      };
      nodeById.set(node.id, entry);
      return entry;
    });
    return {
      id: region.id,
      name: region.name,
      emoji: region.emoji,
      theme: region.theme,
      description: region.description,
      unlockHint: region.unlockHint,
      worldLevelRange: region.worldLevelRange,
      unlocked: region.unlocked === true,
      isCurrent: region.id === currentRegionId,
      shape,
      nodes,
    };
  });

  const edges = layout.edges.map(([fromId, toId]) => {
    const from = nodeById.get(fromId);
    const to = nodeById.get(toId);
    if (!from || !to) return null;
    const bothUnlocked = from.unlocked && to.unlocked;
    const lit = bothUnlocked && (
      from.isCurrent || to.isCurrent
      || from.id === currentNodeId
      || to.id === currentNodeId
    );
    // 两端均在已解锁区域 → 路径可见；与当前节点相连 → 点亮。
    const visited = bothUnlocked;
    return {
      fromId,
      toId,
      from,
      to,
      visible: bothUnlocked,
      lit: lit || visited,
      d: curvePath(from.mapX, from.mapY, to.mapX, to.mapY),
    };
  }).filter(Boolean);

  return {
    viewBox: layout.viewBox,
    regions: renderRegions,
    edges,
    decorations: layout.decorations,
    currentNodeId,
    currentRegionId,
    worldLevel: Number.isFinite(Number(world.worldLevel))
      ? Number(world.worldLevel)
      : 1,
  };
}

/**
 * 生成完整 SVG 标记字符串（无事件）。
 * 节点带 data-world-node / role / tabindex / aria-label，供 UI 绑定。
 */
export function renderWorldMapSvgMarkup(model, options = {}) {
  const map = isRecord(model) ? model : buildWorldMapModel([], {});
  const [minX, minY, width, height] = normalizeViewBox(map.viewBox);
  const reducedMotion = options.reducedMotion === true;
  const english = options.language === "en-US" || options.language === "en";
  const text = (zh, en) => english ? en : zh;
  const nodeTypeLabels = english ? { town: "Town", outdoor: "Outdoor", dungeon: "Dungeon" } : NODE_TYPE_LABELS;
  const regions = Array.isArray(map.regions) ? map.regions : [];
  const edges = Array.isArray(map.edges) ? map.edges : [];
  const decorations = Array.isArray(map.decorations) ? map.decorations : [];

  const regionLayer = regions.map((region) => {
    const shape = region.shape;
    if (!shape?.path) return "";
    const unlocked = region.unlocked;
    const currentClass = region.isCurrent ? " is-current-region" : "";
    const lockClass = unlocked ? "" : " is-locked-region";
    const label = shape.label || { x: width * 0.5, y: height * 0.5 };
    const range = Array.isArray(region.worldLevelRange)
      ? `${text("世界", "World")} ${region.worldLevelRange[0]}–${region.worldLevelRange[1] ?? region.worldLevelRange[0]}`
      : "";
    const themeClass = ` theme-${safeToken(region.id || region.theme) || "unknown"}`;
    const knownGradient = ["forest", "desert", "abyss", "void"].includes(region.id)
      ? `url(#wm-region-${region.id})`
      : (shape.fill || "#222");
    return `
      <g class="wm-region${themeClass}${currentClass}${lockClass}" data-region-id="${escapeAttr(region.id)}" aria-hidden="true">
        <path class="wm-region-shadow" d="${escapeAttr(shape.path)}" />
        <path class="wm-region-fill" d="${escapeAttr(shape.path)}" fill="${escapeAttr(knownGradient)}" stroke="${escapeAttr(shape.stroke || "#444")}" stroke-width="2" />
        <path class="wm-region-texture" d="${escapeAttr(shape.path)}" fill="url(#wm-terrain-${["forest", "desert", "abyss", "void"].includes(region.id) ? region.id : "generic"})" />
        <path class="wm-region-rim" d="${escapeAttr(shape.path)}" />
        ${unlocked ? "" : `<path class="wm-region-fog" d="${escapeAttr(shape.path)}" />`}
        <text class="wm-region-label" x="${finiteNumber(label.x, 0)}" y="${finiteNumber(label.y, 0)}" text-anchor="middle">
          <tspan class="wm-region-title" x="${finiteNumber(label.x, 0)}" dy="0">${escapeXml(region.emoji || "")} ${escapeXml(region.name || region.id)}</tspan>
          <tspan class="wm-region-sub" x="${finiteNumber(label.x, 0)}" dy="16">${escapeXml(unlocked ? range : text("未解锁", "Locked"))}</tspan>
        </text>
        ${unlocked ? "" : `<text class="wm-region-mystery" x="${finiteNumber(label.x, 0)}" y="${finiteNumber(label.y, 0) + 36}" text-anchor="middle">?</text>`}
      </g>`;
  }).join("");

  const edgeLayer = edges.filter((edge) => edge.visible).map((edge) => `
    <g class="wm-road" data-edge-from="${escapeAttr(edge.fromId)}" data-edge-to="${escapeAttr(edge.toId)}">
      <path class="wm-edge-shadow" d="${escapeAttr(edge.d)}" fill="none" />
      <path class="wm-edge ${edge.lit ? "is-lit" : ""} ${reducedMotion ? "no-flow" : ""}" d="${escapeAttr(edge.d)}" fill="none" />
    </g>`).join("");

  const decorLayer = decorations.map(renderMapDecoration).join("");

  const nodeLayer = regions.flatMap((region) => region.nodes.map((node) => {
    const typeLabel = nodeTypeLabels[node.type] || text("地点", "Location");
    const range = Array.isArray(region.worldLevelRange)
      ? `${text("推荐世界", "Recommended World")} ${region.worldLevelRange[0]}+`
      : "";
    const state = node.unlocked
      ? (node.isCurrent ? text("当前位置", "Current Location") : text("可进入", "Available"))
      : text("未解锁", "Locked");
    const aria = `${node.name || node.id}，${typeLabel}，${state}${range ? `，${range}` : ""}`;
    const typeClass = `type-${node.type || "node"}`;
    const currentClass = node.isCurrent ? " is-current" : "";
    const lockedClass = node.unlocked ? "" : " is-locked";
    const labelWidth = clamp(String(node.name || node.id).length * 11 + 18, 54, 112);
    return `
      <g
        class="wm-node ${typeClass}${currentClass}${lockedClass}"
        transform="translate(${node.mapX}, ${node.mapY})"
        role="button"
        tabindex="${node.unlocked ? "0" : "-1"}"
        data-world-node="${escapeAttr(node.id)}"
        data-node-type="${escapeAttr(node.type || "node")}"
        data-node-name="${escapeAttr(node.name || node.id)}"
        data-node-desc="${escapeAttr(node.description || "")}"
        data-node-unlocked="${node.unlocked ? "1" : "0"}"
        data-node-region="${escapeAttr(region.name || region.id)}"
        data-node-range="${escapeAttr(range)}"
        aria-label="${escapeAttr(aria)}"
        aria-disabled="${node.unlocked ? "false" : "true"}"
      >
        ${node.isCurrent ? `<circle class="wm-node-pulse" r="25" />` : ""}
        <circle class="wm-node-glow" r="22" />
        <circle class="wm-node-ring" r="17" />
        <circle class="wm-node-disc" r="13" />
        <text class="wm-node-emoji" text-anchor="middle" dominant-baseline="central" dy="1">${escapeXml(node.emoji || "◆")}</text>
        <rect class="wm-node-label-bg" x="${-labelWidth / 2}" y="22" width="${labelWidth}" height="18" rx="6" />
        <text class="wm-node-caption" text-anchor="middle" y="34">${escapeXml(node.name || node.id)}</text>
        ${node.isCurrent ? `<text class="wm-node-you" text-anchor="middle" y="-29">◆ ${text("当前位置", "YOU ARE HERE")}</text>` : ""}
      </g>`;
  })).join("");

  return `
<svg
  class="world-map-svg ${reducedMotion ? "is-reduced-motion" : ""}"
  viewBox="${minX} ${minY} ${width} ${height}"
  preserveAspectRatio="xMidYMid meet"
  role="img"
  aria-label="${text("世界地图", "World Map")}"
  focusable="false"
>
  <defs>
    <filter id="wm-parchment" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch" result="noise" />
      <feColorMatrix type="matrix" values="0 0 0 0 0.12  0 0 0 0 0.09  0 0 0 0 0.06  0 0 0 0.35 0" in="noise" result="tint" />
      <feBlend in="SourceGraphic" in2="tint" mode="multiply" />
    </filter>
    <filter id="wm-fog-blur" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur stdDeviation="4" />
    </filter>
    <radialGradient id="wm-vignette" cx="50%" cy="50%" r="65%">
      <stop offset="55%" stop-color="rgba(0,0,0,0)" />
      <stop offset="100%" stop-color="rgba(0,0,0,0.55)" />
    </radialGradient>
    <linearGradient id="wm-paper" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#2a2218" />
      <stop offset="40%" stop-color="#1a1612" />
      <stop offset="100%" stop-color="#12100e" />
    </linearGradient>
    <linearGradient id="wm-edge-lit" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#8a7040" />
      <stop offset="50%" stop-color="#e0c070" />
      <stop offset="100%" stop-color="#8a7040" />
    </linearGradient>
    <linearGradient id="wm-region-forest" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#294b31"/><stop offset="55%" stop-color="#173321"/><stop offset="100%" stop-color="#0f2419"/></linearGradient>
    <linearGradient id="wm-region-desert" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#7a5a2e"/><stop offset="58%" stop-color="#4e351c"/><stop offset="100%" stop-color="#2f2418"/></linearGradient>
    <linearGradient id="wm-region-abyss" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#542329"/><stop offset="60%" stop-color="#2d151a"/><stop offset="100%" stop-color="#190f13"/></linearGradient>
    <linearGradient id="wm-region-void" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#392653"/><stop offset="55%" stop-color="#20162e"/><stop offset="100%" stop-color="#100b18"/></linearGradient>
    <pattern id="wm-terrain-forest" width="34" height="28" patternUnits="userSpaceOnUse"><path d="M6 24l6-14 6 14M12 10V4M24 25l4-9 4 9" fill="none" stroke="#91b27d" stroke-width="1" opacity=".16"/></pattern>
    <pattern id="wm-terrain-desert" width="42" height="28" patternUnits="userSpaceOnUse"><path d="M0 18q11-9 22 0t22 0M-8 27q11-9 22 0t22 0" fill="none" stroke="#e0b568" stroke-width="1.2" opacity=".18"/></pattern>
    <pattern id="wm-terrain-abyss" width="34" height="34" patternUnits="userSpaceOnUse"><path d="M4 30L17 4l13 26M10 30l7-15 7 15" fill="none" stroke="#b95b63" stroke-width="1" opacity=".14"/></pattern>
    <pattern id="wm-terrain-void" width="38" height="38" patternUnits="userSpaceOnUse"><circle cx="8" cy="9" r="1.2" fill="#c8a7ee" opacity=".22"/><circle cx="28" cy="25" r=".8" fill="#c8a7ee" opacity=".18"/><path d="M0 36L36 0" stroke="#9472bd" opacity=".08"/></pattern>
    <pattern id="wm-terrain-generic" width="36" height="36" patternUnits="userSpaceOnUse"><path d="M0 18h36M18 0v36" stroke="#fff" opacity=".04"/></pattern>
    <pattern id="wm-map-grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0H0V50" fill="none" stroke="#d6bd87" stroke-width=".6" opacity=".055"/></pattern>
    <filter id="wm-node-shadow" x="-80%" y="-80%" width="260%" height="260%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity=".75"/></filter>
  </defs>

  <g class="wm-layer-bg" aria-hidden="true">
    <rect class="wm-paper" x="${minX}" y="${minY}" width="${width}" height="${height}" fill="url(#wm-paper)" filter="url(#wm-parchment)" />
    <rect class="wm-map-grid" x="${minX}" y="${minY}" width="${width}" height="${height}" fill="url(#wm-map-grid)" />
    <rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="url(#wm-vignette)" />
    <path class="wm-map-frame" d="M18,18 H982 V542 H18 Z" />
    <path class="wm-map-frame-inner" d="M27,27 H973 V533 H27 Z" />
    <g class="wm-map-cartouche"><rect x="42" y="34" width="220" height="44" rx="8"/><text x="58" y="54">${text("灰烬大陆", "ASHEN REALMS")}</text><text class="wm-map-cartouche-sub" x="58" y="68">${text("ASHEN REALMS · 探索地图", "WORLD EXPLORATION MAP")}</text></g>
    <g class="wm-compass" transform="translate(930 484)"><circle r="30"/><path d="M0-25L7-5 0 0-7-5Z M0 25L7 5 0 0-7 5Z"/><path class="wm-compass-cross" d="M-22 0H22M0-22V22"/><text y="-34" text-anchor="middle">N</text></g>
  </g>

  <g class="wm-layer-regions">${regionLayer}</g>
  <g class="wm-layer-edges" aria-hidden="true">${edgeLayer}</g>
  <g class="wm-layer-decor" aria-hidden="true">${decorLayer}</g>
  <g class="wm-layer-nodes">${nodeLayer}</g>
</svg>`.trim();
}

/**
 * 把 SVG 写入容器并绑定键盘/焦点辅助（点击由 document 委托 data-world-node）。
 * @returns {{ root: Element|null, destroy: Function }}
 */
export function mountWorldMapSvg(container, model, options = {}) {
  if (!container) return { root: null, destroy() {} };
  const markup = renderWorldMapSvgMarkup(model, options);
  container.innerHTML = markup;
  const root = container.querySelector("svg.world-map-svg");
  if (!root) return { root: null, destroy() {} };

  const onKeyDown = (event) => {
    const node = event.target?.closest?.("[data-world-node]");
    if (!node || !root.contains(node)) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (node.getAttribute("data-node-unlocked") !== "1") return;
    node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  };
  root.addEventListener("keydown", onKeyDown);

  return {
    root,
    destroy() {
      root.removeEventListener("keydown", onKeyDown);
    },
  };
}

/** 手绘感二次贝塞尔：中点加一点垂直偏移。 */
export function curvePath(x1, y1, x2, y2) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const offset = Math.min(36, len * 0.18);
  const cx = mx - (dy / len) * offset;
  const cy = my + (dx / len) * offset;
  return `M${round(x1)},${round(y1)} Q${round(cx)},${round(cy)} ${round(x2)},${round(y2)}`;
}

// ─── internals ───────────────────────────────────────────────

function normalizeViewBox(value) {
  if (Array.isArray(value) && value.length >= 4) {
    return [
      finiteNumber(value[0], 0),
      finiteNumber(value[1], 0),
      Math.max(1, finiteNumber(value[2], 1000)),
      Math.max(1, finiteNumber(value[3], 620)),
    ];
  }
  if (typeof value === "string") {
    const parts = value.trim().split(/[\s,]+/).map(Number);
    if (parts.length >= 4 && parts.every(Number.isFinite)) {
      return normalizeViewBox(parts);
    }
  }
  return [...DEFAULT_VIEW_BOX];
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeToken(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function renderMapDecoration(item) {
  if (!isRecord(item)) return "";
  const kind = safeToken(item.kind) || "mark";
  const x = round(finiteNumber(item.x, 0));
  const y = round(finiteNumber(item.y, 0));
  const size = round(clamp(finiteNumber(item.size, 1), 0.5, 3));
  const rotation = round(finiteNumber(item.rotation, 0));
  const opacity = round(clamp(finiteNumber(item.opacity, 0.55), 0.08, 1));
  const transform = `translate(${x} ${y}) rotate(${rotation}) scale(${size})`;

  const drawings = {
    tree: `
      <path class="wm-decor-shadow" d="M-13 12 Q0 18 13 12 Q4 9-3 10Z" />
      <path class="wm-decor-trunk" d="M-2 12L-1-5H2L3 12Z" />
      <path class="wm-decor-fill" d="M0-20L-12-5H-6L-15 5H-6L-12 13H12L6 5H15L6-5H12Z" />`,
    mountain: `
      <path class="wm-decor-shadow" d="M-21 12Q0 18 22 12L12 7-10 7Z" />
      <path class="wm-decor-fill" d="M-22 12L-7-10L0-1L8-17L23 12Z" />
      <path class="wm-decor-detail" d="M-7-10L-2-3 1-7 5-4 8-17 14-5 10-7 7 1 2 5-1 0-6 3-11 0Z" />`,
    dune: `
      <path class="wm-decor-shadow" d="M-23 10Q0 17 24 10L17 6-12 5Z" />
      <path class="wm-decor-fill" d="M-24 9Q-8-7 8 2Q16 7 24 9Q8 4-2 11Q-13 16-24 9Z" />
      <path class="wm-decor-detail" d="M-17 7Q-7 1 2 5M4 3Q11 1 18 7" />`,
    ruin: `
      <path class="wm-decor-shadow" d="M-19 13Q0 18 20 13L12 8-12 8Z" />
      <path class="wm-decor-fill" d="M-15 11V-8H-9V-14H-4V11H2V-5H8V-10H13V11Z" />
      <path class="wm-decor-detail" d="M-15-8H-4M2-5H13M-10-2h2m14 3h3" />`,
    skull: `
      <path class="wm-decor-shadow" d="M-16 12Q0 17 16 12L8 7-9 7Z" />
      <path class="wm-decor-fill" d="M-11-2Q-10-15 0-16Q10-15 11-2Q10 5 6 7V12H2V8H-2V12H-6V7Q-10 4-11-2Z" />
      <path class="wm-decor-cutout" d="M-7-3Q-4-7-1-3Q-2 2-6 1ZM7-3Q4-7 1-3Q2 2 6 1ZM-2 4L0 1 2 4Z" />`,
    camp: `
      <path class="wm-decor-shadow" d="M-17 13Q0 18 17 13L9 8-10 8Z" />
      <path class="wm-decor-detail" d="M-11 11L10-8M11 11L-10-8" />
      <path class="wm-decor-flame" d="M0 10Q-9 4-3-4Q-2 2 1-7Q9 2 5 8Q3 12 0 10Z" />`,
  };
  const drawing = drawings[kind];
  if (drawing) {
    return `<g class="wm-decor wm-decor-${kind}" transform="${transform}" opacity="${opacity}">${drawing}</g>`;
  }
  return `<text class="wm-decor wm-decor-mark" x="${x}" y="${y}" font-size="${round(14 * size)}" opacity="${opacity}" transform="rotate(${rotation} ${x} ${y})">${escapeXml(item.emoji || "·")}</text>`;
}

function escapeAttr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// 避免未使用导入警告：SVG_NS 预留给将来 createElementNS 路径
void SVG_NS;
