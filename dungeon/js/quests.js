/**
 * 城镇 NPC / 任务 / 对话：纯数据 / 纯函数层。
 * 不读 DOM、不写 localStorage；接任务、进度、交付、对话跳转集中于此。
 * 2A 范围：单任务 kill 目标 + 基础对话（接/交）；任务链/复杂分支留给 2B。
 */

import { CONFIG } from "./config.js";

const MAX_ID_LENGTH = 64;
const MAX_COUNT = 1_000_000;
const VALID_OBJECTIVE_TYPES = new Set(["kill", "collect", "clear_dungeon", "reach_region"]);

/** 默认任务存档。 */
export function createDefaultQuestState() {
  return {
    active: [],
    completed: [],
    progress: {},
    flags: {},
  };
}

/** 清洗任务存档，老档缺字段时安全兜底。 */
export function sanitizeQuestState(candidate, inputConfig = CONFIG) {
  const source = isRecord(candidate) ? candidate : {};
  const knownQuestIds = new Set(listQuestIds(inputConfig));
  const active = sanitizeIdList(source.active, knownQuestIds);
  const completed = sanitizeIdList(source.completed, knownQuestIds)
    .filter((id) => !active.includes(id));
  const progress = {};
  if (isRecord(source.progress)) {
    for (const [id, value] of Object.entries(source.progress)) {
      const questId = safeId(id);
      if (!questId) continue;
      if (knownQuestIds.size > 0 && !knownQuestIds.has(questId)) continue;
      progress[questId] = clampInteger(value, 0, MAX_COUNT, 0);
    }
  }
  const flags = {};
  if (isRecord(source.flags)) {
    for (const [key, value] of Object.entries(source.flags)) {
      const flag = safeId(key);
      if (flag) flags[flag] = value === true || value === 1 || value === "1";
    }
  }
  return { active, completed, progress, flags };
}

export function getQuest(questId, inputConfig = CONFIG) {
  const id = safeId(questId);
  if (!id) return null;
  const quest = getQuestConfig(inputConfig).quests?.[id];
  return isRecord(quest) ? { ...quest, id: quest.id || id } : null;
}

export function getNpc(npcId, inputConfig = CONFIG) {
  const id = safeId(npcId);
  if (!id) return null;
  const npc = getQuestConfig(inputConfig).npcs?.[id];
  return isRecord(npc) ? { ...npc, id: npc.id || id } : null;
}

/** 某城镇的 NPC 列表（含任务标记）。 */
export function listTownNpcs(townId, questState, inputConfig = CONFIG) {
  const town = safeId(townId);
  const state = sanitizeQuestState(questState, inputConfig);
  const npcs = Object.values(getQuestConfig(inputConfig).npcs || {})
    .filter((npc) => isRecord(npc) && safeId(npc.town) === town)
    .map((npc) => {
      const marker = getNpcQuestMarker(npc.id, state, inputConfig);
      return {
        ...npc,
        id: npc.id,
        marker,
        markerLabel: markerLabel(marker),
      };
    });
  return npcs;
}

/**
 * NPC 任务标记：
 * - turnin: 可交
 * - active: 进行中
 * - available: 可接
 * - none
 */
export function getNpcQuestMarker(npcId, questState, inputConfig = CONFIG) {
  const npc = getNpc(npcId, inputConfig);
  if (!npc) return "none";
  const state = sanitizeQuestState(questState, inputConfig);
  const related = listNpcRelatedQuests(npc, inputConfig);
  for (const quest of related) {
    if (state.active.includes(quest.id) && isQuestObjectiveMet(quest, state)) {
      return "turnin";
    }
  }
  for (const quest of related) {
    if (state.active.includes(quest.id)) return "active";
  }
  for (const quest of related) {
    if (canAcceptQuest(quest.id, state, inputConfig).ok) return "available";
  }
  return "none";
}

export function canAcceptQuest(questId, questState, inputConfig = CONFIG) {
  const quest = getQuest(questId, inputConfig);
  if (!quest) return { ok: false, reason: "unknown-quest" };
  const state = sanitizeQuestState(questState, inputConfig);
  if (state.completed.includes(quest.id)) return { ok: false, reason: "already-completed" };
  if (state.active.includes(quest.id)) return { ok: false, reason: "already-active" };
  // 2A：若配置了 prerequisite，则要求已完成；无 prerequisite 则可直接接。
  const prereq = safeId(quest.prerequisite ?? quest.requires);
  if (prereq && !state.completed.includes(prereq)) {
    return { ok: false, reason: "prerequisite-incomplete" };
  }
  // nextQuest 链：若某任务声明 nextQuest=本任务，则需前置完成（2A 可接已开放的）。
  if (quest.chainLocked === true) {
    const unlockedBy = listQuestIds(inputConfig)
      .map((id) => getQuest(id, inputConfig))
      .find((entry) => entry && safeId(entry.nextQuest) === quest.id);
    if (unlockedBy && !state.completed.includes(unlockedBy.id)) {
      return { ok: false, reason: "chain-locked" };
    }
  }
  return { ok: true, reason: null, quest };
}

export function acceptQuest(questId, questState, inputConfig = CONFIG) {
  const check = canAcceptQuest(questId, questState, inputConfig);
  if (!check.ok) {
    return { ok: false, reason: check.reason, quests: sanitizeQuestState(questState, inputConfig) };
  }
  const state = sanitizeQuestState(questState, inputConfig);
  const quest = check.quest;
  return {
    ok: true,
    reason: null,
    quests: {
      ...state,
      active: [...state.active, quest.id],
      progress: {
        ...state.progress,
        [quest.id]: clampInteger(state.progress[quest.id], 0, MAX_COUNT, 0),
      },
    },
    quest,
  };
}

/**
 * 击杀进度。templateIds 为本次击杀的敌人模板 id 列表。
 * target 为 "*" 时统计任意击杀。
 */
export function progressKillQuests(questState, templateIds = [], inputConfig = CONFIG) {
  const state = sanitizeQuestState(questState, inputConfig);
  const kills = Array.isArray(templateIds)
    ? templateIds.map((id) => safeId(id)).filter(Boolean)
    : [];
  if (kills.length === 0 || state.active.length === 0) {
    return { quests: state, updates: [] };
  }

  const progress = { ...state.progress };
  const updates = [];
  for (const questId of state.active) {
    const quest = getQuest(questId, inputConfig);
    if (!quest || quest.objective?.type !== "kill") continue;
    const target = safeId(quest.objective.target) || "*";
    const needed = clampInteger(quest.objective.count, 1, MAX_COUNT, 1);
    const current = clampInteger(progress[questId], 0, MAX_COUNT, 0);
    if (current >= needed) continue;
    const gained = target === "*"
      ? kills.length
      : kills.filter((id) => id === target).length;
    if (gained <= 0) continue;
    const next = Math.min(needed, current + gained);
    progress[questId] = next;
    updates.push({
      questId,
      previous: current,
      current: next,
      needed,
      complete: next >= needed,
      name: quest.name,
    });
  }
  return {
    quests: { ...state, progress },
    updates,
  };
}

/** 收集类进度（材料等，2A 接口预留）。 */
export function progressCollectQuests(questState, materialId, amount = 1, inputConfig = CONFIG) {
  const state = sanitizeQuestState(questState, inputConfig);
  const mat = safeId(materialId);
  const gained = clampInteger(amount, 0, MAX_COUNT, 0);
  if (!mat || gained <= 0) return { quests: state, updates: [] };
  const progress = { ...state.progress };
  const updates = [];
  for (const questId of state.active) {
    const quest = getQuest(questId, inputConfig);
    if (!quest || quest.objective?.type !== "collect") continue;
    if (safeId(quest.objective.target) !== mat) continue;
    const needed = clampInteger(quest.objective.count, 1, MAX_COUNT, 1);
    const current = clampInteger(progress[questId], 0, MAX_COUNT, 0);
    if (current >= needed) continue;
    const next = Math.min(needed, current + gained);
    progress[questId] = next;
    updates.push({
      questId,
      previous: current,
      current: next,
      needed,
      complete: next >= needed,
      name: quest.name,
    });
  }
  return { quests: { ...state, progress }, updates };
}

export function isQuestObjectiveMet(questOrId, questState, inputConfig = CONFIG) {
  const quest = isRecord(questOrId) ? questOrId : getQuest(questOrId, inputConfig);
  if (!quest) return false;
  const state = sanitizeQuestState(questState, inputConfig);
  if (!state.active.includes(quest.id)) return false;
  const objective = isRecord(quest.objective) ? quest.objective : {};
  if (!VALID_OBJECTIVE_TYPES.has(objective.type)) return false;
  const needed = clampInteger(objective.count, 1, MAX_COUNT, 1);
  const current = clampInteger(state.progress[quest.id], 0, MAX_COUNT, 0);
  if (objective.type === "kill" || objective.type === "collect") {
    return current >= needed;
  }
  // clear_dungeon / reach_region：progress 记 0/1
  return current >= 1;
}

export function canTurnInQuest(questId, questState, inputConfig = CONFIG) {
  const quest = getQuest(questId, inputConfig);
  if (!quest) return { ok: false, reason: "unknown-quest" };
  const state = sanitizeQuestState(questState, inputConfig);
  if (!state.active.includes(quest.id)) return { ok: false, reason: "not-active" };
  if (!isQuestObjectiveMet(quest, state, inputConfig)) {
    return { ok: false, reason: "objective-incomplete" };
  }
  return { ok: true, reason: null, quest };
}

/**
 * 交付任务：移入 completed，清理 progress，可选解锁 nextQuest（写入 flags / 不自动接）。
 * 奖励列表原样返回，由 game 层结算。
 */
export function turnInQuest(questId, questState, inputConfig = CONFIG) {
  const check = canTurnInQuest(questId, questState, inputConfig);
  if (!check.ok) {
    return {
      ok: false,
      reason: check.reason,
      quests: sanitizeQuestState(questState, inputConfig),
      rewards: [],
      unlockedQuestId: null,
    };
  }
  const state = sanitizeQuestState(questState, inputConfig);
  const quest = check.quest;
  const progress = { ...state.progress };
  delete progress[quest.id];
  const completed = state.completed.includes(quest.id)
    ? state.completed
    : [...state.completed, quest.id];
  const active = state.active.filter((id) => id !== quest.id);
  const nextId = safeId(quest.nextQuest);
  const flags = { ...state.flags };
  if (nextId) flags[`unlocked:${nextId}`] = true;

  return {
    ok: true,
    reason: null,
    quests: { active, completed, progress, flags },
    rewards: Array.isArray(quest.rewards) ? quest.rewards.map((entry) => ({ ...entry })) : [],
    unlockedQuestId: nextId || null,
    quest,
  };
}

/**
 * 解析对话节点。
 * @returns {{ text, options: [{ label, action }] }}
 * action: { type: 'goto'|'end'|'acceptQuest'|'turnInQuest', ... }
 */
export function getDialogueNode(npcId, nodeId, questState, inputConfig = CONFIG) {
  const npc = getNpc(npcId, inputConfig);
  if (!npc || !isRecord(npc.dialogue)) return null;
  const state = sanitizeQuestState(questState, inputConfig);
  const dialogue = npc.dialogue;
  const requested = safeId(nodeId) || "root";

  // 动态：优先插入可交付 / 可接的任务入口
  if (requested === "root") {
    const related = listNpcRelatedQuests(npc, inputConfig);
    const turnIn = related.find((quest) => canTurnInQuest(quest.id, state, inputConfig).ok);
    if (turnIn) {
      return {
        id: "root",
        text: String(dialogue.root?.text ?? "……").slice(0, 500),
        options: [
          {
            label: `✅ 交付任务：${turnIn.name}`,
            action: { type: "turnInQuest", questId: turnIn.id },
          },
          ...normalizeStaticOptions(dialogue.root?.options, state, inputConfig),
        ],
      };
    }
  }

  const node = isRecord(dialogue[requested]) ? dialogue[requested] : dialogue.root;
  if (!isRecord(node)) return null;
  return {
    id: requested,
    text: String(node.text ?? "……").slice(0, 500),
    options: normalizeStaticOptions(node.options, state, inputConfig),
  };
}

/**
 * 选择对话选项后的纯结果（不改存档结构以外的东西）。
 * 返回 { node, quests, acceptedQuest, turnedIn, rewards, unlockedQuestId, ended }
 */
export function chooseDialogueOption(npcId, nodeId, optionIndex, questState, inputConfig = CONFIG) {
  const node = getDialogueNode(npcId, nodeId, questState, inputConfig);
  if (!node) {
    return {
      ok: false,
      reason: "unknown-node",
      quests: sanitizeQuestState(questState, inputConfig),
      ended: true,
    };
  }
  const option = node.options[optionIndex];
  if (!option) {
    return {
      ok: false,
      reason: "unknown-option",
      quests: sanitizeQuestState(questState, inputConfig),
      ended: true,
    };
  }

  let quests = sanitizeQuestState(questState, inputConfig);
  let acceptedQuest = null;
  let turnedIn = null;
  let rewards = [];
  let unlockedQuestId = null;
  let ended = false;
  let nextNodeId = null;

  const action = option.action || { type: "end" };
  switch (action.type) {
    case "goto": {
      nextNodeId = safeId(action.goto || action.nodeId) || "root";
      break;
    }
    case "acceptQuest": {
      const accepted = acceptQuest(action.questId, quests, inputConfig);
      if (accepted.ok) {
        quests = accepted.quests;
        acceptedQuest = accepted.quest;
      }
      ended = action.end !== false;
      break;
    }
    case "turnInQuest": {
      const result = turnInQuest(action.questId, quests, inputConfig);
      if (result.ok) {
        quests = result.quests;
        turnedIn = result.quest;
        rewards = result.rewards;
        unlockedQuestId = result.unlockedQuestId;
      }
      ended = action.end !== false;
      break;
    }
    case "end":
    default:
      ended = true;
      break;
  }

  return {
    ok: true,
    reason: null,
    quests,
    acceptedQuest,
    turnedIn,
    rewards,
    unlockedQuestId,
    ended,
    nextNodeId,
    node: ended ? null : (nextNodeId ? getDialogueNode(npcId, nextNodeId, quests, inputConfig) : null),
    optionLabel: option.label,
  };
}

/** 任务日志视图模型。 */
export function listQuestLog(questState, inputConfig = CONFIG) {
  const state = sanitizeQuestState(questState, inputConfig);
  const active = state.active.map((id) => {
    const quest = getQuest(id, inputConfig);
    if (!quest) return null;
    const needed = clampInteger(quest.objective?.count, 1, MAX_COUNT, 1);
    const current = clampInteger(state.progress[id], 0, MAX_COUNT, 0);
    return {
      ...quest,
      status: "active",
      current,
      needed,
      ready: isQuestObjectiveMet(quest, state, inputConfig),
      progressText: formatObjectiveProgress(quest, current, needed),
    };
  }).filter(Boolean);

  const completed = state.completed.map((id) => {
    const quest = getQuest(id, inputConfig);
    if (!quest) return null;
    return {
      ...quest,
      status: "completed",
      current: clampInteger(quest.objective?.count, 1, MAX_COUNT, 1),
      needed: clampInteger(quest.objective?.count, 1, MAX_COUNT, 1),
      ready: false,
      progressText: "已完成",
    };
  }).filter(Boolean);

  return { active, completed };
}

// ─── internals ───────────────────────────────────────────────

function listNpcRelatedQuests(npc, inputConfig) {
  const quests = [];
  const giverId = safeId(npc.id);
  for (const id of listQuestIds(inputConfig)) {
    const quest = getQuest(id, inputConfig);
    if (!quest) continue;
    if (safeId(quest.giver) === giverId) quests.push(quest);
  }
  // NPC 可显式挂载 quests 列表
  if (Array.isArray(npc.quests)) {
    for (const rawId of npc.quests) {
      const quest = getQuest(rawId, inputConfig);
      if (quest && !quests.some((entry) => entry.id === quest.id)) quests.push(quest);
    }
  }
  return quests;
}

function normalizeStaticOptions(rawOptions, questState, inputConfig) {
  if (!Array.isArray(rawOptions)) return [{ label: "告辞", action: { type: "end" } }];
  const options = [];
  for (const raw of rawOptions) {
    if (!isRecord(raw) || typeof raw.label !== "string") continue;
    const label = raw.label.slice(0, 40);
    if (raw.acceptQuest) {
      const check = canAcceptQuest(raw.acceptQuest, questState, inputConfig);
      if (!check.ok) continue;
      options.push({
        label,
        action: { type: "acceptQuest", questId: safeId(raw.acceptQuest), end: raw.end !== false },
      });
      continue;
    }
    if (raw.turnInQuest) {
      const check = canTurnInQuest(raw.turnInQuest, questState, inputConfig);
      if (!check.ok) continue;
      options.push({
        label,
        action: { type: "turnInQuest", questId: safeId(raw.turnInQuest), end: raw.end !== false },
      });
      continue;
    }
    if (raw.goto) {
      options.push({
        label,
        action: { type: "goto", goto: safeId(raw.goto) },
      });
      continue;
    }
    options.push({
      label,
      action: { type: "end" },
    });
  }
  if (options.length === 0) {
    options.push({ label: "告辞", action: { type: "end" } });
  }
  return options;
}

function formatObjectiveProgress(quest, current, needed) {
  const objective = quest.objective || {};
  if (objective.type === "kill") {
    const targetName = objective.targetName || objective.target || "敌人";
    return `击杀${targetName} ${current}/${needed}`;
  }
  if (objective.type === "collect") {
    const targetName = objective.targetName || objective.target || "材料";
    return `收集${targetName} ${current}/${needed}`;
  }
  if (objective.type === "clear_dungeon") return current >= 1 ? "已通关" : "尚未通关";
  if (objective.type === "reach_region") return current >= 1 ? "已抵达" : "尚未抵达";
  return `${current}/${needed}`;
}

function markerLabel(marker) {
  if (marker === "turnin") return "✅";
  if (marker === "active") return "❓";
  if (marker === "available") return "❗";
  return "";
}

function getQuestConfig(inputConfig = CONFIG) {
  return isRecord(inputConfig?.quests) ? inputConfig.quests : {};
}

function listQuestIds(inputConfig = CONFIG) {
  const quests = getQuestConfig(inputConfig).quests;
  return isRecord(quests) ? Object.keys(quests) : [];
}

function sanitizeIdList(value, allowedIds) {
  if (!Array.isArray(value)) return [];
  const allowed = allowedIds instanceof Set ? allowedIds : new Set(allowedIds);
  const result = [];
  for (const entry of value) {
    const id = safeId(entry);
    if (!id) continue;
    if (allowed.size > 0 && !allowed.has(id)) continue;
    if (!result.includes(id)) result.push(id);
  }
  return result;
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
