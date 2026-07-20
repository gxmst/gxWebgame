/**
 * 世界地图与进度：纯数据 / 纯函数层。
 * 不读 DOM、不写 localStorage；区域解锁与节点进入逻辑集中于此，便于单测。
 *
 * 第一批范围：
 * - 世界等级与 highestUnlockedFloor 对齐（地牢层 = 世界等级标尺）
 * - 仅解锁第一区域「腐化林地」；其它区域灰显占位
 * - 城镇 / 野外 / 副本节点仅做导航挂载，不改战斗内核
 */

import { CONFIG } from "./config.js";

const VALID_NODE_TYPES = new Set(["town", "outdoor", "dungeon"]);
const MAX_ID_LENGTH = 64;

/**
 * 默认世界状态。新角色默认站在第一区域、已解锁林地。
 * @param {object} [options]
 * @param {number} [options.highestUnlockedFloor]
 */
export function createDefaultWorldState(options = {}) {
  const worldConfig = getWorldConfig();
  const starterRegion = worldConfig.starterRegionId || "forest";
  const worldLevel = deriveWorldLevel(options.highestUnlockedFloor);
  return {
    unlockedRegions: [starterRegion],
    currentRegionId: starterRegion,
    currentNodeId: null,
    worldLevel,
  };
}

/**
 * 清洗 / 迁移世界状态。老存档无 world 字段时，按层数映射默认解锁第一区。
 * @param {unknown} candidate
 * @param {object} [progress] 角色 progress，用于从 highestUnlockedFloor 推导
 * @param {object} [inputConfig]
 */
export function sanitizeWorldState(candidate, progress = null, inputConfig = CONFIG) {
  const worldConfig = getWorldConfig(inputConfig);
  const source = isRecord(candidate) ? candidate : {};
  const highest = readHighestFloor(progress, source);
  const defaultState = createDefaultWorldState({ highestUnlockedFloor: highest });
  const regionIds = listRegionIds(worldConfig);

  let unlockedRegions = sanitizeIdList(source.unlockedRegions, regionIds);
  if (unlockedRegions.length === 0) {
    unlockedRegions = [...defaultState.unlockedRegions];
  }
  // 第一区始终解锁，避免坏档把玩家关在地图外。
  const starter = worldConfig.starterRegionId || regionIds[0];
  if (starter && !unlockedRegions.includes(starter)) {
    unlockedRegions = [starter, ...unlockedRegions];
  }

  const currentRegionId = regionIds.includes(source.currentRegionId)
    ? source.currentRegionId
    : (unlockedRegions[0] ?? starter ?? null);

  const nodeIds = listNodeIds(worldConfig);
  const currentNodeId = nodeIds.includes(source.currentNodeId)
    ? source.currentNodeId
    : null;

  return {
    unlockedRegions,
    currentRegionId,
    currentNodeId,
    worldLevel: deriveWorldLevel(highest, inputConfig),
  };
}

/** 世界等级：与已解锁地牢层对齐（设计稿「地牢等级 ≈ 世界等级」）。 */
export function getWorldLevel(saveOrProgress, inputConfig = CONFIG) {
  const highest = readHighestFloor(saveOrProgress);
  return deriveWorldLevel(highest, inputConfig);
}

/** 区域是否已解锁。 */
export function isRegionUnlocked(worldOrSave, regionId, inputConfig = CONFIG) {
  const world = readWorld(worldOrSave, inputConfig);
  const id = safeId(regionId);
  if (!id) return false;
  return world.unlockedRegions.includes(id);
}

/** 节点是否可进入（所属区域已解锁且节点存在）。 */
export function isNodeUnlocked(worldOrSave, nodeId, inputConfig = CONFIG) {
  const node = getNode(nodeId, inputConfig);
  if (!node) return false;
  return isRegionUnlocked(worldOrSave, node.regionId, inputConfig);
}

export function getRegion(regionId, inputConfig = CONFIG) {
  const worldConfig = getWorldConfig(inputConfig);
  const id = safeId(regionId);
  if (!id) return null;
  const region = worldConfig.regions?.[id];
  return isRecord(region) ? { ...region, id: region.id || id } : null;
}

export function getNode(nodeId, inputConfig = CONFIG) {
  const worldConfig = getWorldConfig(inputConfig);
  const id = safeId(nodeId);
  if (!id) return null;
  for (const region of Object.values(worldConfig.regions || {})) {
    if (!isRecord(region) || !Array.isArray(region.nodes)) continue;
    const found = region.nodes.find((node) => node?.id === id);
    if (found) {
      return {
        ...found,
        regionId: region.id,
        regionName: region.name,
        regionEmoji: region.emoji,
      };
    }
  }
  return null;
}

/** 返回地图上应展示的区域列表（含锁定态）。 */
export function listRegions(worldOrSave, inputConfig = CONFIG) {
  const worldConfig = getWorldConfig(inputConfig);
  const world = readWorld(worldOrSave, inputConfig);
  const order = Array.isArray(worldConfig.regionOrder)
    ? worldConfig.regionOrder
    : Object.keys(worldConfig.regions || {});
  return order
    .map((id) => getRegion(id, inputConfig))
    .filter(Boolean)
    .map((region) => ({
      ...region,
      unlocked: world.unlockedRegions.includes(region.id),
      nodes: listRegionNodes(region.id, world, inputConfig),
    }));
}

/** 某区域内的节点视图模型。 */
export function listRegionNodes(regionId, worldOrSave, inputConfig = CONFIG) {
  const region = getRegion(regionId, inputConfig);
  if (!region || !Array.isArray(region.nodes)) return [];
  const unlocked = isRegionUnlocked(worldOrSave, region.id, inputConfig);
  return region.nodes
    .filter((node) => isRecord(node) && VALID_NODE_TYPES.has(node.type))
    .map((node) => ({
      ...node,
      regionId: region.id,
      unlocked,
      locked: !unlocked,
    }));
}

/**
 * 进入节点（纯函数）。成功返回 { ok, world, node }；失败带 reason。
 */
export function enterNode(worldOrSave, nodeId, inputConfig = CONFIG) {
  const world = readWorld(worldOrSave, inputConfig);
  const node = getNode(nodeId, inputConfig);
  if (!node) {
    return { ok: false, reason: "unknown-node", world, node: null };
  }
  if (!isRegionUnlocked(world, node.regionId, inputConfig)) {
    return { ok: false, reason: "region-locked", world, node };
  }
  return {
    ok: true,
    reason: null,
    world: {
      ...world,
      currentRegionId: node.regionId,
      currentNodeId: node.id,
    },
    node,
  };
}

/** 离开节点回到世界地图。 */
export function leaveToMap(worldOrSave, inputConfig = CONFIG) {
  const world = readWorld(worldOrSave, inputConfig);
  return {
    ...world,
    currentNodeId: null,
  };
}

/**
 * 根据进度同步 worldLevel（通关后调用）。
 * 第一批不解锁新区；后续批次可在此扩展 Boss → 区域解锁。
 */
export function syncWorldProgress(worldOrSave, progress, inputConfig = CONFIG) {
  const world = readWorld(worldOrSave, inputConfig);
  const highest = readHighestFloor(progress ?? worldOrSave);
  return {
    ...world,
    worldLevel: deriveWorldLevel(highest, inputConfig),
  };
}

// ─── internals ───────────────────────────────────────────────

function getWorldConfig(inputConfig = CONFIG) {
  return isRecord(inputConfig?.world) ? inputConfig.world : {};
}

function listRegionIds(worldConfig) {
  const order = Array.isArray(worldConfig.regionOrder)
    ? worldConfig.regionOrder
    : Object.keys(worldConfig.regions || {});
  return order.filter((id) => isRecord(worldConfig.regions?.[id]));
}

function listNodeIds(worldConfig) {
  const ids = [];
  for (const region of Object.values(worldConfig.regions || {})) {
    if (!isRecord(region) || !Array.isArray(region.nodes)) continue;
    for (const node of region.nodes) {
      if (isRecord(node) && typeof node.id === "string") ids.push(node.id);
    }
  }
  return ids;
}

function deriveWorldLevel(highestUnlockedFloor, inputConfig = CONFIG) {
  const minFloor = finiteInteger(inputConfig?.dungeon?.minFloor, 1);
  const maxFloor = Math.max(minFloor, finiteInteger(inputConfig?.dungeon?.maxFloor, minFloor));
  return clampInteger(highestUnlockedFloor, minFloor, maxFloor, minFloor);
}

function readHighestFloor(source, fallbackSource = null) {
  if (Number.isFinite(source)) return Math.floor(source);
  if (!isRecord(source)) {
    return isRecord(fallbackSource)
      ? readHighestFloor(fallbackSource)
      : finiteInteger(CONFIG.dungeon?.minFloor, 1);
  }
  if (isRecord(source.progress)) {
    return readHighestFloor(source.progress, fallbackSource);
  }
  const raw = source.highestUnlockedFloor
    ?? source.worldLevel
    ?? fallbackSource?.highestUnlockedFloor
    ?? fallbackSource?.worldLevel
    ?? CONFIG.dungeon?.minFloor;
  return clampInteger(raw, 1, Number.MAX_SAFE_INTEGER, 1);
}

function readWorld(worldOrSave, inputConfig = CONFIG) {
  if (isRecord(worldOrSave?.world)) {
    return sanitizeWorldState(worldOrSave.world, worldOrSave.progress ?? worldOrSave, inputConfig);
  }
  if (isRecord(worldOrSave) && Array.isArray(worldOrSave.unlockedRegions)) {
    return sanitizeWorldState(worldOrSave, worldOrSave, inputConfig);
  }
  return sanitizeWorldState(null, worldOrSave, inputConfig);
}

function sanitizeIdList(value, allowedIds) {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(allowedIds);
  const result = [];
  for (const entry of value) {
    const id = safeId(entry);
    if (id && allowed.has(id) && !result.includes(id)) result.push(id);
  }
  return result;
}

function safeId(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().slice(0, MAX_ID_LENGTH);
  return trimmed;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(number)));
}
