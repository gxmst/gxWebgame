/**
 * 材料目录与显示名：纯数据 / 纯函数。
 * 任何 UI 展示材料时必须走 getMaterialMeta / formatMaterialAmount，
 * 禁止直接把 id 渲染到界面。
 */

import { CONFIG } from "./config.js";

const MAX_ID_LENGTH = 64;
const MAX_AMOUNT = Number.MAX_SAFE_INTEGER;

/** 材料元数据：至少有中文 name。 */
export function getMaterialMeta(materialId, inputConfig = CONFIG) {
  const id = safeId(materialId);
  if (!id) {
    return { id: "", name: "未知材料", emoji: "📦", description: "" };
  }
  const catalog = getCatalog(inputConfig);
  const entry = catalog[id];
  if (isRecord(entry)) {
    return {
      id,
      name: String(entry.name || fallbackName(id)).slice(0, 40),
      emoji: String(entry.emoji || "📦").slice(0, 8),
      description: String(entry.description || "").slice(0, 200),
    };
  }
  // 未知 id 也绝不裸奔：用可读中文兜底，并保留 id 供调试但不直接展示。
  return {
    id,
    name: fallbackName(id),
    emoji: "📦",
    description: "",
    unknown: true,
  };
}

export function getMaterialName(materialId, inputConfig = CONFIG) {
  return getMaterialMeta(materialId, inputConfig).name;
}

/** 「荒野精华 ×3」 */
export function formatMaterialAmount(materialId, amount, inputConfig = CONFIG) {
  const meta = getMaterialMeta(materialId, inputConfig);
  const qty = clampInteger(amount, 0, MAX_AMOUNT, 0);
  return `${meta.name} ×${qty}`;
}

/** 芯片文案：「✨ 荒野精华 ×3」 */
export function formatMaterialChip(materialId, amount, inputConfig = CONFIG) {
  const meta = getMaterialMeta(materialId, inputConfig);
  const qty = clampInteger(amount, 0, MAX_AMOUNT, 0);
  return `${meta.emoji} ${meta.name} ×${qty}`;
}

export function listOwnedMaterials(materials, inputConfig = CONFIG) {
  const source = isRecord(materials) ? materials : {};
  const rows = [];
  for (const [id, amount] of Object.entries(source)) {
    const qty = clampInteger(amount, 0, MAX_AMOUNT, 0);
    if (qty <= 0) continue;
    const meta = getMaterialMeta(id, inputConfig);
    rows.push({ ...meta, amount: qty });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  return rows;
}

export function sanitizeMaterialsMap(candidate) {
  const source = isRecord(candidate) ? candidate : {};
  const materials = {};
  for (const [id, amount] of Object.entries(source)) {
    const cleanId = safeId(id);
    const cleanAmount = clampInteger(amount, 0, MAX_AMOUNT, 0);
    if (cleanId && cleanAmount > 0) materials[cleanId] = cleanAmount;
  }
  return materials;
}

export function addMaterials(current, gained) {
  const next = sanitizeMaterialsMap(current);
  const add = sanitizeMaterialsMap(gained);
  for (const [id, amount] of Object.entries(add)) {
    next[id] = Math.min(MAX_AMOUNT, (next[id] || 0) + amount);
  }
  return next;
}

export function spendMaterial(current, materialId, amount = 1) {
  const next = sanitizeMaterialsMap(current);
  const id = safeId(materialId);
  const cost = clampInteger(amount, 0, MAX_AMOUNT, 0);
  if (!id || cost <= 0) return { ok: true, materials: next, reason: null };
  const have = next[id] || 0;
  if (have < cost) return { ok: false, materials: next, reason: "not-enough-material" };
  const left = have - cost;
  if (left <= 0) delete next[id];
  else next[id] = left;
  return { ok: true, materials: next, reason: null };
}

/** 重铸可选消耗：返回 { required: bool, materialId, amount, name } */
export function getReforgeMaterialCost(item = null, inputConfig = CONFIG) {
  const tuning = isRecord(inputConfig?.materials?.reforge)
    ? inputConfig.materials.reforge
    : isRecord(inputConfig?.economy?.reforge?.material)
      ? inputConfig.economy.reforge.material
      : {};
  if (tuning.enabled !== true) {
    return { required: false, materialId: null, amount: 0, name: "", emoji: "" };
  }
  const materialId = safeId(tuning.materialId) || "wild_essence";
  const amount = clampInteger(tuning.amount, 1, 100, 1);
  const meta = getMaterialMeta(materialId, inputConfig);
  return {
    required: true,
    materialId,
    amount,
    name: meta.name,
    emoji: meta.emoji,
  };
}

/** 野外掉落该用哪种材料（按区域）。 */
export function pickOutdoorMaterialId(regionId, inputConfig = CONFIG) {
  const outdoor = isRecord(inputConfig?.outdoor) ? inputConfig.outdoor : {};
  const materialsRoot = isRecord(inputConfig?.materials) ? inputConfig.materials : {};
  const byRegion = isRecord(materialsRoot.outdoorByRegion)
    ? materialsRoot.outdoorByRegion
    : isRecord(outdoor.materialByRegion) ? outdoor.materialByRegion : {};
  const region = safeId(regionId);
  if (region && byRegion[region]) return safeId(byRegion[region]) || outdoor.materialId || "wild_essence";
  return safeId(outdoor.materialId || materialsRoot.defaultId) || "wild_essence";
}

// ─── internals ───────────────────────────────────────────────

function getCatalog(inputConfig = CONFIG) {
  const root = isRecord(inputConfig?.materials) ? inputConfig.materials : {};
  return isRecord(root.catalog) ? root.catalog : {};
}

function fallbackName(id) {
  // 已知常见 id 的硬兜底（catalog 缺失时仍中文）
  const known = {
    wild_essence: "荒野精华",
    bone_dust: "骨粉",
    desert_glass: "沙晶",
    forest_resin: "腐化树脂",
    shadow_shard: "暗影碎片",
  };
  if (known[id]) return known[id];
  // 把 snake_case 转成「未鉴定材料」而非裸 id
  return "未鉴定材料";
}

function safeId(value) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, MAX_ID_LENGTH);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(number)));
}
