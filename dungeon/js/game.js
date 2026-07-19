import { CONFIG } from "./config.js";
import { simulateCombat } from "./combat.js";
import {
  createEnemyWave,
  getFloor,
  getFloorCap,
  isFloorUnlocked,
} from "./dungeon.js";
import {
  allocateStat,
  applyAutoAllocation,
  createHeroCombatant,
  equipItem,
  getHeroStats,
  getLevelProgress,
  getPower,
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
  getPrestigePreview,
  resolveSkillAtLevel,
  getSkillPointState,
  resetSkillPoints,
  upgradeSkill,
} from "./skills.js";
import {
  applyDefeat,
  applyPrestige,
  applyVictory,
  clearProgress,
  getDefeatPenalty,
  loadSave,
  saveSave,
  selectStartingClass,
} from "./save.js";
import { DungeonUI } from "./ui.js";

const BASE_LOG_DELAY = 175;

class DungeonGame {
  constructor() {
    this.save = loadSave();
    const initialShop = ensureShop(this.save);
    this.save = initialShop.save;
    this.selectedFloorId = Math.min(
      getFloorCap(this.save),
      this.save.progress.highestUnlockedFloor,
    );
    this.battle = null;
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
      resetSkills: () => this.resetSkills(),
      prestige: () => this.prestige(),
      changeClass: () => this.openClassSelection(),
      selectClass: (classId) => this.selectClass(classId),
      toggleAutoAllocate: (enabled) => this.toggleAutoAllocate(enabled),
      reset: () => this.resetProgress(),
      closeResult: () => this.closeResult(),
    });
    if (this.interruptedBattle) {
      const pending = this.interruptedBattle;
      this.save = applyDefeat(
        { ...this.save, pendingBattle: null },
        { reason: "retreat", retreat: true, floorId: pending.floorId },
      );
      this.save = { ...this.save, pendingBattle: null };
      this.persist();
    }
    this.render();
    if (!this.save.hero.classChosen) this.ui.showClassSelection?.(this.buildViewModel());
    const pendingReforge = getPendingReforge(this.save);
    if (pendingReforge) this.ui.showReforge?.(pendingReforge);
    if (this.interruptedBattle) {
      this.ui.showToast("上次远征中断，已按撤退结算少量损失。", "error");
    }
  }

  get selectedFloor() {
    return getFloor(this.selectedFloorId) ?? CONFIG.floors[0];
  }

  buildViewModel() {
    const hero = this.save.hero;
    const stats = getHeroStats(hero);
    const highest = this.save.progress.highestUnlockedFloor;
    const floorCap = getFloorCap(this.save);
    const cleared = new Set(this.save.progress.clearedFloors);
    const classMeta = CONFIG.classes[hero.classId] ?? CONFIG.classes.warrior;
    const skillPoints = getSkillPointState(hero);
    const prestige = getPrestigePreview(hero);
    const skills = getHeroSkills(hero).map((skill) => ({
      ...skill,
      nextLevel: skill.level < skill.maxLevel
        ? resolveSkillAtLevel(skill.id, skill.level + 1)
        : null,
    }));
    const floors = CONFIG.floors.map((floor) => {
      const [minimumEnemies, maximumEnemies] = floor.enemyCount;
      const baseGold = CONFIG.dungeon.goldPerEnemy * floor.rewardScale;
      const rewardMultiplier = floor.boss ? 4 : 1;
      const minimumGold = Math.round(baseGold * minimumEnemies * rewardMultiplier);
      const maximumGold = Math.round(baseGold * maximumEnemies * rewardMultiplier);
      return {
        ...floor,
        isBoss: floor.boss,
        icon: floor.emoji,
        unlocked: isFloorUnlocked(this.save, floor.id),
        lockedByPrestige: floor.id <= highest && floor.id > floorCap,
        cleared: cleared.has(floor.id),
        enemyCountText: floor.boss
          ? "1 名首领"
          : minimumEnemies === maximumEnemies
            ? `${minimumEnemies} 名`
            : `${minimumEnemies}–${maximumEnemies} 名`,
        goldText: minimumGold === maximumGold
          ? `${minimumGold}`
          : `${minimumGold}–${maximumGold}`,
        dropText: floor.id >= 60
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
        inventory: hero.inventory,
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
      classes: Object.values(CONFIG.classes),
    };
  }

  render() {
    this.ui.render(this.buildViewModel());
  }

  selectFloor(floorId) {
    if (this.battle) return;
    const floor = getFloor(floorId);
    if (!floor || !isFloorUnlocked(this.save, floor.id)) return;
    this.selectedFloorId = floor.id;
    this.render();
  }

  startBattle() {
    if (this.battle) return;
    if (!this.save.hero.classChosen) {
      this.ui.showClassSelection?.(this.buildViewModel());
      this.ui.showToast("先选择职业，再开始远征。", "error");
      return;
    }
    const floor = this.selectedFloor;
    if (!isFloorUnlocked(this.save, floor.id)) {
      this.ui.showToast(
        floor.id > getFloorCap(this.save) ? "需要转生后才能挑战更深层。" : "需要先通过上一层。",
        "error",
      );
      return;
    }

    const attempt = this.save.progress.totalVictories + this.save.progress.totalDefeats + 1;
    const seed = `${Date.now()}|${floor.id}|${attempt}`;
    const wave = createEnemyWave(floor.id, seed);
    const player = createHeroCombatant(this.save.hero);
    const result = simulateCombat({
      player,
      enemies: wave.enemies,
      seed,
      config: CONFIG,
    });
    const stats = getHeroStats(this.save.hero);
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
    };
    this.save = {
      ...this.save,
      pendingBattle: { floorId: floor.id, seed, startedAt: Date.now() },
    };
    this.persist();
    this.ui.showBattle({
      hero: this.save.hero,
      classMeta: CONFIG.classes[this.save.hero.classId],
      stats,
      enemies,
      floor,
      speed: this.save.settings.battleSpeed,
    });
    this.scheduleNextLog(80);
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
    this.save = { ...this.save, pendingBattle: null };

    if (battle.result.victory) {
      const loot = generateLoot(
        battle.floor.id,
        `${battle.seed}|drop`,
        previousHero,
      );
      const delivery = resolveLootDelivery(this.save, loot);
      this.save = delivery.save;
      const { storedLoot, salvagedItem, salvageGold } = delivery;
      battle.loot = storedLoot;
      this.save = applyVictory(this.save, {
        ...battle.result,
        floorId: battle.floor.id,
        loot: storedLoot,
      });
      this.ui.appendBattleLog({
        type: "loot",
        round: battle.result.rounds,
        message: storedLoot
          ? `💎 获得战利品：${storedLoot.name}（${rarityLabel(storedLoot.rarity)}）。`
          : `💰 背包已满，${loot.name} 自动分解为 ${salvageGold} 枚金币。`,
      });
      resultView = {
        victory: true,
        experience: battle.result.rewards.experience,
        gold: battle.result.rewards.gold,
        loot: storedLoot,
        salvagedItem,
        salvageGold,
        equippedItem: storedLoot ? previousHero.equipment[storedLoot.slot] : null,
        level: this.save.hero.level,
        levelsGained: this.save.hero.level - previousLevel,
        skillPointsGained: Math.max(
          0,
          getSkillPointState(this.save.hero).unspent - previousSkillPoints,
        ),
        summary: this.describeVictory(battle.floor.id, previousHighestFloor),
      };
    } else {
      const penalty = getDefeatPenalty(this.save, battle.retreat === true);
      this.save = applyDefeat(this.save, {
        ...battle.result,
        floorId: battle.floor.id,
        retreat: battle.retreat === true,
      });
      resultView = {
        victory: false,
        experienceLost: penalty.experience,
        goldLost: penalty.gold,
        retreat: battle.retreat === true,
        summary: battle.retreat
          ? `你从第 ${battle.floor.id} 层撤回营地，保留了角色与装备。`
          : `第 ${battle.floor.id} 层的敌群击退了你。`,
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
    if (this.battle && !this.battle.settled) {
      this.ui.showToast("战斗中无法更换职业。", "error");
      return;
    }
    this.ui.showClassSelection?.(this.buildViewModel());
  }

  selectClass(classId) {
    if (this.battle && !this.battle.settled) return;
    if (!Object.hasOwn(CONFIG.classes, classId)) return;
    if (this.save.hero.classChosen) {
      const confirmed = globalThis.confirm("更换职业会重建角色并清空当前装备、背包和层数进度，确定继续吗？");
      if (!confirmed) return;
    }
    this.save = selectStartingClass(this.save, classId);
    this.save = ensureShop(this.save).save;
    this.selectedFloorId = CONFIG.dungeon.minFloor;
    const saved = this.persist();
    this.ui.closeClassSelection?.();
    this.render();
    if (saved) this.ui.showToast(`已选择${CONFIG.classes[classId].name}，新的远征开始了。`, "reward");
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
    if (!this.battle?.settled) return;
    this.battle = null;
    this.ui.returnToDungeon();
    this.render();
    this.ui.focusDungeonEntry();
  }

  resetProgress() {
    if (this.battle && !this.battle.settled) {
      this.ui.showToast("请先结束当前战斗。", "error");
      return;
    }
    if (!globalThis.confirm("确定重置文字地牢的角色、装备和进度吗？")) return;
    this.save = clearProgress(this.save);
    this.save = ensureShop(this.save).save;
    this.selectedFloorId = CONFIG.dungeon.minFloor;
    this.battle = null;
    const saved = this.persist();
    this.ui.closeResult();
    this.ui.returnToDungeon();
    this.render();
    if (saved) this.ui.showToast("地牢存档已重置。");
  }

  persist({ silent = false } = {}) {
    const saved = saveSave(this.save);
    if (!saved && !silent) {
      this.ui.showSaveError();
    }
    return saved;
  }
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

export { getSellValue } from "./economy.js";

export { DungeonGame };

if (globalThis.document) new DungeonGame();
