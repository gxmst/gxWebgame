import { CONFIG, EQUIPMENT_SLOT_IDS, RARITY_IDS, createSeededRng } from "./config.js";
import { simulateCombat } from "./combat.js";
import {
  createEnemyWave,
  getFloor,
  getFloorCap,
  getFloorPacing,
  isFloorUnlocked,
  shouldDropBaseLoot,
} from "./dungeon.js";
import {
  allocateStat,
  applyAutoAllocation,
  createHeroCombatant,
  equipItem,
  getHeroStats,
  getLevelProgress,
  getPower,
  getEquipUpgradeDelta,
  unequipItem,
} from "./hero.js";
import { generateLoot } from "./loot.js";
import {
  beginReforge,
  ensureShop,
  getPendingReforge,
  getSellValue,
  purchaseShopItem,
  resolveReforge,
} from "./economy.js";
import {
  getHeroSkills,
  chooseSkillBranch,
  getSkillBranchChoice,
  getPrestigePreview,
  resolveSkillAtLevel,
  getSkillPointState,
  resetSkillPoints,
  upgradeSkill,
} from "./skills.js";
import {
  createOutdoorWave,
  startOutdoorRun,
  stopOutdoorRun as reduceStopOutdoorRun,
  settleOutdoorWave,
  selectOutdoorFloor,
} from "./outdoor.js";
import {
  applyDefeat,
  applyPrestige,
  applyVictory,
  clearProgress,
  clearPendingBattle,
  createCharacter as createSavedCharacter,
  deleteCharacter as deleteSavedCharacter,
  getCharacterLimit,
  getDefeatPenalty,
  projectActiveCharacter,
  loadSave,
  sanitizeSave,
  saveSave,
  switchCharacter as switchSavedCharacter,
  updateActiveCharacter,
  setPendingBattle,
} from "./save.js";
import {
  enterNode,
  getNode,
  getWorldLevel,
  leaveToMap,
  listRegions,
} from "./world.js";
import {
  applyEventBuffsToStats,
  createEventBattleWave,
  pickEventCard,
  resolveEventOption,
  shouldTriggerEvent,
} from "./events.js";
import {
  chooseDialogueOption,
  getDialogueNode,
  listQuestLog,
  listTownNpcs,
  progressCollectQuests,
  progressDungeonQuests,
  progressKillQuests,
} from "./quests.js";
import {
  addMaterials,
  formatMaterialChip,
  listOwnedMaterials,
} from "./materials.js";
import { DungeonUI } from "./ui.js";
import { localizeContent, localizeDialogue, normalizeLanguage, t } from "./i18n.js";
import { diagnoseDefeat } from "./diagnostics.js";

const BASE_LOG_DELAY = 175;

class DungeonGame {
  constructor() {
    this.save = projectActiveCharacter(loadSave());
    const initialShop = ensureShop(this.save);
    this.save = projectActiveCharacter(initialShop.save);
    this.selectedFloorId = Math.min(
      getFloorCap(this.save),
      this.save.progress.highestUnlockedFloor,
    );
    this.battle = null;
    this.outdoorRun = null;
    // 野外事件卡进行中（暂停刷怪）；结构：{ card, seed, phase, resolution, battlePlan }
    this.pendingEvent = null;
    // 城镇对话：{ npcId, nodeId }
    this.dialogue = null;
    // 刷新后按存档 currentNodeId 恢复场景；无节点时回到世界地图。
    const restoredNode = this.save.world?.currentNodeId
      ? getNode(this.save.world.currentNodeId, CONFIG)
      : null;
    this.worldScene = restoredNode
      ? this.sceneFromNodeType(restoredNode.type)
      : "map";
    this.adventureMode = this.worldScene === "outdoor" ? "outdoor" : "dungeon";
    if (this.worldScene === "map") this.adventureMode = "map";
    this.interruptedBattle = this.save.pendingBattle;
    this.ui = new DungeonUI({
      selectFloor: (floorId) => this.selectFloor(floorId),
      enterFloor: () => this.startBattle(),
      setSpeed: (speed) => this.setBattleSpeed(speed),
      skipBattle: () => this.skipBattle(),
      retreatBattle: () => this.retreatBattle(),
      equipItem: (itemId) => this.equip(itemId),
      unequipItem: (slot) => this.unequip(slot),
      sellItem: (itemId) => this.sellItem(itemId),
      reforgeItem: (itemId, location, slot) => this.reforge(itemId, location, slot),
      resolveReforge: (choice) => this.finishReforge(choice),
      buyShopItem: (listingId) => this.buyItem(listingId),
      refreshShop: () => this.checkShopRefresh(),
      allocateStat: (stat) => this.spendStatPoint(stat),
      upgradeSkill: (skillId) => this.spendSkillPoint(skillId),
      chooseSkillBranch: (skillId, branchId) => this.chooseSkillBranch(skillId, branchId),
      resetSkills: () => this.resetSkills(),
      prestige: () => this.prestige(),
      manageCharacters: () => this.openCharacterManager(),
      createCharacter: (classId, name) => this.createCharacter(classId, name),
      switchCharacter: (characterId) => this.switchCharacter(characterId),
      deleteCharacter: (characterId) => this.deleteCharacter(characterId),
      changeClass: () => this.openCharacterManager(),
      selectClass: (classId) => this.createCharacter(classId, ""),
      toggleAutoAllocate: (enabled) => this.toggleAutoAllocate(enabled),
      reset: () => this.resetProgress(),
      closeResult: () => this.closeResult(),
      repeatBattle: () => this.repeatBattle(),
      exportSave: () => this.exportSave(),
      importSave: (text) => this.importSave(text),
      bulkSell: (rarity) => this.bulkSell(rarity),
      equipBest: () => this.equipBestGear(),
      toggleLock: (itemId) => this.toggleLock(itemId),
      toggleSound: () => this.toggleSound(),
      toggleLanguage: () => this.toggleLanguage(),
      enterWorldNode: (nodeId) => this.enterWorldNode(nodeId),
      returnToWorldMap: () => this.returnToWorldMap(),
      setWorldMapViewMode: (mode) => this.setWorldMapViewMode(mode),
      openTownShop: () => this.openTownShop(),
      openTownInventory: () => this.openTownInventory(),
      startOutdoor: () => this.startOutdoor(),
      stopOutdoor: () => this.stopOutdoor(),
      chooseEventOption: (optionIndex) => this.chooseEventOption(optionIndex),
      continueEvent: () => this.continueEvent(),
      openNpc: (npcId) => this.openNpc(npcId),
      chooseDialogueOption: (optionIndex) => this.chooseDialogueOption(optionIndex),
      closeDialogue: () => this.closeDialogue(),
      openQuestLog: () => this.openQuestLog(),
      closeQuestLog: () => this.closeQuestLog(),
    });
    if (this.interruptedBattle) {
      this.save = resolveImportedPendingBattle(this.save).save;
      this.persist();
    }
    this.render();
    if (!this.save.hero.classChosen) this.ui.showCharacterManager?.(this.buildViewModel());
    const pendingReforge = getPendingReforge(this.save);
    if (pendingReforge) this.ui.showReforge?.(pendingReforge);
    if (this.interruptedBattle) {
      this.ui.showToast("上次远征中断，已按撤退结算少量损失。", "error");
    }
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.outdoorRun) this.stopOutdoor("hidden");
    });
  }

  get selectedFloor() {
    return getFloor(this.selectedFloorId) ?? CONFIG.floors[0];
  }

  buildViewModel() {
    const language = normalizeLanguage(this.save.settings.language);
    const hero = this.save.hero;
    const stats = getHeroStats(hero);
    const highest = this.save.progress.highestUnlockedFloor;
    const floorCap = getFloorCap(this.save);
    const cleared = new Set(this.save.progress.clearedFloors);
    const classMeta = localizeContent(
      CONFIG.classes[hero.classId] ?? CONFIG.classes.warrior,
      "class",
      language,
    );
    const outdoorSaved = this.save.outdoor ?? {};
    const outdoorFloor = this.outdoorRun?.wave?.floorId
      ?? selectOutdoorFloor(this.save, "preview", CONFIG)?.id
      ?? CONFIG.dungeon.minFloor;
    const outdoorWaves = Number(outdoorSaved.completedWaves ?? 0)
      + Number(this.outdoorRun?.state?.completedWaves ?? 0);
    const skillPoints = getSkillPointState(hero);
    const prestige = getPrestigePreview(hero);
    const skills = getHeroSkills(hero).map((skill) => ({
      ...localizeContent(skill, "skill", language),
      nextLevel: skill.level < skill.maxLevel
        ? resolveSkillAtLevel(
          skill.id,
          skill.level + 1,
          getSkillBranchChoice(hero, skill.id),
        )
        : null,
    }));
    const floors = CONFIG.floors.map((floor) => {
      const pacing = getFloorPacing(floor.id);
      const [minimumEnemies, maximumEnemies] = floor.enemyCount;
      const baseGold = CONFIG.dungeon.goldPerEnemy
        * floor.rewardScale
        * (pacing?.rewardMultipliers.gold ?? 1)
        * (pacing?.gateRewardMultiplier ?? 1);
      const rewardMultiplier = floor.boss
        ? (Number.isFinite(CONFIG.dungeon.bossRewardMultiplier)
          ? CONFIG.dungeon.bossRewardMultiplier
          : 4)
        : 1;
      const minimumGold = Math.round(baseGold * minimumEnemies * rewardMultiplier);
      const maximumGold = Math.round(baseGold * maximumEnemies * rewardMultiplier);
      return {
        ...floor,
        name: language === "en-US" ? `Floor ${floor.id}` : floor.name,
        title: language === "en-US" ? (floor.boss ? `Gatekeeper · Floor ${floor.id}` : `Dungeon Floor ${floor.id}`) : floor.title,
        description: language === "en-US"
          ? (floor.boss ? "A progression gate that tests damage, defense, and build cohesion." : "Enemies grow stronger here; improve gear and refine your build before advancing.")
          : floor.description,
        recommendedPower: pacing?.recommendedPower ?? floor.recommendedPower,
        pacing,
        isBoss: floor.boss,
        icon: floor.emoji,
        unlocked: isFloorUnlocked(this.save, floor.id),
        lockedByPrestige: floor.id <= highest && floor.id > floorCap,
        cleared: cleared.has(floor.id),
        enemyCountText: floor.boss
          ? (language === "en-US" ? "1 Boss" : "1 名首领")
          : minimumEnemies === maximumEnemies
            ? (language === "en-US" ? `${minimumEnemies}` : `${minimumEnemies} 名`)
            : (language === "en-US" ? `${minimumEnemies}-${maximumEnemies}` : `${minimumEnemies}–${maximumEnemies} 名`),
        goldText: minimumGold === maximumGold
          ? `${minimumGold}`
          : `${minimumGold}–${maximumGold}`,
        dropText: floor.boss
          ? (floor.bossTier >= 6 ? "双件 · 稀有保底" : "双件 · 优秀保底")
          : floor.id >= 60
            ? "优秀 / 稀有 / 传说"
            : floor.id >= 20 ? "普通 / 优秀 / 稀有+" : floor.id >= 3 ? "普通 / 优秀+" : "普通+",
        minRarity: "common",
      };
    });
    return {
      highestUnlockedFloor: Math.min(highest, floorCap),
      recordedHighestFloor: highest,
      floorCap,
      selectedFloorId: this.selectedFloorId,
      selectedFloor: floors.find((floor) => floor.id === this.selectedFloorId) ?? floors[0],
      floors,
      inventoryLimit: CONFIG.save.maxInventoryItems,
      character: {
        hero,
        stats,
        power: getPower(hero),
        levelProgress: getLevelProgress(hero),
        equipment: hero.equipment,
        // 给每件背包装备标注"穿上后战力变化",供 UI 显示升级推荐徽章。
        // 用纯函数影子模拟,自动考虑职业(如力量装对法师收益低)。
        inventory: hero.inventory.map((item) => ({
          ...item,
          upgradeDelta: getEquipUpgradeDelta(hero, item),
        })),
        gold: hero.gold,
        autoAllocate: this.save.settings.autoAllocate,
        classMeta,
        skills,
        skillPoints,
        prestige,
      },
      economy: {
        shop: this.save.economy.shop,
        pendingReforge: getPendingReforge(this.save),
      },
      characters: (this.save.characters ?? []).map((character) => {
        const characterHero = character.hero ?? {};
        return {
          ...character,
          classMeta: localizeContent(CONFIG.classes[characterHero.classId] ?? CONFIG.classes.warrior, "class", language),
          level: characterHero.level,
          prestigeCount: characterHero.prestigeCount,
        };
      }),
      activeCharacterId: this.save.activeCharacterId,
      characterLimit: getCharacterLimit(),
      adventureMode: this.adventureMode,
      worldScene: this.worldScene,
      worldLevel: getWorldLevel(this.save),
      world: this.buildWorldViewModel(),
      endgame: this.buildEndgameViewModel(highest, cleared, language),
      outdoor: {
        ...outdoorSaved,
        targetFloor: outdoorFloor,
        totalWaves: outdoorWaves,
        running: Boolean(this.outdoorRun),
        eventPending: Boolean(this.pendingEvent),
      },
      quests: Object.fromEntries(Object.entries(listQuestLog(this.save.quests, CONFIG)).map(([key, rows]) => [key, Array.isArray(rows) ? rows.map((row) => localizeContent(row, "quest", language)) : rows])),
      townNpcs: this.buildTownNpcView().map((npc) => localizeContent(npc, "npc", language)),
      dialogue: this.dialogue
        ? (() => {
          const npc = listTownNpcs(this.save.world?.currentNodeId, this.save.quests, CONFIG)
            .find((npc) => npc.id === this.dialogue.npcId)
            ?? null;
          const node = getDialogueNode(
            this.dialogue.npcId,
            this.dialogue.nodeId,
            this.save.quests,
            CONFIG,
          );
          return { npc: localizeContent(npc, "npc", language), node: localizeDialogue(npc, node, language) };
        })()
        : null,
      pendingEvent: this.pendingEvent
        ? {
          card: localizeContent(this.pendingEvent.card, "event", language),
          phase: this.pendingEvent.phase,
          resultText: this.pendingEvent.resolution?.resultText ?? null,
          rewards: this.pendingEvent.resolution?.rewards ?? null,
        }
        : null,
      eventBuffs: this.save.eventBuffs ?? {},
      materials: this.save.materials ?? {},
      materialRows: listOwnedMaterials(this.save.materials, CONFIG),
      career: {
        totalVictories: this.save.progress.totalVictories,
        totalDefeats: this.save.progress.totalDefeats,
        highestFloor: highest,
        outdoorWaves,
      },
      settings: {
        soundEnabled: this.save.settings.soundEnabled !== false,
        worldMapViewMode: this.save.settings.worldMapViewMode === "list" ? "list" : "map",
        language: normalizeLanguage(this.save.settings.language),
      },
      classes: Object.values(CONFIG.classes).map((entry) => localizeContent(entry, "class", language)),
    };
  }

  buildTownNpcView() {
    const nodeId = this.save.world?.currentNodeId;
    if (!nodeId) return [];
    const node = getNode(nodeId, CONFIG);
    if (!node || node.type !== "town") return [];
    return listTownNpcs(nodeId, this.save.quests, CONFIG);
  }

  buildWorldViewModel() {
    const language = normalizeLanguage(this.save.settings.language);
    const world = this.save.world ?? {};
    const regions = listRegions(this.save, CONFIG).map((region) => {
      const localized = localizeContent(region, "region", language);
      return { ...localized, nodes: (region.nodes ?? []).map((node) => localizeContent(node, "node", language)) };
    });
    const currentNode = world.currentNodeId
      ? localizeContent(getNode(world.currentNodeId, CONFIG), "node", language)
      : null;
    const currentRegion = regions.find((region) => region.id === world.currentRegionId)
      ?? regions.find((region) => region.unlocked)
      ?? null;
    return {
      ...world,
      worldLevel: getWorldLevel(this.save),
      regions,
      currentNode,
      currentRegionName: currentRegion?.name ?? "—",
      currentRegionEmoji: currentRegion?.emoji ?? "◆",
    };
  }

  buildEndgameViewModel(highestFloor, clearedFloors = new Set(), language = "zh-CN") {
    const objectives = Array.isArray(CONFIG.endgame?.objectives) ? CONFIG.endgame.objectives : [];
    const current = objectives.find((entry) => !clearedFloors.has(entry.floor)) ?? objectives.at(-1) ?? null;
    if (!current) return null;
    const english = language === "en-US";
    return {
      ...current,
      name: english ? ({ reach_50: "Enter the Abyss", reach_85: "Complete the Build", clear_100: "Conquer the Endgame" }[current.id] ?? current.name) : current.name,
      description: english ? ({ reach_50: "Defeat the Floor 50 gatekeeper.", reach_85: "Pass the Void build check with a complete 25-point build.", clear_100: "Defeat the Void Sovereign on Floor 100." }[current.id] ?? current.description) : current.description,
      complete: clearedFloors.has(current.floor),
      currentFloor: highestFloor,
    };
  }

  /** 战斗单位：叠加上事件永久小 buff，不改 hero.js / combat.js。 */
  createPlayerCombatant() {
    const combatant = createHeroCombatant(this.save.hero);
    combatant.stats = applyEventBuffsToStats(combatant.stats, this.save.eventBuffs);
    return combatant;
  }

  sceneFromNodeType(type) {
    if (type === "town") return "town";
    if (type === "outdoor") return "outdoor";
    if (type === "dungeon") return "dungeon";
    return "map";
  }

  enterWorldNode(nodeId) {
    if (this.battle || this.outdoorRun) {
      this.ui.showToast("请先结束当前战斗。", "error");
      return;
    }
    if (!this.save.hero.classChosen) {
      this.ui.showCharacterManager?.(this.buildViewModel());
      this.ui.showToast("先创建一个角色，再探索世界。", "error");
      return;
    }
    const result = enterNode(this.save, nodeId, CONFIG);
    if (!result.ok) {
      this.ui.showToast(
        result.reason === "region-locked" ? "该区域尚未解锁。" : "无法进入该地点。",
        "error",
      );
      return;
    }
    this.save = updateActiveCharacter(this.save, (active) => ({
      ...active,
      world: result.world,
    }));
    this.worldScene = this.sceneFromNodeType(result.node.type);
    this.adventureMode = this.worldScene === "outdoor" ? "outdoor" : "dungeon";
    this.persist();
    this.ui.activatePanel?.("dungeon");
    this.render();
  }

  returnToWorldMap() {
    if (this.battle && !this.battle.settled) {
      this.ui.showToast("战斗中无法返回地图。", "error");
      return;
    }
    if (this.outdoorRun) {
      this.ui.showToast("请先停止并结算野外漫步。", "error");
      return;
    }
    this.save = updateActiveCharacter(this.save, (active) => ({
      ...active,
      world: leaveToMap(active.world ?? this.save.world, CONFIG),
    }));
    this.worldScene = "map";
    this.adventureMode = "map";
    this.persist();
    this.ui.returnToDungeon("map");
    this.render();
  }

  setWorldMapViewMode(mode) {
    const next = mode === "list" ? "list" : "map";
    const previous = this.save.settings?.worldMapViewMode === "list" ? "list" : "map";
    // 始终先立刻切换 UI，避免 persist/render 失败时用户感觉“点了没反应”。
    this.ui.applyWorldMapViewMode?.(next);
    if (previous === next) return;
    this.save.settings = {
      ...this.save.settings,
      worldMapViewMode: next,
    };
    this.persist();
    this.render();
    this.ui.applyWorldMapViewMode?.(next);
    this.ui.showToast(next === "list" ? "已切换为列表视图。" : "已切换为地图视图。");
  }

  openTownShop() {
    if (this.battle || this.outdoorRun) return;
    this.ui.activatePanel?.("inventory");
    this.ui.activateInventoryTab?.("shop");
    this.ui.showToast("已打开商店。补给后可返回城镇或地图。");
  }

  openTownInventory() {
    if (this.battle || this.outdoorRun) return;
    this.ui.activatePanel?.("inventory");
    this.ui.activateInventoryTab?.("inventory");
    this.ui.showToast("已打开背包。可在此装备、出售或重铸。");
  }

  render() {
    this.ui.render(this.buildViewModel());
  }

  selectFloor(floorId) {
    if (this.battle || this.worldScene === "outdoor" || this.adventureMode === "outdoor") return;
    const floor = getFloor(floorId);
    if (!floor || !isFloorUnlocked(this.save, floor.id)) return;
    this.selectedFloorId = floor.id;
    this.render();
  }

  openCharacterManager() {
    if (this.battle || this.outdoorRun) {
      this.ui.showToast("战斗中无法切换角色。", "error");
      return;
    }
    this.ui.showCharacterManager?.(this.buildViewModel());
  }

  createCharacter(classId, name = "") {
    if (this.battle || this.outdoorRun) return;
    const result = createSavedCharacter(this.save, {
      classId,
      name: typeof name === "string" ? name.trim() : "",
    });
    if (!result.ok) {
      this.ui.showToast(
        result.reason === "character-limit" ? `角色数量已达上限（${getCharacterLimit()} 名）。` : "请选择有效职业。",
        "error",
      );
      return;
    }
    this.save = ensureShop(projectActiveCharacter(result.save)).save;
    this.selectedFloorId = CONFIG.dungeon.minFloor;
    this.adventureMode = "map";
    this.worldScene = "map";
    const saved = this.persist();
    this.ui.closeCharacterManager?.();
    this.ui.returnToDungeon("map");
    this.render();
    if (saved) this.ui.showToast(`已创建${CONFIG.classes[classId]?.name ?? "新角色"}角色。`, "reward");
  }

  switchCharacter(characterId) {
    if (this.battle || this.outdoorRun) {
      this.ui.showToast("战斗中无法切换角色。", "error");
      return;
    }
    if (characterId === this.save.activeCharacterId) {
      this.ui.closeCharacterManager?.();
      return;
    }
    const result = switchSavedCharacter(this.save, characterId);
    if (!result.ok) {
      this.ui.showToast("找不到这个角色。", "error");
      return;
    }
    this.save = ensureShop(projectActiveCharacter(result.save)).save;
    this.selectedFloorId = Math.min(
      getFloorCap(this.save),
      this.save.progress.highestUnlockedFloor,
    );
    this.adventureMode = "map";
    this.worldScene = "map";
    const saved = this.persist();
    this.ui.closeCharacterManager?.();
    this.ui.returnToDungeon("map");
    this.render();
    if (saved) this.ui.showToast(`已切换至「${this.save.hero.name}」。`, "reward");
    const pendingReforge = getPendingReforge(this.save);
    if (pendingReforge) this.ui.showReforge?.(pendingReforge);
  }

  deleteCharacter(characterId) {
    if (this.battle || this.outdoorRun) return;
    const target = this.save.characters?.find((entry) => entry.id === characterId);
    if (!target) return;
    if (this.save.characters.length <= 1) {
      this.ui.showToast("至少需要保留一个角色。", "error");
      return;
    }
    if (!globalThis.confirm(`确定删除角色「${target.name || target.hero?.name || "未命名"}」吗？该角色的装备、金币和进度都会永久删除。`)) return;
    const result = deleteSavedCharacter(this.save, characterId);
    if (!result.ok) {
      this.ui.showToast("暂时无法删除这个角色。", "error");
      return;
    }
    this.save = ensureShop(projectActiveCharacter(result.save)).save;
    this.selectedFloorId = Math.min(
      getFloorCap(this.save),
      this.save.progress.highestUnlockedFloor,
    );
    const saved = this.persist();
    this.render();
    if (saved) this.ui.showToast("角色已删除。", "reward");
    this.ui.showCharacterManager?.(this.buildViewModel());
  }

  startBattle() {
    if (this.battle) return;
    if (!this.save.hero.classChosen) {
      this.ui.showClassSelection?.(this.buildViewModel());
      this.ui.showToast("先选择职业，再开始远征。", "error");
      return;
    }
    this.worldScene = "dungeon";
    this.adventureMode = "dungeon";
    const floor = this.selectedFloor;
    if (!isFloorUnlocked(this.save, floor.id)) {
      this.ui.showToast(
        floor.id > getFloorCap(this.save) ? "需要转生后才能挑战更深层。" : "需要先通过上一层。",
        "error",
      );
      return;
    }

    const attempt = this.save.progress.totalVictories + this.save.progress.totalDefeats + 1;
    const characterId = this.save.activeCharacterId;
    const seed = `${Date.now()}|${characterId}|${floor.id}|${attempt}`;
    const wave = createEnemyWave(floor.id, seed);
    const player = this.createPlayerCombatant();
    const result = simulateCombat({
      player,
      enemies: wave.enemies,
      seed,
      config: CONFIG,
    });
    const stats = applyEventBuffsToStats(getHeroStats(this.save.hero), this.save.eventBuffs);
    const enemies = wave.enemies.map((enemy) => ({
      ...enemy,
      icon: enemy.emoji,
      hp: enemy.stats?.hp ?? enemy.hp,
      maxHp: enemy.stats?.maxHp ?? enemy.maxHp,
    }));

    this.battle = {
      floor,
      wave,
      seed,
      result,
      index: 0,
      timer: null,
      settled: false,
      loot: null,
      lastSnapshot: null,
      characterId,
      mode: "dungeon",
    };
    this.save = setPendingBattle(this.save, {
      floorId: floor.id,
      seed,
      startedAt: Date.now(),
      characterId,
    });
    this.persist();
    this.ui.showBattle({
      hero: this.save.hero,
      classMeta: CONFIG.classes[this.save.hero.classId],
      stats,
      enemies,
      floor,
      speed: this.save.settings.battleSpeed,
      mode: "dungeon",
    });
    this.scheduleNextLog(80);
  }

  startOutdoor() {
    if (this.battle || this.outdoorRun) return;
    if (!this.save.hero.classChosen) {
      this.ui.showCharacterManager?.(this.buildViewModel());
      this.ui.showToast("先创建一个角色，再开始漫步。", "error");
      return;
    }
    if (document.hidden) {
      this.ui.showToast("页面不可见时无法开始漫步。", "error");
      return;
    }
    this.adventureMode = "outdoor";
    this.worldScene = "outdoor";
    const seed = `${Date.now()}|${this.save.activeCharacterId}|outdoor`;
    this.outdoorRun = {
      state: startOutdoorRun(this.save.outdoor, seed),
      wave: null,
      result: null,
      timer: null,
      summaries: [],
    };
    this.ui.returnToDungeon("outdoor");
    this.render();
    this.startOutdoorWave();
  }

  startOutdoorWave() {
    const run = this.outdoorRun;
    if (!run || run.state.status !== "running" || document.hidden || this.pendingEvent) return;
    const wave = createOutdoorWave(this.save, run.state, CONFIG);
    this.beginScriptedBattle({
      wave,
      seed: wave.seed,
      mode: "outdoor",
      waveNumber: run.state.completedWaves + 1,
      caption: `🌲 第 ${run.state.completedWaves + 1} 波 · ${getFloor(wave.floorId)?.name ?? "荒野"}`,
      settle: () => this.resolveOutdoorWave(),
      logSummaries: true,
    });
  }

  /**
   * 通用脚本战斗：野外波次 / 事件伏击共用，不改 combat.js。
   */
  beginScriptedBattle({
    wave,
    seed,
    mode,
    waveNumber = null,
    caption = "",
    settle,
    logSummaries = false,
    playLogs = false,
  }) {
    const floor = getFloor(wave.floorId) ?? getFloor(CONFIG.dungeon.minFloor);
    const result = simulateCombat({
      player: this.createPlayerCombatant(),
      enemies: wave.enemies,
      seed,
      config: CONFIG,
    });
    const stats = applyEventBuffsToStats(getHeroStats(this.save.hero), this.save.eventBuffs);
    const enemies = wave.enemies.map((enemy) => ({
      ...enemy,
      icon: enemy.emoji,
      hp: enemy.stats?.hp ?? enemy.hp,
      maxHp: enemy.stats?.maxHp ?? enemy.maxHp,
    }));
    this.battle = {
      floor,
      wave,
      seed,
      result,
      index: playLogs ? 0 : result.logs.length,
      timer: null,
      settled: false,
      loot: null,
      lastSnapshot: playLogs ? null : result.finalState,
      characterId: this.save.activeCharacterId,
      mode,
      waveNumber,
      settleHandler: settle,
    };
    this.ui.showBattle({
      hero: this.save.hero,
      classMeta: CONFIG.classes[this.save.hero.classId],
      stats,
      enemies,
      floor,
      speed: this.save.settings.battleSpeed,
      mode: mode === "event" ? "outdoor" : mode,
      waveNumber,
    });
    if (logSummaries && this.outdoorRun) {
      for (const summary of this.outdoorRun.summaries.slice(-4)) {
        this.ui.appendBattleLog({ type: "info", message: summary });
      }
    }
    if (caption) {
      this.ui.appendBattleLog({ type: "info", round: 0, message: caption });
    }
    if (playLogs) {
      this.scheduleNextLog(80);
      return;
    }
    const configuredDelay = Number(CONFIG.outdoor?.waveDelayMs);
    const delay = Math.max(
      180,
      (Number.isFinite(configuredDelay) ? configuredDelay : 720)
        / Math.max(1, this.save.settings.battleSpeed),
    );
    const timer = setTimeout(() => {
      if (typeof this.battle?.settleHandler === "function") this.battle.settleHandler();
    }, delay);
    if (this.outdoorRun && mode === "outdoor") this.outdoorRun.timer = timer;
    this.battle.timer = timer;
  }

  resolveOutdoorWave() {
    const battle = this.battle;
    const run = this.outdoorRun;
    if (!battle || battle.mode !== "outdoor" || battle.settled || !run) return;
    battle.settled = true;
    clearTimeout(battle.timer);
    clearTimeout(run.timer);
    this.ui.applyBattleSnapshot(battle.result.finalState);
    const settled = settleOutdoorWave(
      run.state,
      battle.wave,
      battle.result,
      this.save.hero,
      CONFIG,
    );
    run.state = settled.state;
    const earned = settled.earned;
    if (battle.result.victory) {
      this.recordKillProgress(battle.wave.enemies);
    }
    const waveSummary = battle.result.victory
      ? `✓ 第 ${battle.wave.waveIndex + 1} 波完成 · 经验 +${earned.experience} · 金币 +${earned.gold}${earned.items.length ? ` · 装备 ${earned.items.length}` : ""}`
      : `× 第 ${battle.wave.waveIndex + 1} 波未能清剿，漫步已停止。`;
    run.summaries.push(waveSummary);
    run.summaries = run.summaries.slice(-8);
    this.ui.appendBattleLog({
      type: battle.result.victory ? "reward" : "defeat",
      round: battle.result.rounds,
      message: waveSummary,
    });
    this.battle = null;
    if (!battle.result.victory || run.state.status !== "running") {
      this.finishOutdoorRun(battle.result.victory ? "complete" : "defeat");
      return;
    }

    // 清波后尝试触发事件卡；触发则暂停自动刷怪。
    if (this.tryOpenOutdoorEvent(run)) return;

    this.render();
    this.scheduleOutdoorContinue();
  }

  tryOpenOutdoorEvent(run) {
    const regionId = this.save.world?.currentRegionId
      || getNode(this.save.world?.currentNodeId, CONFIG)?.regionId
      || "forest";
    const completedWaves = run.state.completedWaves;
    const lastEventWave = this.save.eventMeta?.lastEventWave ?? -999;
    const seed = `${run.state.sessionSeed}|event|${completedWaves}`;
    if (!shouldTriggerEvent({ completedWaves, lastEventWave }, seed, CONFIG)) {
      return false;
    }
    const card = pickEventCard({
      regionId,
      worldLevel: getWorldLevel(this.save),
      eventFlags: this.save.eventFlags,
    }, seed, CONFIG);
    if (!card) return false;

    this.pendingEvent = {
      card,
      seed,
      phase: "choice",
      resolution: null,
      completedWaves,
      regionId,
    };
    this.save = updateActiveCharacter(this.save, (active) => ({
      ...active,
      eventMeta: { lastEventWave: completedWaves },
    }));
    this.persist({ silent: true });
    this.render();
    this.ui.showEventCard?.(this.buildViewModel().pendingEvent);
    return true;
  }

  scheduleOutdoorContinue() {
    const run = this.outdoorRun;
    if (!run || run.state.status !== "running" || this.pendingEvent || document.hidden) return;
    const configuredDelay = Number(CONFIG.outdoor?.waveDelayMs);
    const delay = Math.max(
      180,
      (Number.isFinite(configuredDelay) ? configuredDelay : 720)
        / Math.max(1, this.save.settings.battleSpeed),
    );
    run.timer = setTimeout(() => this.startOutdoorWave(), delay);
  }

  chooseEventOption(optionIndex) {
    const pending = this.pendingEvent;
    if (!pending || pending.phase !== "choice") return;
    const resolution = resolveEventOption(
      pending.card,
      Number(optionIndex),
      {
        heroGold: this.save.hero.gold,
        worldLevel: getWorldLevel(this.save),
        lootFloor: Math.max(1, getWorldLevel(this.save)),
        highestUnlockedFloor: this.save.progress.highestUnlockedFloor,
        hero: this.save.hero,
        eventFlags: this.save.eventFlags,
        eventBuffs: this.save.eventBuffs,
        materials: this.save.materials,
        regionId: pending.regionId,
      },
      pending.seed,
      CONFIG,
    );
    if (!resolution.ok && resolution.reason === "not-enough-gold") {
      this.ui.showToast(resolution.resultText || "金币不足。", "error");
      return;
    }
    pending.resolution = resolution;
    pending.phase = resolution.battle ? "battle" : "result";
    this.applyEventResolution(resolution);
    this.persist({ silent: true });
    this.render();
    if (resolution.battle) {
      this.ui.closeEventCard?.();
      this.startEventBattle(resolution.battle);
      return;
    }
    this.ui.showEventCard?.(this.buildViewModel().pendingEvent);
  }

  applyEventResolution(resolution) {
    if (!resolution?.ok) return;
    const goldDelta = Number(resolution.heroPatch?.goldDelta) || 0;
    const expDelta = Number(resolution.heroPatch?.experienceDelta) || 0;
    const items = Array.isArray(resolution.rewards?.items) ? resolution.rewards.items : [];
    const materialGain = resolution.rewards?.materials && typeof resolution.rewards.materials === "object"
      ? resolution.rewards.materials
      : {};
    let nextSave = updateActiveCharacter(this.save, (active) => ({
      ...active,
      eventFlags: resolution.eventFlags ?? active.eventFlags,
      eventBuffs: resolution.eventBuffs ?? active.eventBuffs,
      materials: resolution.materials ?? active.materials,
      quests: this.mergeQuestFlags(active.quests, resolution.questFlags),
    }));

    if (goldDelta || expDelta || items.length) {
      const available = Math.max(0, CONFIG.save.maxInventoryItems - nextSave.hero.inventory.length);
      const stored = items.slice(0, available);
      const overflow = items.slice(available);
      const salvageGold = overflow.reduce((sum, item) => sum + getSellValue(item), 0);
      nextSave = applyVictory(nextSave, {
        experience: Math.max(0, expDelta),
        gold: Math.max(0, goldDelta) + salvageGold,
        loot: stored,
        characterId: nextSave.activeCharacterId,
      });
      // spendGold 为负 delta：applyVictory 只加不减，这里再扣一次支出
      if (goldDelta < 0) {
        nextSave = updateActiveCharacter(nextSave, (active) => ({
          ...active,
          hero: {
            ...active.hero,
            gold: Math.max(0, (active.hero.gold || 0) + goldDelta),
          },
        }));
      }
    } else if (goldDelta < 0) {
      nextSave = updateActiveCharacter(nextSave, (active) => ({
        ...active,
        hero: {
          ...active.hero,
          gold: Math.max(0, (active.hero.gold || 0) + goldDelta),
        },
      }));
    }
    this.save = nextSave;
    // 事件材料增量推进 collect 任务（材料本体已写入 materials）
    if (Object.keys(materialGain).length) {
      let quests = this.save.quests;
      for (const [id, amount] of Object.entries(materialGain)) {
        const qty = Math.max(0, Math.floor(Number(amount) || 0));
        if (!qty) continue;
        quests = progressCollectQuests(quests, id, qty, CONFIG).quests;
      }
      this.save = updateActiveCharacter(this.save, (active) => ({ ...active, quests }));
    }
  }

  mergeQuestFlags(questState, flags) {
    if (!flags || typeof flags !== "object") return questState;
    return {
      ...questState,
      flags: {
        ...(questState?.flags || {}),
        ...Object.fromEntries(
          Object.entries(flags).map(([key, value]) => [key, value === true]),
        ),
      },
    };
  }

  startEventBattle(plan) {
    const seed = plan?.seed || `${this.pendingEvent?.seed}|battle`;
    const wave = createEventBattleWave(this.save, seed, plan, CONFIG);
    this.beginScriptedBattle({
      wave,
      seed: wave.seed || seed,
      mode: "event",
      caption: `⚔️ 事件战斗 · ${this.pendingEvent?.card?.title || "伏击"}`,
      settle: () => this.resolveEventBattle(),
      playLogs: true,
    });
  }

  resolveEventBattle() {
    const battle = this.battle;
    if (!battle || battle.mode !== "event" || battle.settled) return;
    battle.settled = true;
    clearTimeout(battle.timer);
    this.ui.applyBattleSnapshot(battle.result.finalState);

    if (battle.result.victory) {
      this.recordKillProgress(battle.wave.enemies);
      const drops = this.rollEventBattleLoot(battle);
      const delivery = resolveLootBatch(this.save, drops);
      this.save = delivery.save;
      const exp = Number(battle.result.rewards?.experience) || Number(battle.wave.experienceReward) || 0;
      const gold = Number(battle.result.rewards?.gold) || Number(battle.wave.goldReward) || 0;
      if (exp || gold || delivery.storedItems.length) {
        this.save = applyVictory(this.save, {
          experience: exp,
          gold: gold + (delivery.salvageGold || 0),
          loot: delivery.storedItems,
          characterId: this.save.activeCharacterId,
        });
      }
      if (this.pendingEvent) {
        this.pendingEvent.phase = "result";
        this.pendingEvent.resolution = {
          ...(this.pendingEvent.resolution || {}),
          resultText: (this.pendingEvent.resolution?.resultText || "你击退了伏击。")
            + ` 战斗胜利：经验 +${exp}，金币 +${gold}`
            + (delivery.storedItems.length ? `，装备 ${delivery.storedItems.length} 件` : "")
            + "。",
          rewards: {
            ...(this.pendingEvent.resolution?.rewards || {}),
            experience: exp,
            gold,
            items: delivery.storedItems,
          },
        };
      }
      this.ui.appendBattleLog({
        type: "reward",
        message: `✓ 伏击已击退 · 经验 +${exp} · 金币 +${gold}`,
      });
    } else {
      // 事件战斗失败：结束野外漫步，不额外重罚（与野外波次失败一致）
      if (this.pendingEvent) {
        this.pendingEvent.phase = "result";
        this.pendingEvent.resolution = {
          ...(this.pendingEvent.resolution || {}),
          resultText: "你被伏击击退，野外漫步中止。",
        };
      }
      this.battle = null;
      this.ui.closeEventCard?.();
      this.pendingEvent = null;
      this.finishOutdoorRun("defeat");
      return;
    }

    this.battle = null;
    this.persist({ silent: true });
    this.render();
    this.ui.showEventCard?.(this.buildViewModel().pendingEvent);
  }

  rollEventBattleLoot(battle) {
    const chance = Number(battle.wave.eventLootChance);
    const lootChance = Number.isFinite(chance) ? chance : 0.85;
    const minimumRarity = battle.wave.eventMinimumRarity || "uncommon";
    const plans = [];
    for (const enemy of battle.wave.enemies || []) {
      const roll = createSeededRng(`${battle.seed}|event-drop|${enemy.id}`);
      if (roll() < lootChance) {
        plans.push({
          seed: `${battle.seed}|event-loot|${enemy.id}`,
          options: { minimumRarity, idPrefix: "event" },
        });
      }
    }
    if (plans.length === 0) {
      plans.push({
        seed: `${battle.seed}|event-loot-fallback`,
        options: { minimumRarity, idPrefix: "event" },
      });
    }
    return plans
      .map((plan) => generateLoot(battle.floor.id, plan.seed, this.save.hero, plan.options))
      .filter(Boolean);
  }

  continueEvent() {
    if (!this.pendingEvent || this.pendingEvent.phase === "choice") return;
    if (this.pendingEvent.phase === "battle") return;
    this.pendingEvent = null;
    this.ui.closeEventCard?.();
    this.render();
    if (this.outdoorRun?.state?.status === "running") {
      this.scheduleOutdoorContinue();
    }
  }

  recordKillProgress(enemies = []) {
    const templateIds = (Array.isArray(enemies) ? enemies : [])
      .map((enemy) => enemy?.templateId || enemy?.id)
      .filter(Boolean);
    if (templateIds.length === 0) return;
    const progressed = progressKillQuests(this.save.quests, templateIds, CONFIG);
    if (progressed.updates.length === 0) return;
    this.save = updateActiveCharacter(this.save, (active) => ({
      ...active,
      quests: progressed.quests,
    }));
    for (const update of progressed.updates) {
      if (update.complete) {
        this.ui.showToast?.(`任务「${update.name}」目标已达成，可回城镇交付。`, "reward");
      }
    }
  }

  recordDungeonProgress(floorId) {
    if (!Number.isFinite(floorId)) return;
    const progressed = progressDungeonQuests(this.save.quests, floorId, CONFIG);
    if (progressed.updates.length === 0) return;
    this.save = updateActiveCharacter(this.save, (active) => ({
      ...active,
      quests: progressed.quests,
    }));
    for (const update of progressed.updates) {
      if (update.complete) {
        this.ui.showToast?.(`任务「${update.name}」目标已达成，可回城镇交付。`, "reward");
      }
    }
    // 通关 Boss 层后同步区域解锁（syncWorldProgress 在 applyVictory 里也会跑）
    if (this.save.world) {
      this.save = updateActiveCharacter(this.save, (active) => ({
        ...active,
        world: active.world,
      }));
    }
  }

  openNpc(npcId) {
    if (this.battle || this.outdoorRun) {
      this.ui.showToast("请先结束当前活动。", "error");
      return;
    }
    const node = getDialogueNode(npcId, "root", this.save.quests, CONFIG);
    if (!node) {
      this.ui.showToast("对方现在无话可说。", "error");
      return;
    }
    this.dialogue = { npcId, nodeId: node.id || "root" };
    this.render();
    this.ui.showDialogue?.(this.buildViewModel().dialogue);
  }

  chooseDialogueOption(optionIndex) {
    if (!this.dialogue) return;
    const result = chooseDialogueOption(
      this.dialogue.npcId,
      this.dialogue.nodeId,
      Number(optionIndex),
      this.save.quests,
      CONFIG,
    );
    if (!result.ok) {
      this.ui.showToast("对话无法继续。", "error");
      return;
    }
    this.save = updateActiveCharacter(this.save, (active) => ({
      ...active,
      quests: result.quests,
    }));

    if (result.acceptedQuest) {
      this.ui.showToast(`已接取任务「${result.acceptedQuest.name}」。`, "reward");
    }
    if (result.turnedIn) {
      this.grantQuestRewards(result.rewards, result.turnedIn);
      this.ui.showToast(`已交付「${result.turnedIn.name}」。`, "reward");
    }

    if (result.ended || !result.node) {
      this.dialogue = null;
      this.ui.closeDialogue?.();
    } else {
      this.dialogue = {
        npcId: this.dialogue.npcId,
        nodeId: result.nextNodeId || result.node.id || "root",
      };
      this.ui.showDialogue?.(this.buildViewModel().dialogue);
    }
    this.persist();
    this.render();
  }

  grantQuestRewards(rewards = [], quest = null) {
    let experience = 0;
    let gold = 0;
    const items = [];
    const materials = {};
    for (const reward of rewards) {
      if (!reward || typeof reward !== "object") continue;
      if (reward.type === "experience") {
        experience += Math.max(0, Math.floor(Number(reward.amount) || 0));
      } else if (reward.type === "gold") {
        gold += Math.max(0, Math.floor(Number(reward.amount) || 0));
      } else if (reward.type === "material") {
        const id = String(reward.id || reward.materialId || "").trim();
        const amount = Math.max(1, Math.floor(Number(reward.amount) || 1));
        if (id) materials[id] = (materials[id] || 0) + amount;
      } else if (reward.type === "loot") {
        const item = generateLoot(
          Math.max(1, getWorldLevel(this.save)),
          `${this.save.activeCharacterId}|quest|${quest?.id || "reward"}|${items.length}|${Date.now()}`,
          this.save.hero,
          {
            idPrefix: "quest",
            minimumRarity: reward.rarityBias || reward.minimumRarity || undefined,
            classId: this.save.hero.classId,
          },
        );
        if (item) items.push(item);
      }
    }
    const available = Math.max(0, CONFIG.save.maxInventoryItems - this.save.hero.inventory.length);
    const stored = items.slice(0, available);
    const overflow = items.slice(available);
    const salvageGold = overflow.reduce((sum, item) => sum + getSellValue(item), 0);
    if (experience || gold || salvageGold || stored.length) {
      this.save = applyVictory(this.save, {
        experience,
        gold: gold + salvageGold,
        loot: stored,
        characterId: this.save.activeCharacterId,
      });
    }
    if (Object.keys(materials).length) this.gainMaterials(materials);
  }

  closeDialogue() {
    this.dialogue = null;
    this.ui.closeDialogue?.();
    this.render();
  }

  openQuestLog() {
    this.ui.showQuestLog?.(listQuestLog(this.save.quests, CONFIG));
  }

  closeQuestLog() {
    this.ui.closeQuestLog?.();
  }

  stopOutdoor(reason = "manual") {
    if (!this.outdoorRun) return;
    if (this.pendingEvent) {
      this.pendingEvent = null;
      this.ui.closeEventCard?.();
    }
    if (this.battle?.mode === "outdoor" || this.battle?.mode === "event") {
      clearTimeout(this.battle.timer);
      this.battle = null;
    }
    clearTimeout(this.outdoorRun.timer);
    this.finishOutdoorRun(reason);
  }

  finishOutdoorRun(reason = "manual") {
    const run = this.outdoorRun;
    if (!run) return;
    clearTimeout(run.timer);
    if (this.pendingEvent) {
      this.pendingEvent = null;
      this.ui.closeEventCard?.();
    }
    const stopped = reduceStopOutdoorRun(run.state);
    const settlement = this.applyOutdoorSettlement(stopped.settlement);
    const previousOutdoor = this.save.outdoor ?? {};
    this.save = updateActiveCharacter(this.save, (active) => ({
      ...active,
      outdoor: {
        status: "idle",
        sessionSeed: null,
        nextWaveIndex: 0,
        completedWaves: Math.min(
          Number.MAX_SAFE_INTEGER,
          Math.max(0, Number(previousOutdoor.completedWaves) || 0) + stopped.summary.completedWaves,
        ),
        defeats: Math.min(
          Number.MAX_SAFE_INTEGER,
          Math.max(0, Number(previousOutdoor.defeats) || 0) + stopped.summary.defeats,
        ),
        rewards: { experience: 0, gold: 0, items: [], materials: {} },
      },
    }));
    this.outdoorRun = null;
    this.battle = null;
    this.adventureMode = "outdoor";
    this.worldScene = "outdoor";
    this.ui.returnToDungeon("outdoor");
    this.render();
    const saved = this.persist({ silent: true });
    const result = {
      ...stopped.summary,
      ...settlement,
      reason,
      saveFailed: !saved,
      summary: reason === "hidden"
        ? "页面隐藏，野外漫步已停止；没有计算离线收益。"
        : reason === "defeat"
          ? "荒野中的敌群终止了本次漫步。"
          : "本次漫步已结束，收益已结算。",
    };
    if (reason === "hidden") {
      this.ui.showToast("页面已隐藏，野外漫步已停止；没有离线收益。", "error");
    } else {
      this.ui.showOutdoorResult?.(result);
    }
  }

  applyOutdoorSettlement(settlement = {}) {
    const items = Array.isArray(settlement.items) ? settlement.items : [];
    const available = Math.max(0, CONFIG.save.maxInventoryItems - this.save.hero.inventory.length);
    const storedItems = items.slice(0, available);
    const overflowItems = items.slice(available);
    const salvageGold = overflowItems.reduce((sum, item) => sum + getSellValue(item), 0);
    const gainedMaterials = settlement.materials && typeof settlement.materials === "object"
      ? settlement.materials
      : {};
    const materialCount = Object.values(gainedMaterials)
      .reduce((sum, amount) => sum + (Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0), 0);
    const experience = Number.isFinite(settlement.experience) ? Math.max(0, Math.floor(settlement.experience)) : 0;
    const gold = Number.isFinite(settlement.gold) ? Math.max(0, Math.floor(settlement.gold)) : 0;
    if (experience || gold || salvageGold || storedItems.length) {
      this.save = applyVictory(this.save, {
        experience,
        gold: gold + salvageGold,
        loot: storedItems,
        characterId: this.save.activeCharacterId,
      });
    }
    if (materialCount > 0) {
      this.gainMaterials(gainedMaterials);
    }
    const materialLabels = Object.entries(gainedMaterials)
      .filter(([, amount]) => Number(amount) > 0)
      .map(([id, amount]) => formatMaterialChip(id, amount, CONFIG));
    return {
      experience,
      gold: gold + salvageGold,
      itemsStored: storedItems.length,
      itemsSalvaged: overflowItems.length,
      salvageGold,
      materialCount,
      materialLabels,
    };
  }

  /** 合并材料并推进 collect 任务。 */
  gainMaterials(gained = {}) {
    if (!gained || typeof gained !== "object") return;
    const nextMaterials = addMaterials(this.save.materials, gained);
    let quests = this.save.quests;
    const updates = [];
    for (const [id, amount] of Object.entries(gained)) {
      const qty = Math.max(0, Math.floor(Number(amount) || 0));
      if (!qty) continue;
      const progressed = progressCollectQuests(quests, id, qty, CONFIG);
      quests = progressed.quests;
      updates.push(...progressed.updates);
    }
    this.save = updateActiveCharacter(this.save, (active) => ({
      ...active,
      materials: nextMaterials,
      quests,
    }));
    for (const update of updates) {
      if (update.complete) {
        this.ui.showToast?.(`任务「${update.name}」目标已达成，可回城镇交付。`, "reward");
      }
    }
  }

  scheduleNextLog(delay) {
    if (!this.battle || this.battle.settled) return;
    clearTimeout(this.battle.timer);
    this.battle.timer = setTimeout(() => this.playNextLog(), Math.max(0, delay));
  }

  playNextLog() {
    const battle = this.battle;
    if (!battle || battle.settled) return;
    const entry = battle.result.logs[battle.index];
    if (!entry) {
      this.settleBattle();
      return;
    }
    battle.index += 1;
    battle.lastSnapshot = entry.snapshot;
    this.ui.appendBattleLog(entry);
    this.ui.applyBattleSnapshot(entry.snapshot);
    this.scheduleNextLog(this.getLogDelay(entry));
  }

  getLogDelay(entry) {
    const multiplier = this.save.settings.battleSpeed;
    const weight = entry.type === "round_start"
      ? 0.55
      : entry.type === "action" ? 1 : 0.75;
    return BASE_LOG_DELAY * weight / multiplier;
  }

  setBattleSpeed(speed) {
    if (![1, 2, 3].includes(speed)) return;
    this.save.settings.battleSpeed = speed;
    this.persist();
    this.ui.updateSpeed(speed);
  }

  skipBattle() {
    const battle = this.battle;
    if (!battle || battle.settled) return;
    clearTimeout(battle.timer);
    if (battle.mode === "outdoor") {
      this.resolveOutdoorWave();
      return;
    }
    if (battle.mode === "event") {
      this.resolveEventBattle();
      return;
    }
    battle.index = battle.result.logs.length;
    this.ui.appendBattleLog({
      type: "info",
      round: battle.result.rounds,
      message: "» 已跳过余下战斗演出，直接查看结算。",
    });
    this.settleBattle();
  }

  retreatBattle() {
    const battle = this.battle;
    if (!battle || battle.settled) return;
    if (battle.mode === "outdoor" || battle.mode === "event") {
      this.stopOutdoor();
      return;
    }
    if (!globalThis.confirm("确定撤退吗？本次战斗不会获得收益，但只会承担较轻的损失。")) return;
    clearTimeout(battle.timer);
    battle.retreat = true;
    battle.result = {
      ...battle.result,
      victory: false,
      won: false,
      outcome: "retreat",
      reason: "retreat",
      rewards: { experience: 0, xp: 0, gold: 0, defeatedEnemyIds: [] },
    };
    battle.index = battle.result.logs.length;
    this.ui.appendBattleLog({
      type: "defeat",
      round: battle.result.rounds,
      message: "↩ 你选择撤退，保留角色但放弃本次战斗收益。",
    });
    this.settleBattle();
  }

  settleBattle() {
    const battle = this.battle;
    if (!battle || battle.settled) return;
    if (battle.mode === "outdoor") {
      this.resolveOutdoorWave();
      return;
    }
    if (battle.mode === "event") {
      this.resolveEventBattle();
      return;
    }
    battle.settled = true;
    clearTimeout(battle.timer);
    if (battle.retreat) {
      if (battle.lastSnapshot) this.ui.applyBattleSnapshot(battle.lastSnapshot);
    } else {
      this.ui.applyBattleSnapshot(battle.result.finalState);
    }
    this.ui.finishBattle(battle.result.victory, battle.retreat === true);

    const previousHero = this.save.hero;
    const previousLevel = previousHero.level;
    const previousSkillPoints = getSkillPointState(previousHero).unspent;
    const previousHighestFloor = this.save.progress.highestUnlockedFloor;
    let resultView;
    this.save = clearPendingBattle(this.save);

    if (battle.result.victory) {
      this.recordKillProgress(battle.wave.enemies);
      this.recordDungeonProgress(battle.floor?.id);
      // 第四批:Boss 必掉双件且稀有度保底,击杀精英有概率追加战利品。
      const drops = this.rollVictoryLoot(battle, previousHero);
      const delivery = resolveLootBatch(this.save, drops);
      this.save = delivery.save;
      const { storedItems, salvagedItems, salvageGold } = delivery;
      battle.loot = storedItems[0] ?? null;
      this.save = applyVictory(this.save, {
        ...battle.result,
        floorId: battle.floor.id,
        loot: storedItems,
        characterId: battle.characterId,
      });
      for (const item of storedItems) {
        this.ui.appendBattleLog({
          type: "loot",
          round: battle.result.rounds,
          message: `💎 获得战利品：${item.name}（${rarityLabel(item.rarity)}）。`,
        });
      }
      if (salvagedItems.length > 0) {
        this.ui.appendBattleLog({
          type: "loot",
          round: battle.result.rounds,
          message: `💰 背包已满，${salvagedItems.map((item) => item.name).join("、")} 自动分解为 ${salvageGold} 枚金币。`,
        });
      }
      resultView = {
        victory: true,
        experience: battle.result.rewards.experience,
        gold: battle.result.rewards.gold,
        lootItems: storedItems,
        loot: storedItems[0] ?? null,
        salvagedItems,
        salvagedItem: salvagedItems[0] ?? null,
        salvageGold,
        previousEquipment: previousHero.equipment,
        equippedItem: storedItems[0] ? previousHero.equipment[storedItems[0].slot] : null,
        statistics: battle.result.statistics,
        eliteCount: battle.wave.enemies.filter((enemy) => enemy.isElite).length,
        bossFloor: battle.floor.boss === true,
        level: this.save.hero.level,
        levelsGained: this.save.hero.level - previousLevel,
        skillPointsGained: Math.max(
          0,
          getSkillPointState(this.save.hero).unspent - previousSkillPoints,
        ),
        floorId: battle.floor.id,
        // 胜利且下一层已解锁时,"再战"按钮升级为"挑战下一层"。
        nextFloorId: isFloorUnlocked(this.save, battle.floor.id + 1)
          ? battle.floor.id + 1
          : battle.floor.id,
        canRepeat: true,
        summary: this.describeVictory(battle.floor.id, previousHighestFloor),
      };
    } else {
      const penalty = getDefeatPenalty(this.save, battle.retreat === true);
      this.save = applyDefeat(this.save, {
        ...battle.result,
        floorId: battle.floor.id,
        retreat: battle.retreat === true,
        characterId: battle.characterId,
      });
      resultView = {
        victory: false,
        experienceLost: penalty.experience,
        goldLost: penalty.gold,
        retreat: battle.retreat === true,
        statistics: battle.retreat ? null : battle.result.statistics,
        floorId: battle.floor.id,
        nextFloorId: battle.floor.id,
        canRepeat: true,
        summary: battle.retreat
          ? `你从第 ${battle.floor.id} 层撤回营地，保留了角色与装备。`
          : `第 ${battle.floor.id} 层的敌群击退了你。`,
        diagnosis: battle.retreat ? null : diagnoseDefeat({
          heroStats: { ...getHeroStats(previousHero), power: getPower(previousHero) },
          skillPointState: getSkillPointState(previousHero),
          statistics: { ...battle.result.statistics, rounds: battle.result.rounds },
          floor: {
            ...battle.floor,
            recommendedPower: getFloorPacing(battle.floor.id)?.recommendedPower
              ?? battle.floor.recommendedPower,
          },
        }),
      };
    }

    const saved = this.persist({ silent: true });
    resultView.saveFailed = !saved;
    this.render();
    this.ui.showResult(resultView);
  }

  equip(itemId) {
    if (this.battle && !this.battle.settled) {
      this.ui.showToast("战斗中无法更换装备。", "error");
      return;
    }
    if (getPendingReforge(this.save)) {
      this.ui.showToast("请先决定是否采用本次重铸词条。", "error");
      return;
    }
    const item = this.save.hero.inventory.find((entry) => entry.id === itemId);
    if (!item) return;
    const before = this.save.hero.equipment[item.slot];
    this.save.hero = equipItem(this.save.hero, item);
    const equipped = this.save.hero.equipment[item.slot]?.id === item.id;
    if (!equipped) {
      this.ui.showToast("背包已满，暂时无法替换装备。", "error");
      return;
    }
    const saved = this.persist();
    this.render();
    if (saved) {
      this.ui.showToast(
        before ? `已用「${item.name}」替换「${before.name}」。` : `已装备「${item.name}」。`,
        "reward",
      );
    }
    if (saved && this.battle?.settled) this.ui.closeResult();
  }

  sellItem(itemId) {
    if (this.battle && !this.battle.settled) {
      this.ui.showToast("战斗中无法整理背包。", "error");
      return;
    }
    if (getPendingReforge(this.save)) {
      this.ui.showToast("重铸结果待确认，暂时无法出售装备。", "error");
      return;
    }
    const item = this.save.hero.inventory.find((entry) => entry.id === itemId);
    if (!item) return;
    if (item.locked === true) {
      this.ui.showToast("已锁定的装备无法出售，请先解锁。", "error");
      return;
    }
    if (!globalThis.confirm(`出售「${item.name}」并获得金币吗？`)) return;
    const value = getSellValue(item);
    this.save.hero = {
      ...this.save.hero,
      inventory: this.save.hero.inventory.filter((entry) => entry.id !== itemId),
      gold: this.save.hero.gold + value,
    };
    const saved = this.persist();
    this.render();
    if (saved) this.ui.showToast(`已出售「${item.name}」，获得 ${value} 枚金币。`, "reward");
  }

  unequip(slot) {
    if (this.battle && !this.battle.settled) {
      this.ui.showToast("战斗中无法更换装备。", "error");
      return;
    }
    if (getPendingReforge(this.save)) {
      this.ui.showToast("请先处理重铸结果，再更换装备。", "error");
      return;
    }
    const item = this.save.hero.equipment[slot];
    if (!item) return;
    this.save.hero = unequipItem(this.save.hero, slot);
    if (this.save.hero.equipment[slot]) {
      this.ui.showToast("背包已满，无法卸下。", "error");
      return;
    }
    const saved = this.persist();
    this.render();
    if (saved) this.ui.showToast(`已卸下「${item.name}」。`);
  }

  spendStatPoint(stat) {
    if (this.battle && !this.battle.settled) return;
    if (this.save.settings.autoAllocate) {
      this.ui.showToast("关闭自动推荐后即可手动加点。", "error");
      return;
    }
    const previousPoints = this.save.hero.unspentStatPoints;
    this.save.hero = allocateStat(this.save.hero, stat, 1);
    if (this.save.hero.unspentStatPoints === previousPoints) return;
    this.persist();
    this.render();
  }

  spendSkillPoint(skillId) {
    if (this.battle && !this.battle.settled) {
      this.ui.showToast("战斗中无法调整技能构筑。", "error");
      return;
    }
    const before = getSkillPointState(this.save.hero);
    const nextHero = upgradeSkill(this.save.hero, skillId, 1);
    const after = getSkillPointState(nextHero);
    if (after.unspent === before.unspent) return;
    this.save.hero = nextHero;
    const saved = this.persist();
    this.render();
    if (saved) this.ui.showToast("技能等级已提升。", "reward");
  }

  chooseSkillBranch(skillId, branchId) {
    if (this.battle && !this.battle.settled) {
      this.ui.showToast("战斗中无法调整技能构筑。", "error");
      return;
    }
    const currentSkill = getHeroSkills(this.save.hero)
      .find((skill) => skill.id === skillId);
    const branch = currentSkill?.branches?.find((entry) => entry.id === branchId);
    if (!branch || currentSkill?.branchUnlocked !== true) {
      this.ui.showToast("该派生尚未解锁。", "error");
      return;
    }
    if (currentSkill.selectedBranchId && currentSkill.selectedBranchId !== branchId) {
      this.ui.showToast("派生选择已经锁定，请先重置技能构筑。", "error");
      return;
    }
    if (currentSkill.selectedBranchId === branchId) return;
    if (!globalThis.confirm(`选择「${branch.name}」作为${currentSkill.name}的派生？确认后只能通过重置技能更换。`)) return;
    const nextHero = chooseSkillBranch(this.save.hero, skillId, branchId);
    if (getSkillBranchChoice(nextHero, skillId) !== branchId) return;
    this.save.hero = nextHero;
    const saved = this.persist();
    this.render();
    if (saved) this.ui.showToast(`已选择「${branch.name}」。`, "reward");
  }

  resetSkills() {
    if (this.battle && !this.battle.settled) {
      this.ui.showToast("战斗中无法重置技能。", "error");
      return;
    }
    const before = getSkillPointState(this.save.hero);
    if (before.spent <= 0) return;
    if (!globalThis.confirm("重置技能点并返还全部已投入点数吗？")) return;
    this.save.hero = resetSkillPoints(this.save.hero);
    const saved = this.persist();
    this.render();
    if (saved) this.ui.showToast("技能点已返还，可以重新构筑。", "reward");
  }

  prestige() {
    if (this.battle && !this.battle.settled) {
      this.ui.showToast("战斗中无法转生。", "error");
      return;
    }
    const preview = getPrestigePreview(this.save.hero);
    if (!preview.eligible) {
      this.ui.showToast("达到满级后才能转生。", "error");
      return;
    }
    const confirmed = globalThis.confirm(
      `转生后等级和基础属性将回到 1 级，装备、背包和金币保留。\n` +
      `永久战斗加成 +${Math.round(preview.multiplierGain * 100)}%，层数上限提升至 ${preview.nextFloorCap}。确定转生吗？`,
    );
    if (!confirmed) return;
    this.save = applyPrestige(this.save);
    this.selectedFloorId = Math.min(
      this.selectedFloorId,
      getFloorCap(this.save),
      this.save.progress.highestUnlockedFloor,
    );
    const saved = this.persist();
    this.render();
    if (saved) this.ui.showToast(`第 ${preview.nextCount} 次转生完成，装备与金币已保留。`, "reward");
  }

  openClassSelection() {
    this.openCharacterManager();
  }

  selectClass(classId) {
    this.createCharacter(classId, "");
  }

  checkShopRefresh() {
    if (this.battle && !this.battle.settled) {
      this.ui.showToast("战斗中无法刷新商店。", "error");
      return;
    }
    const result = ensureShop(this.save);
    this.save = result.save;
    if (result.refreshed) {
      const saved = this.persist();
      this.render();
      if (saved) this.ui.showToast("商店货架已更新。", "reward");
      return;
    }
    const interval = CONFIG.economy.shop.refreshEveryVictories;
    const remaining = Math.max(
      0,
      interval - (this.save.progress.totalVictories - this.save.economy.shop.lastRefreshVictory),
    );
    this.ui.showToast(`商店将在 ${remaining} 次胜利后自动刷新。`);
  }

  buyItem(listingId) {
    if (this.battle && !this.battle.settled) {
      this.ui.showToast("战斗中无法购买装备。", "error");
      return;
    }
    const result = purchaseShopItem(this.save, listingId);
    if (!result.ok) {
      this.ui.showToast(shopFailureMessage(result.reason), "error");
      return;
    }
    this.save = result.save;
    const saved = this.persist();
    this.render();
    if (saved) this.ui.showToast(`已购买「${result.item.name}」，花费 ${result.price} 金币。`, "reward");
  }

  reforge(itemId, location = "inventory", slot = null) {
    if (this.battle && !this.battle.settled) {
      this.ui.showToast("战斗中无法重铸装备。", "error");
      return;
    }
    if (getPendingReforge(this.save)) {
      this.ui.showToast("请先处理当前重铸结果。", "error");
      return;
    }
    const result = beginReforge(this.save, { location, itemId, slot });
    if (!result.ok) {
      this.ui.showToast(reforgeFailureMessage(result.reason), "error");
      return;
    }
    this.save = result.save;
    const saved = this.persist();
    this.render();
    if (saved) this.ui.showReforge?.(getPendingReforge(this.save));
  }

  finishReforge(choice) {
    if (this.battle && !this.battle.settled) return;
    const result = resolveReforge(this.save, choice);
    if (!result.ok) {
      this.ui.showToast(reforgeFailureMessage(result.reason), "error");
      return;
    }
    this.save = result.save;
    const saved = this.persist();
    this.ui.closeReforge?.();
    this.render();
    if (saved) this.ui.showToast(
      result.choice === "replace" ? "已采用新词条。" : "已保留原词条。",
      "reward",
    );
  }

  /**
   * Deterministic victory drop plan: normal-floor base drops follow the
   * progression-stage chance, bosses stay guaranteed and add
   * `bossLoot.extraDrops` with a rarity floor. Every defeated elite still has
   * an independent seeded chance to add one drop.
   */
  rollVictoryLoot(battle, hero) {
    const bossRules = CONFIG.loot.bossLoot ?? {};
    const minimumRarity = battle.floor.boss
      ? resolveBossMinimumRarity(battle.floor.bossTier)
      : null;
    const baseOptions = minimumRarity ? { minimumRarity } : {};
    const plans = shouldDropBaseLoot(battle.floor.id, battle.seed)
      ? [{ seed: `${battle.seed}|drop`, options: baseOptions }]
      : [];
    if (battle.floor.boss) {
      const extraDrops = Math.max(0, Math.floor(Number(bossRules.extraDrops) || 0));
      for (let index = 0; index < extraDrops; index += 1) {
        plans.push({ seed: `${battle.seed}|drop-boss-${index}`, options: baseOptions });
      }
    }
    const bonusChance = Math.min(1, Math.max(0, Number(CONFIG.dungeon.elites?.bonusLootChance) || 0));
    for (const enemy of battle.wave.enemies) {
      if (!enemy.isElite || bonusChance <= 0) continue;
      const roll = createSeededRng(`${battle.seed}|elite-drop|${enemy.id}`);
      if (roll() < bonusChance) {
        plans.push({ seed: `${battle.seed}|drop-elite|${enemy.id}`, options: {} });
      }
    }
    return plans
      .map((plan) => generateLoot(battle.floor.id, plan.seed, hero, plan.options))
      .map((item, index) => item && battle.floor.boss
        ? applyBossSignature(item, battle.floor.id, index)
        : item)
      .filter(Boolean);
  }

  describeVictory(floorId, previousHighest) {
    if (floorId >= CONFIG.dungeon.maxFloor) return "最深处的领主已经倒下，仍可重复挑战获取装备。";
    const cap = getFloorCap(this.save);
    if (floorId + 1 > cap) return `第 ${floorId} 层已肃清；达到满级并转生后才能继续深入。`;
    if (floorId + 1 > previousHighest) return `第 ${floorId} 层已肃清，更深一层已经开放。`;
    return `第 ${floorId} 层已肃清，战利品已收入背包。`;
  }

  toggleAutoAllocate(enabled) {
    if (this.battle && !this.battle.settled) {
      this.ui.showToast("战斗中无法修改加点模式。", "error");
      return;
    }
    this.save.settings.autoAllocate = enabled === true;
    if (this.save.settings.autoAllocate) {
      this.save.hero = applyAutoAllocation(this.save.hero);
    }
    const saved = this.persist();
    this.render();
    if (saved) this.ui.showToast(
      enabled
        ? `已启用${CONFIG.classes[this.save.hero.classId]?.name ?? "职业"}推荐加点。`
        : "已切换为手动加点。",
    );
  }

  closeResult() {
    if (this.battle && !this.battle.settled) return;
    const outdoor = this.ui.lastResult?.outdoor === true;
    this.battle = null;
    const scene = outdoor ? "outdoor" : (this.worldScene === "dungeon" ? "dungeon" : "dungeon");
    this.worldScene = scene;
    this.adventureMode = outdoor ? "outdoor" : "dungeon";
    this.ui.returnToDungeon(scene);
    this.render();
    if (!outdoor) this.ui.focusDungeonEntry();
  }

  /** "再战本层 / 挑战下一层":关掉结算直接开下一场,少两次点击。 */
  repeatBattle() {
    if (this.battle && !this.battle.settled) return;
    const result = this.ui.lastResult;
    if (!result || result.outdoor === true || result.canRepeat !== true) return;
    const target = getFloor(result.nextFloorId)?.id ?? this.selectedFloorId;
    this.ui.closeResult();
    if (isFloorUnlocked(this.save, target)) this.selectedFloorId = target;
    this.render();
    this.startBattle();
  }

  exportSave() {
    try {
      const payload = JSON.stringify(this.save, null, 2);
      const blob = new Blob([payload], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `文字地牢存档-${stamp}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2_000);
      this.ui.showToast("存档已导出为文件，请妥善保存。", "reward");
    } catch {
      this.ui.showToast("导出失败，请重试。", "error");
    }
  }

  importSave(text) {
    if (this.battle || this.outdoorRun) {
      this.ui.showToast("战斗中无法导入存档。", "error");
      return;
    }
    let parsed = null;
    try {
      parsed = JSON.parse(String(text ?? ""));
    } catch {
      parsed = null;
    }
    const looksLikeSave = parsed && typeof parsed === "object"
      && (Array.isArray(parsed.characters) || typeof parsed.hero === "object");
    if (!looksLikeSave) {
      this.ui.showToast("这不是有效的文字地牢存档文件。", "error");
      return;
    }
    if (!globalThis.confirm("导入将覆盖当前浏览器里的全部角色与进度，确定继续吗？")) return;
    const imported = ensureShop(projectActiveCharacter(sanitizeSave(parsed))).save;
    const interrupted = imported.pendingBattle;
    this.save = resolveImportedPendingBattle(imported).save;
    this.selectedFloorId = Math.min(
      getFloorCap(this.save),
      this.save.progress.highestUnlockedFloor,
    );
    this.adventureMode = "map";
    this.worldScene = "map";
    this.battle = null;
    this.outdoorRun = null;
    const saved = this.persist();
    this.ui.closeResult();
    this.ui.returnToDungeon("map");
    this.render();
    if (saved) {
      const message = interrupted
        ? `存档已导入；未完成的第 ${interrupted.floorId} 层战斗已按撤退结算。`
        : `存档已导入，当前角色「${this.save.hero.name}」。`;
      this.ui.showToast(message, interrupted ? "error" : "reward");
    }
  }

  /** 批量出售指定稀有度及以下的未锁定装备,一次确认。 */
  bulkSell(rarity) {
    if (this.battle && !this.battle.settled) {
      this.ui.showToast("战斗中无法整理背包。", "error");
      return;
    }
    if (getPendingReforge(this.save)) {
      this.ui.showToast("重铸结果待确认，暂时无法出售装备。", "error");
      return;
    }
    const threshold = RARITY_IDS.indexOf(rarity);
    if (threshold < 0) return;
    const targets = this.save.hero.inventory.filter((item) =>
      RARITY_IDS.indexOf(item.rarity) <= threshold && item.locked !== true);
    if (targets.length === 0) {
      this.ui.showToast("没有符合条件的装备（已锁定的会自动跳过）。");
      return;
    }
    const total = targets.reduce((sum, item) => sum + getSellValue(item), 0);
    const confirmed = globalThis.confirm(
      `批量出售 ${targets.length} 件「${rarityLabel(rarity)}」及以下的装备（已锁定的不受影响），共获得 ${total} 枚金币？`,
    );
    if (!confirmed) return;
    const ids = new Set(targets.map((item) => item.id));
    this.save.hero = {
      ...this.save.hero,
      inventory: this.save.hero.inventory.filter((item) => !ids.has(item.id)),
      gold: this.save.hero.gold + total,
    };
    const saved = this.persist();
    this.render();
    if (saved) this.ui.showToast(`已出售 ${targets.length} 件装备，获得 ${total} 枚金币。`, "reward");
  }

  /** 一键装备最强:逐部位挑选"装上后战力提升最大"的背包装备并穿上。 */
  equipBestGear() {
    if (this.battle && !this.battle.settled) {
      this.ui.showToast("战斗中无法更换装备。", "error");
      return;
    }
    if (getPendingReforge(this.save)) {
      this.ui.showToast("请先决定是否采用本次重铸词条。", "error");
      return;
    }
    let changed = 0;
    // 反复扫描:每轮为每个部位找收益最高的升级件穿上,直到没有可提升的为止。
    // 逐件调用纯函数 equipItem,天然按职业加权,也自动处理背包容量。
    let keepGoing = true;
    while (keepGoing) {
      keepGoing = false;
      for (const slot of EQUIPMENT_SLOT_IDS) {
        let bestItem = null;
        let bestDelta = 0;
        for (const item of this.save.hero.inventory) {
          if (item.slot !== slot) continue;
          const delta = getEquipUpgradeDelta(this.save.hero, item);
          if (delta > bestDelta) {
            bestDelta = delta;
            bestItem = item;
          }
        }
        if (bestItem) {
          const next = equipItem(this.save.hero, bestItem);
          if (next.equipment[slot]?.id === bestItem.id) {
            this.save.hero = next;
            changed += 1;
            keepGoing = true;
          }
        }
      }
    }
    if (changed === 0) {
      this.ui.showToast("当前装备已是背包里的最优组合。");
      return;
    }
    const saved = this.persist();
    this.render();
    if (saved) this.ui.showToast(`已自动装备 ${changed} 件更强的装备。`, "reward");
  }

  /** 锁定/解锁装备(背包或已装备),锁定后不可被出售。 */
  toggleLock(itemId) {
    if (this.battle && !this.battle.settled) return;
    if (getPendingReforge(this.save)) {
      this.ui.showToast("请先处理重铸结果。", "error");
      return;
    }
    let toggledName = null;
    let lockedNow = false;
    const inventory = this.save.hero.inventory.map((item) => {
      if (item.id !== itemId) return item;
      toggledName = item.name;
      lockedNow = item.locked !== true;
      return { ...item, locked: lockedNow };
    });
    let equipment = this.save.hero.equipment;
    if (!toggledName) {
      for (const [slot, item] of Object.entries(equipment)) {
        if (!item || item.id !== itemId) continue;
        toggledName = item.name;
        lockedNow = item.locked !== true;
        equipment = { ...equipment, [slot]: { ...item, locked: lockedNow } };
        break;
      }
    }
    if (!toggledName) return;
    this.save.hero = { ...this.save.hero, inventory, equipment };
    const saved = this.persist();
    this.render();
    if (saved) this.ui.showToast(lockedNow ? `已锁定「${toggledName}」，不会被出售。` : `已解锁「${toggledName}」。`);
  }

  toggleSound() {
    this.save.settings.soundEnabled = this.save.settings.soundEnabled === false;
    const enabled = this.save.settings.soundEnabled;
    this.persist();
    this.render();
    this.ui.showToast(enabled ? "音效已开启。" : "音效已关闭。");
  }

  toggleLanguage() {
    const current = normalizeLanguage(this.save.settings.language);
    const next = current === "zh-CN" ? "en-US" : "zh-CN";
    this.save.settings.language = next;
    const saved = this.persist();
    this.render();
    if (saved) this.ui.showToast(t("language.switched", next), "reward");
  }

  resetProgress() {
    if ((this.battle && !this.battle.settled) || this.outdoorRun) {
      this.ui.showToast("请先结束当前战斗。", "error");
      return;
    }
    if (!globalThis.confirm("确定重置文字地牢的全部角色、装备和进度吗？")) return;
    this.save = clearProgress(this.save);
    this.save = ensureShop(this.save).save;
    this.selectedFloorId = CONFIG.dungeon.minFloor;
    this.battle = null;
    this.outdoorRun = null;
    this.adventureMode = "map";
    this.worldScene = "map";
    const saved = this.persist();
    this.ui.closeResult();
    this.ui.returnToDungeon("map");
    this.render();
    this.ui.showCharacterManager?.(this.buildViewModel());
    if (saved) this.ui.showToast("地牢存档已重置。");
  }

  persist({ silent = false } = {}) {
    this.save = projectActiveCharacter(this.save);
    const saved = saveSave(this.save);
    if (!saved && !silent) {
      this.ui.showSaveError();
    }
    return saved;
  }
}

/** Later rules win, so tiers listed ascending upgrade the floor progressively. */
function resolveBossMinimumRarity(bossTier) {
  const rules = Array.isArray(CONFIG.loot.bossLoot?.minimumRarityByTier)
    ? CONFIG.loot.bossLoot.minimumRarityByTier
    : [];
  let result = null;
  for (const rule of rules) {
    if (Number.isFinite(rule?.minTier)
      && bossTier >= rule.minTier
      && typeof rule?.rarity === "string") {
      result = rule.rarity;
    }
  }
  return result;
}

/** Boss drops carry a visible, deterministic provenance without changing roll power. */
export function applyBossSignature(item, floorId, index) {
  if (!item) return item;
  const label = floorId >= 100
    ? "虚空君王的"
    : floorId >= 85
      ? "虚空检验的"
      : floorId >= 50
        ? "深渊守门者的"
        : "守门者的";
  return {
    ...item,
    id: `${item.id}-boss-${floorId}-${index}`,
    name: item.name.startsWith(label) ? item.name : `${label}${item.name}`.slice(0, 50),
  };
}

function rarityLabel(rarity) {
  return {
    common: "普通",
    uncommon: "优秀",
    rare: "稀有",
    legendary: "传说",
  }[rarity] ?? "普通";
}

function shopFailureMessage(reason) {
  return {
    "inventory-full": "背包已满，无法购买。",
    "insufficient-gold": "金币不足。",
    "listing-not-found": "这件商品已售出或已下架。",
    "duplicate-item": "这件商品已经在你的物品栏中。",
  }[reason] ?? "暂时无法购买这件商品。";
}

function reforgeFailureMessage(reason) {
  return {
    "insufficient-gold": "金币不足，无法重铸。",
    "insufficient-material": "材料不足，无法重铸（需要荒野精华）。",
    "item-not-found": "找不到这件装备。",
    "reforge-pending": "请先处理上一件装备的重铸结果。",
    "no-pending-reforge": "没有待处理的重铸结果。",
    "item-changed": "装备状态已变化，请重新开始重铸。",
  }[reason] ?? "暂时无法重铸这件装备。";
}

export function resolveLootDelivery(save, loot, limit = CONFIG.save.maxInventoryItems) {
  if ((save?.hero?.inventory?.length ?? 0) < limit) {
    return { save, storedLoot: loot, salvagedItem: null, salvageGold: 0 };
  }
  const salvageGold = getSellValue(loot);
  return {
    save: {
      ...save,
      hero: { ...save.hero, gold: save.hero.gold + salvageGold },
    },
    storedLoot: null,
    salvagedItem: loot,
    salvageGold,
  };
}

/** Delivers a whole drop batch while reserving slots accepted earlier in the batch. */
export function resolveLootBatch(save, drops, limit = CONFIG.save.maxInventoryItems) {
  let next = save;
  const storedItems = [];
  const salvagedItems = [];
  let salvageGold = 0;
  for (const loot of Array.isArray(drops) ? drops : []) {
    const delivery = resolveLootDelivery(next, loot, limit - storedItems.length);
    next = delivery.save;
    if (delivery.storedLoot) storedItems.push(delivery.storedLoot);
    if (delivery.salvagedItem) {
      salvagedItems.push(delivery.salvagedItem);
      salvageGold += delivery.salvageGold;
    }
  }
  return { save: next, storedItems, salvagedItems, salvageGold };
}

/** Settles an imported/interrupted battle immediately instead of leaving a live marker. */
export function resolveImportedPendingBattle(save) {
  const pending = save?.pendingBattle;
  if (!pending) return { save, interrupted: null };
  const settled = applyDefeat(clearPendingBattle(save), {
    reason: "retreat",
    retreat: true,
    floorId: pending.floorId,
    characterId: pending.characterId,
  });
  return { save: clearPendingBattle(settled), interrupted: pending };
}

export { getSellValue } from "./economy.js";

export { DungeonGame };

if (globalThis.document) new DungeonGame();
