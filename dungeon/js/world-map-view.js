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
      x: finiteNumber(entry.x, viewBox[2] * 0.5),
      y: finiteNumber(entry.y, viewBox[3] * 0.5),
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
      ? `世界 ${region.worldLevelRange[0]}–${region.worldLevelRange[1] ?? region.worldLevelRange[0]}`
      : "";
    return `
      <g class="wm-region${currentClass}${lockClass}" data-region-id="${escapeAttr(region.id)}" aria-hidden="true">
        <path class="wm-region-fill" d="${escapeAttr(shape.path)}" fill="${escapeAttr(shape.fill || "#222")}" stroke="${escapeAttr(shape.stroke || "#444")}" stroke-width="2" />
        ${unlocked ? "" : `<path class="wm-region-fog" d="${escapeAttr(shape.path)}" />`}
        <text class="wm-region-label" x="${finiteNumber(label.x, 0)}" y="${finiteNumber(label.y, 0)}" text-anchor="middle">
          <tspan class="wm-region-title" x="${finiteNumber(label.x, 0)}" dy="0">${escapeXml(region.emoji || "")} ${escapeXml(region.name || region.id)}</tspan>
          <tspan class="wm-region-sub" x="${finiteNumber(label.x, 0)}" dy="16">${escapeXml(unlocked ? range : (region.unlockHint || "未解锁"))}</tspan>
        </text>
        ${unlocked ? "" : `<text class="wm-region-mystery" x="${finiteNumber(label.x, 0)}" y="${finiteNumber(label.y, 0) + 36}" text-anchor="middle">?</text>`}
      </g>`;
  }).join("");

  const edgeLayer = edges.filter((edge) => edge.visible).map((edge) => `
    <path
      class="wm-edge ${edge.lit ? "is-lit" : ""} ${reducedMotion ? "no-flow" : ""}"
      d="${escapeAttr(edge.d)}"
      fill="none"
      data-edge-from="${escapeAttr(edge.fromId)}"
      data-edge-to="${escapeAttr(edge.toId)}"
    />`).join("");

  const decorLayer = decorations.map((item) => `
    <text class="wm-decor" x="${item.x}" y="${item.y}" text-anchor="middle" aria-hidden="true">${escapeXml(item.emoji)}</text>
  `).join("");

  const nodeLayer = regions.flatMap((region) => region.nodes.map((node) => {
    const typeLabel = NODE_TYPE_LABELS[node.type] || "地点";
    const range = Array.isArray(region.worldLevelRange)
      ? `推荐世界 ${region.worldLevelRange[0]}+`
      : "";
    const state = node.unlocked
      ? (node.isCurrent ? "当前位置" : "可进入")
      : "未解锁";
    const aria = `${node.name || node.id}，${typeLabel}，${state}${range ? `，${range}` : ""}`;
    const typeClass = `type-${node.type || "node"}`;
    const currentClass = node.isCurrent ? " is-current" : "";
    const lockedClass = node.unlocked ? "" : " is-locked";
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
        ${node.isCurrent ? `<circle class="wm-node-pulse" r="22" />` : ""}
        <circle class="wm-node-glow" r="18" />
        <circle class="wm-node-disc" r="14" />
        <text class="wm-node-emoji" text-anchor="middle" dominant-baseline="central" dy="1">${escapeXml(node.emoji || "◆")}</text>
        <text class="wm-node-caption" text-anchor="middle" y="28">${escapeXml(node.name || node.id)}</text>
        ${node.isCurrent ? `<text class="wm-node-you" text-anchor="middle" y="-26">▼ 你在这里</text>` : ""}
      </g>`;
  })).join("");

  return `
<svg
  class="world-map-svg ${reducedMotion ? "is-reduced-motion" : ""}"
  viewBox="${minX} ${minY} ${width} ${height}"
  preserveAspectRatio="xMidYMid meet"
  role="img"
  aria-label="世界地图"
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
  </defs>

  <g class="wm-layer-bg" aria-hidden="true">
    <rect class="wm-paper" x="${minX}" y="${minY}" width="${width}" height="${height}" fill="url(#wm-paper)" filter="url(#wm-parchment)" />
    <rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="url(#wm-vignette)" />
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
