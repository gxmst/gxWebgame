import { getReforgeCost, getReforgeMaterialRequirement, getSellValue, getShopPrice } from "./economy.js";
import { getAffixRollQuality } from "./loot.js";
import { getMaterialName, listOwnedMaterials } from "./materials.js";
import { GameAudio } from "./audio.js";
import {
  applyTranslations, getItemDisplayName, getRarityLabel, getSlotLabel, getStatLabel,
  getUnitDisplayName, localizeAffix, localizeBattleLog, localizeDiagnosis, localizeEffect, localizeMaterial, localizeRuntimeText, normalizeLanguage, pickLanguage, t,
} from "./i18n.js";
import {
  buildWorldMapModel,
  mountWorldMapSvg,
  sanitizeWorldMapViewMode,
} from "./world-map-view.js";

const SLOT_META = {
  weapon: { icon: "🗡️" }, helmet: { icon: "⛑️" }, armor: { icon: "🛡️" },
  footwear: { icon: "🥾" }, accessory: { icon: "💎" },
};

const STAT_META = {
  maxHp: { order: 1 }, hp: { order: 1 }, attack: { order: 2 }, defense: { order: 3 }, speed: { order: 4 },
  strength: { order: 5 }, agility: { order: 6 }, intelligence: { order: 7 }, vitality: { order: 8 },
  critChance: { order: 9, percent: true }, critDamage: { order: 10, percent: true },
  dodgeChance: { order: 10, percent: true }, damagePercent: { order: 11, percent: true },
  physicalDamagePercent: { order: 11, percent: true }, magicDamagePercent: { order: 11, percent: true },
  damageReduction: { order: 12, percent: true },
};

const RARITY_CLASSES = {
  normal: "normal",
  common: "normal",
  excellent: "excellent",
  uncommon: "excellent",
  rare: "rare",
  legendary: "legendary",
};

export class DungeonUI {
  constructor(handlers = {}) {
    this.handlers = handlers;
    this.toastTimer = null;
    this.lastResult = null;
    // 背包视图状态只影响展示,不写入存档。
    this.inventorySort = "default";
    this.inventoryFilter = "all";
    this.lastInventoryRender = null;
    this.selectedInventoryItemId = null;
    this.equipmentManagerExpanded = false;
    this.currentCharacterSummary = null;
    // 动效开关:尊重系统的"减少动态效果"偏好。
    this.reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
    this.audio = new GameAudio();
    this.dom = collectDom();
    this.worldMapViewMode = "map";
    this.worldMapMount = null;
    this.selectedMapNodeId = null;
    this.bindEvents();
  }

  bindEvents() {
    document.addEventListener("click", (event) => {
      const characterTab = event.target.closest("[data-character-tab]");
      if (characterTab) {
        this.activateCharacterTab(characterTab.dataset.characterTab, { focus: true });
        return;
      }

      const inventoryTab = event.target.closest("[data-inventory-tab]");
      if (inventoryTab) {
        this.activateInventoryTab(inventoryTab.dataset.inventoryTab);
        return;
      }

      if (event.target.closest("[data-equipment-manager-open]")) {
        this.activateInventoryTab("inventory");
        this.activatePanel("inventory");
        this.setEquipmentManagerExpanded(
          globalThis.matchMedia?.("(min-width: 1161px)")?.matches === true,
        );
        return;
      }

      if (event.target.closest("[data-equipment-manager-close]")) {
        this.setEquipmentManagerExpanded(false);
        return;
      }

      if (event.target.closest("[data-inventory-detail-close]")) {
        this.selectedInventoryItemId = null;
        const last = this.lastInventoryRender;
        if (last) this.renderInventory(last.items, last.equipment, last.limit);
        return;
      }

      const itemSelect = event.target.closest("[data-item-select]");
      if (itemSelect) {
        this.selectedInventoryItemId = itemSelect.dataset.itemSelect || null;
        if (globalThis.matchMedia?.("(min-width: 1161px)")?.matches) {
          this.setEquipmentManagerExpanded(true, false);
        }
        const last = this.lastInventoryRender;
        if (last) this.renderInventory(last.items, last.equipment, last.limit);
        return;
      }

      const loadoutFilter = event.target.closest("[data-loadout-filter]");
      if (loadoutFilter) {
        this.setInventoryView({ filter: loadoutFilter.dataset.loadoutFilter });
        return;
      }

      const inventoryFilter = event.target.closest("[data-inventory-filter]");
      if (inventoryFilter) {
        this.setInventoryView({ filter: inventoryFilter.dataset.inventoryFilter });
        return;
      }

      const inventorySort = event.target.closest("[data-inventory-sort]");
      if (inventorySort) {
        this.setInventoryView({ sort: inventorySort.dataset.inventorySort });
        return;
      }

      if (event.target.closest("[data-equip-best]")) {
        this.handlers.equipBest?.();
        return;
      }
      if (event.target.closest("[data-bulk-sell]")) {
        this.handlers.bulkSell?.(this.dom.bulkRarity?.value || "common");
        return;
      }

      const lockButton = event.target.closest("[data-lock-id]");
      if (lockButton) {
        this.handlers.toggleLock?.(lockButton.dataset.lockId);
        return;
      }

      if (event.target.closest("[data-export-save]")) {
        this.handlers.exportSave?.();
        return;
      }

      if (event.target.closest("[data-import-save]")) {
        this.dom.importFile?.click();
        return;
      }

      if (event.target.closest("[data-toggle-sound]")) {
        this.handlers.toggleSound?.();
        return;
      }

      if (event.target.closest("[data-toggle-language]")) {
        this.handlers.toggleLanguage?.();
        return;
      }

      if (event.target.closest("[data-result-again]")) {
        this.handlers.repeatBattle?.();
        return;
      }

      const classOption = event.target.closest("[data-class-id]");
      if (classOption) {
        this.selectClassOption(classOption.dataset.classId);
        return;
      }

      if (event.target.closest("[data-character-create]")) {
        this.handlers.createCharacter?.(
          this.selectedClassId || "warrior",
          this.dom.characterName?.value || "",
        );
        return;
      }

      if (event.target.closest("[data-character-manage], [data-class-change]")) {
        this.handlers.manageCharacters?.();
        return;
      }

      const characterSwitch = event.target.closest("[data-character-switch]");
      if (characterSwitch) {
        this.handlers.switchCharacter?.(characterSwitch.dataset.characterSwitch);
        return;
      }

      const characterDelete = event.target.closest("[data-character-delete]");
      if (characterDelete) {
        this.handlers.deleteCharacter?.(characterDelete.dataset.characterDelete);
        return;
      }

      if (event.target.closest("[data-character-close]")) {
        this.closeClassSelection();
        return;
      }

      const worldNode = event.target.closest("[data-world-node]");
      if (worldNode) {
        this.handlers.enterWorldNode?.(worldNode.dataset.worldNode);
        return;
      }

      if (event.target.closest("[data-world-back]")) {
        this.handlers.returnToWorldMap?.();
        return;
      }

      const mapModeButton = event.target.closest("[data-world-map-mode]");
      if (mapModeButton) {
        this.handlers.setWorldMapViewMode?.(mapModeButton.dataset.worldMapMode);
        return;
      }

      if (event.target.closest("[data-world-map-card-enter]")) {
        const nodeId = this.selectedMapNodeId || this.dom.worldMapCardEnter?.dataset.nodeId;
        if (nodeId) this.handlers.enterWorldNode?.(nodeId);
        return;
      }

      if (event.target.closest("[data-town-shop]")) {
        this.handlers.openTownShop?.();
        return;
      }

      if (event.target.closest("[data-town-inventory]")) {
        this.handlers.openTownInventory?.();
        return;
      }

      if (event.target.closest("[data-town-characters]")) {
        this.handlers.manageCharacters?.();
        return;
      }

      const npcButton = event.target.closest("[data-town-npc]");
      if (npcButton) {
        this.handlers.openNpc?.(npcButton.dataset.townNpc);
        return;
      }

      if (event.target.closest("[data-quest-log]")) {
        this.handlers.openQuestLog?.();
        return;
      }

      if (event.target.closest("[data-quest-log-close]")) {
        this.handlers.closeQuestLog?.();
        return;
      }

      const eventOption = event.target.closest("[data-event-option]");
      if (eventOption) {
        this.handlers.chooseEventOption?.(Number(eventOption.dataset.eventOption));
        return;
      }

      if (event.target.closest("[data-event-continue]")) {
        this.handlers.continueEvent?.();
        return;
      }

      const dialogueOption = event.target.closest("[data-dialogue-option]");
      if (dialogueOption) {
        this.handlers.chooseDialogueOption?.(Number(dialogueOption.dataset.dialogueOption));
        return;
      }

      if (event.target.closest("[data-dialogue-close]")) {
        this.handlers.closeDialogue?.();
        return;
      }

      if (event.target.closest("[data-start-outdoor]")) {
        this.handlers.startOutdoor?.();
        return;
      }

      if (event.target.closest("[data-stop-outdoor]")) {
        this.handlers.stopOutdoor?.();
        return;
      }

      if (event.target.closest("[data-prestige]")) {
        this.handlers.prestige?.();
        return;
      }

      const skillButton = event.target.closest("[data-upgrade-skill]");
      if (skillButton) {
        this.handlers.upgradeSkill?.(skillButton.dataset.upgradeSkill);
        return;
      }

      const branchButton = event.target.closest("[data-choose-skill-branch]");
      if (branchButton) {
        this.handlers.chooseSkillBranch?.(
          branchButton.dataset.chooseSkillBranch,
          branchButton.dataset.skillBranch,
        );
        return;
      }

      if (event.target.closest("[data-reset-skills]")) {
        this.handlers.resetSkills?.();
        return;
      }

      if (event.target.closest("[data-shop-refresh]")) {
        this.handlers.refreshShop?.();
        return;
      }

      const buyButton = event.target.closest("[data-buy-listing]");
      if (buyButton) {
        this.handlers.buyShopItem?.(buyButton.dataset.buyListing);
        return;
      }

      const reforgeButton = event.target.closest("[data-reforge-id]");
      if (reforgeButton) {
        this.handlers.reforgeItem?.(
          reforgeButton.dataset.reforgeId,
          reforgeButton.dataset.reforgeLocation || "inventory",
          reforgeButton.dataset.reforgeSlot || null,
        );
        return;
      }

      if (event.target.closest("[data-reforge-keep]")) {
        this.handlers.resolveReforge?.("keep");
        return;
      }

      if (event.target.closest("[data-reforge-replace]")) {
        this.handlers.resolveReforge?.("replace");
        return;
      }

      const floorButton = event.target.closest("[data-floor-id]");
      if (floorButton) {
        this.handlers.selectFloor?.(numberOr(floorButton.dataset.floorId, 1));
        return;
      }

      if (event.target.closest("[data-enter-floor]")) {
        this.handlers.enterFloor?.();
        return;
      }

      const speedButton = event.target.closest("[data-speed]");
      if (speedButton) {
        this.handlers.setSpeed?.(numberOr(speedButton.dataset.speed, 1));
        return;
      }

      if (event.target.closest("[data-skip]")) {
        this.handlers.skipBattle?.();
        return;
      }

      if (event.target.closest("[data-retreat]")) {
        this.handlers.retreatBattle?.();
        return;
      }

      const equipButton = event.target.closest("[data-equip-id]");
      if (equipButton) {
        this.handlers.equipItem?.(equipButton.dataset.equipId);
        return;
      }

      const unequipButton = event.target.closest("[data-unequip-slot]");
      if (unequipButton) {
        this.handlers.unequipItem?.(unequipButton.dataset.unequipSlot);
        return;
      }

      const sellButton = event.target.closest("[data-sell-id]");
      if (sellButton) {
        this.handlers.sellItem?.(sellButton.dataset.sellId);
        return;
      }

      const statButton = event.target.closest("[data-allocate-stat]");
      if (statButton) {
        this.handlers.allocateStat?.(statButton.dataset.allocateStat);
        return;
      }

      if (event.target.closest("[data-reset]")) {
        this.handlers.reset?.();
        return;
      }

      const tabButton = event.target.closest("[data-mobile-tab]");
      if (tabButton) this.activatePanel(tabButton.dataset.mobileTab);
    });

    this.dom.autoAllocate?.addEventListener("change", (event) => {
      this.handlers.toggleAutoAllocate?.(event.currentTarget.checked);
    });

    this.dom.importFile?.addEventListener("change", async (event) => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = "";
      if (!file) return;
      try {
        const text = await file.text();
        this.handlers.importSave?.(text);
      } catch {
        this.showToast("无法读取所选文件。", "error");
      }
    });

    for (const closeButton of document.querySelectorAll("[data-result-close]")) {
      closeButton.addEventListener("click", () => this.closeResult());
    }

    this.dom.resultDialog?.addEventListener("cancel", () => this.closeResult());

    this.dom.classDialog?.addEventListener("cancel", () => this.closeClassSelection());
    this.dom.reforgeDialog?.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.handlers.resolveReforge?.("keep");
    });
    this.dom.reforgeClose?.addEventListener("click", (event) => {
      event.preventDefault();
      this.handlers.resolveReforge?.("keep");
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.equipmentManagerExpanded) {
        this.setEquipmentManagerExpanded(false);
      }
    });

    document.addEventListener("keydown", (event) => {
      const tab = event.target.closest?.("[data-character-tab]");
      if (!tab || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      const tabs = [...document.querySelectorAll("[data-character-tab]")];
      if (!tabs.length) return;
      const index = tabs.indexOf(tab);
      if (index < 0) return;
      const nextIndex = event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      event.preventDefault();
      this.activateCharacterTab(tabs[nextIndex].dataset.characterTab, { focus: true });
    });
  }

  render(model) {
    this.language = applyTranslations(document, model.settings?.language);
    document.body.dataset.language = this.language;
    if (this.dom.languageLabel) {
      this.dom.languageLabel.textContent = this.language === "zh-CN" ? "EN" : "中";
    }
    this.renderHeader(model);
    this.syncSound(model.settings?.soundEnabled !== false);
    this.renderCharacter(model.character);
    this.renderCareer(model.career);
    this.renderCharacterManager(model);
    this.renderEquipment(model.character.equipment);
    this.renderFloors(model.floors, model.selectedFloorId);
    this.renderFloorPreview(model.selectedFloor, model.character.power);
    this.renderWorld(model);
    this.renderEndgameObjective(model.endgame);
    this.renderAdventureMode(model.adventureMode, model.outdoor, model.worldScene);
    this.renderInventory(
      model.character.inventory,
      model.character.equipment,
      model.inventoryLimit,
    );
    this.renderMaterials(model.materialRows ?? model.materials);
    this.renderShop(model.economy?.shop, model.character.gold, model.character.equipment);
    const pendingReforge = Boolean(model.economy?.pendingReforge);
    for (const button of document.querySelectorAll("[data-equip-id], [data-sell-id], [data-unequip-slot], [data-reforge-id]")) {
      button.disabled = pendingReforge;
    }
  }

  renderHeader(model) {
    setText(this.dom.coins, formatNumber(model.character.gold));
    setText(this.dom.maxFloor, model.highestUnlockedFloor);
    setText(this.dom.worldLevel, model.worldLevel ?? model.highestUnlockedFloor ?? 1);
  }

  renderEndgameObjective(objective) {
    if (!this.dom.endgameObjective) return;
    if (!objective) { this.dom.endgameObjective.hidden = true; return; }
    this.dom.endgameObjective.hidden = false;
    this.dom.endgameObjective.innerHTML = `<span>${escapeHtml(t("endgame.label", this.language))}</span><strong>${escapeHtml(objective.name)}</strong><small>${escapeHtml(objective.description)} · ${formatNumber(Math.min(objective.currentFloor, objective.floor))}/${formatNumber(objective.floor)}</small>`;
  }

  syncSound(enabled) {
    this.audio.setEnabled(enabled);
    if (!this.dom.soundToggle) return;
    this.dom.soundToggle.textContent = enabled ? "🔊" : "🔇";
    const label = enabled ? pickLanguage("关闭音效", "Mute sound", this.language) : pickLanguage("开启音效", "Enable sound", this.language);
    this.dom.soundToggle.setAttribute("aria-label", label);
    this.dom.soundToggle.title = label;
  }

  renderCareer(career = {}) {
    setText(this.dom.careerVictories, formatNumber(career.totalVictories));
    setText(this.dom.careerDefeats, formatNumber(career.totalDefeats));
    setText(this.dom.careerFloor, this.language === "en-US" ? `Floor ${formatNumber(Math.max(1, numberOr(career.highestFloor, 1)))}` : `第 ${formatNumber(Math.max(1, numberOr(career.highestFloor, 1)))} 层`);
    setText(this.dom.careerWaves, formatNumber(career.outdoorWaves));
  }

  renderCharacter(character) {
    const { hero, stats, levelProgress, power, classMeta, skills, skillPoints, prestige } = character;
    this.currentCharacterSummary = { hero, stats, power, classMeta };
    setText(this.dom.level, hero.level);
    setText(
      this.dom.expText,
      levelProgress.maxLevel
        ? pickLanguage("已满级", "Max Level", this.language)
        : `${formatNumber(levelProgress.current)} / ${formatNumber(levelProgress.required)}`,
    );
    setMeter(
      this.dom.expFill,
      Number.isFinite(levelProgress.ratio)
        ? levelProgress.ratio
        : numberOr(levelProgress.percent, 0) / 100,
      this.dom.expFill?.parentElement,
    );
    setText(this.dom.power, formatNumber(power));
    setText(this.dom.managerPower, formatNumber(power));
    setText(this.dom.managerHp, formatNumber(stats.maxHp));
    setText(this.dom.managerAttack, formatNumber(stats.attack));
    setText(this.dom.managerDefense, formatNumber(stats.defense));
    setText(this.dom.managerSpeed, formatNumber(stats.speed));
    setText(this.dom.hp, formatNumber(stats.maxHp));
    setText(this.dom.attack, formatNumber(stats.attack));
    setText(this.dom.defense, formatNumber(stats.defense));
    setText(this.dom.speed, formatNumber(stats.speed));
    renderAttribute(this.dom.strength, "strength", stats.strength, this.language);
    renderAttribute(this.dom.agility, "agility", stats.agility, this.language);
    renderAttribute(this.dom.intelligence, "intelligence", stats.intelligence, this.language);
    renderAttribute(this.dom.vitality, "vitality", stats.vitality, this.language);
    setText(this.dom.statPoints, formatNumber(hero.unspentStatPoints));
    setText(
      this.dom.skillPoints,
      formatNumber(skillPoints?.available ?? skillPoints?.unspent ?? hero.unspentSkillPoints),
    );

    const name = document.querySelector(".hero-name");
    const className = document.querySelector(".hero-class");
    setText(name, hero.name || pickLanguage(`无名${classMeta?.name ?? "冒险者"}`, `Unnamed ${classMeta?.name ?? "Adventurer"}`, this.language));
    setText(className, `${classMeta?.name ?? pickLanguage("职业", "Class", this.language)} · ${classMeta?.role ?? pickLanguage("探索者", "Explorer", this.language)}`);
    setText(this.dom.className, classMeta?.name ?? pickLanguage("战士", "Warrior", this.language));
    setText(this.dom.prestigeCount, prestige?.currentCount ?? hero.prestigeCount ?? 0);
    if (this.dom.classMark) {
      this.dom.classMark.textContent = classMeta?.emoji ?? "⚔️";
      this.dom.classMark.setAttribute("aria-label", `${pickLanguage("职业", "Class", this.language)}: ${classMeta?.name ?? pickLanguage("战士", "Warrior", this.language)}`);
    }

    this.renderSkills(skills, skillPoints);
    if (this.dom.prestige) {
      this.dom.prestige.disabled = !prestige?.eligible;
      const title = this.dom.prestige.querySelector("strong");
      const detail = this.dom.prestige.querySelector("small");
      setText(title, prestige?.eligible ? `转生 · 永久 +${Math.round((prestige.multiplierGain ?? 0) * 100)}%` : "尚未达到转生条件");
      setText(detail, prestige?.eligible
        ? `层数上限 ${prestige.currentFloorCap} → ${prestige.nextFloorCap}，技能点 +${prestige.skillPointsGranted}`
        : `满级 Lv.${prestige?.maxLevel ?? ""} 后重启征程，获得永久强化`);
    }

    const available = Math.max(0, numberOr(hero.unspentStatPoints, 0));
    for (const button of document.querySelectorAll("[data-allocate-stat]")) {
      button.disabled = available <= 0 || character.autoAllocate;
    }
    if (this.dom.autoAllocate) this.dom.autoAllocate.checked = character.autoAllocate;
  }

  renderSkills(skills = [], pointState = {}) {
    if (!this.dom.skills) return;
    const english = normalizeLanguage(this.language) === "en-US";
    const rows = skills.map((skill) => {
      const typeLabel = (english ? { aoe: "Area", guard: "Defense", heal: "Healing", summon: "Summon", empower: "Form" } : { aoe: "群体", guard: "自保", heal: "治疗", summon: "召唤", empower: "形态" })[skill.type] ?? (english ? "Single Target" : "单体");
      const next = skill.nextLevel;
      const cooldownPreview = next && next.cooldown !== skill.cooldown
        ? `${skill.cooldown}→${next.cooldown}`
        : `${skill.cooldown}`;
      const effectParts = [];
      if (skill.type === "guard") {
        if (numberOr(skill.reduction, 0) > 0) {
          effectParts.push(`${english ? "DR" : "减伤"} ${Math.round(numberOr(skill.reduction, 0) * 100)}%${next ? `→${Math.round(numberOr(next.reduction, 0) * 100)}%` : ""}`);
        }
        if (numberOr(skill.dodgeBonus, 0) > 0) {
          effectParts.push(`${english ? "Dodge" : "闪避"} +${Math.round(numberOr(skill.dodgeBonus, 0) * 100)}%${next ? `→${Math.round(numberOr(next.dodgeBonus, 0) * 100)}%` : ""}`);
        }
      } else if (skill.type === "heal") {
        effectParts.push(`${english ? "Heal" : "恢复"} ${Math.round(numberOr(skill.healRatio, 0) * 100)}%${next ? `→${Math.round(numberOr(next.healRatio, 0) * 100)}%` : ""}${english ? " HP" : " 生命"}`);
      } else if (skill.type === "summon") {
        effectParts.push(`${english ? "Summon" : "召唤"} ${numberOr(skill.summonCount, 1)}${next && numberOr(next.summonCount, 1) !== numberOr(skill.summonCount, 1) ? `→${numberOr(next.summonCount, 1)}` : ""} · ${english ? "Cap" : "上限"} ${numberOr(skill.maxMinions, 1)}${next && numberOr(next.maxMinions, 1) !== numberOr(skill.maxMinions, 1) ? `→${numberOr(next.maxMinions, 1)}` : ""}`);
        effectParts.push(`${english ? "ATK" : "攻"} ${Math.round(numberOr(skill.minionAttackRatio, 0) * 100)}%${next ? `→${Math.round(numberOr(next.minionAttackRatio, 0) * 100)}%` : ""}`);
      } else if (skill.type === "empower") {
        effectParts.push(`${english ? "Damage" : "增伤"} +${Math.round(numberOr(skill.damageBonus, 0) * 100)}%${next ? `→${Math.round(numberOr(next.damageBonus, 0) * 100)}%` : ""}`);
        if (numberOr(skill.lifestealBonus, 0) > 0) {
          effectParts.push(`${english ? "Lifesteal" : "吸血"} +${Math.round(numberOr(skill.lifestealBonus, 0) * 100)}%`);
        }
        effectParts.push(`${english ? "Duration" : "持续"} ${numberOr(skill.duration, 1)}${english ? " turns" : " 回合"}`);
      } else {
        effectParts.push(`${english ? "Power" : "倍率"} ${Number(skill.multiplier ?? 1).toFixed(2)}${next ? `→${Number(next.multiplier ?? 1).toFixed(2)}` : ""}`);
        if (numberOr(skill.hitCount, 1) > 1) effectParts.push(`${numberOr(skill.hitCount, 1)} ${english ? "hits" : "段"}`);
        if (numberOr(skill.critChanceBonus, 0) > 0) {
          effectParts.push(`${english ? "Crit" : "暴击"} +${Math.round(numberOr(skill.critChanceBonus, 0) * 100)}%`);
        }
      }
      effectParts.push(`${english ? "Cooldown" : "冷却"} ${cooldownPreview}`);
      const effect = effectParts.join(" · ");
      const maxLevel = numberOr(skill.maxLevel, numberOr(skill.level, 1));
      const basic = skill.isBasic === true;
      const canUpgrade = !basic
        && numberOr(pointState.available ?? pointState.unspent, 0) > 0
        && numberOr(skill.level, 1) < maxLevel;
      const branchChoices = !basic && Array.isArray(skill.branches) && skill.branches.length > 0
        ? `<div class="skill-branches" aria-label="${escapeHtml(skill.name || skill.id)}派生分支">
            <span class="skill-branch-heading">${skill.branchUnlocked ? "选择一个派生" : `Lv.${numberOr(skill.branchUnlockLevel, 5)} 解锁派生`}</span>
            <div class="skill-branch-options">
              ${skill.branches.map((branch) => {
                const selected = branch.selected === true;
                const unlocked = branch.unlocked === true;
                const disabled = selected || !unlocked || Boolean(skill.selectedBranchId && !selected);
                const stateLabel = selected ? t("skills.selected", this.language) : unlocked ? t("skills.choose", this.language) : `Lv.${numberOr(branch.unlockLevel, skill.branchUnlockLevel ?? 5)}`;
                return `<button class="skill-branch-option ${selected ? "is-selected" : ""}" type="button" data-choose-skill-branch="${escapeHtml(skill.id)}" data-skill-branch="${escapeHtml(branch.id)}" ${disabled ? "disabled" : ""} title="${escapeHtml(branch.description || "")}">
                  <span><strong>${escapeHtml(branch.name || branch.id)}</strong><em>${escapeHtml(branch.description || "选择后锁定，重置技能可更换。")}</em></span><small>${escapeHtml(stateLabel)}</small>
                </button>`;
              }).join("")}
            </div>
          </div>`
        : "";
      return `
        <div class="skill-entry skill-tree-node">
          <span class="skill-tree-node-label">${escapeHtml(t("skills.core", this.language))}</span>
          <div class="skill-row ${basic ? "is-basic" : ""}">
          <span class="skill-icon" aria-hidden="true">${escapeHtml(skill.emoji || "✦")}</span>
          <span class="skill-copy"><strong>${escapeHtml(skill.name || skill.id)}</strong><small>${typeLabel} · ${effect}</small></span>
          <span class="skill-level">Lv.${numberOr(skill.level, 1)}/${maxLevel}</span>
          ${basic ? "" : `<button class="skill-upgrade-button" type="button" data-upgrade-skill="${escapeHtml(skill.id)}" ${canUpgrade ? "" : "disabled"} aria-label="提升${escapeHtml(skill.name || skill.id)}">+</button>`}
          </div>
          ${branchChoices ? `<span class="skill-tree-connector" aria-hidden="true"></span>${branchChoices}` : ""}
        </div>`;
    }).join("");
    const budget = pointState.investmentCap === undefined
      ? ""
      : `<div class="skill-tree-header"><div><strong>${escapeHtml(t("skills.tree", this.language))}</strong><small>${escapeHtml(t("skills.chooseOne", this.language))}</small></div><div class="skill-budget-summary"><span>${escapeHtml(t("skills.invested", this.language, { spent: formatNumber(pointState.spent), cap: formatNumber(pointState.investmentCap) }))}</span><span>${escapeHtml(pointState.reserve > 0 ? t("skills.reserve", this.language, { count: formatNumber(pointState.reserve) }) : t("skills.cap", this.language))}</span></div></div>`;
    this.dom.skills.innerHTML = `${budget}${rows}${numberOr(pointState.spent, 0) > 0
      ? `<button class="skills-reset-button" type="button" data-reset-skills>${escapeHtml(t("skills.reset", this.language))}</button>`
      : ""}`;
    if (!skills.length) {
      this.dom.skills.innerHTML = `<div class="empty-state"><strong>${escapeHtml(t("skills.empty", this.language))}</strong></div>`;
    }
  }

  renderEquipment(equipment = {}) {
    if (!this.dom.equipment) return;
    this.dom.equipment.innerHTML = Object.entries(SLOT_META)
      .map(([slot, meta]) => {
        const label = getSlotLabel(slot, this.language);
        const item = equipment?.[slot];
        if (!item) {
          return `
            <div class="equipment-slot is-empty" data-slot="${slot}">
              <span class="slot-icon" aria-hidden="true">${meta.icon}</span>
              <span><small>${label}</small><strong>${pickLanguage("未装备", "Empty", this.language)}</strong></span>
            </div>`;
        }
        return `
          <div class="equipment-slot rarity-${rarityKey(item.rarity)}" data-slot="${slot}">
            <span class="slot-icon" aria-hidden="true">${escapeHtml(item.icon || meta.icon)}</span>
            <span><small>${label}</small><strong>${escapeHtml(getItemDisplayName(item, this.language))}</strong></span>
            <span class="equipment-slot-actions">
              <button class="icon-button" type="button" data-unequip-slot="${slot}" aria-label="卸下${escapeHtml(item.name)}" title="卸下">↧</button>
              <button class="icon-button" type="button" data-reforge-id="${escapeHtml(item.id)}" data-reforge-location="equipment" data-reforge-slot="${slot}" aria-label="重铸${escapeHtml(item.name)}" title="重铸词条">⚒</button>
            </span>
          </div>`;
      })
      .join("");

    if (this.dom.managerEquipment) {
      const classMeta = this.currentCharacterSummary?.classMeta ?? {};
      const slots = Object.entries(SLOT_META).map(([slot, meta]) => {
        const label = getSlotLabel(slot, this.language);
        const item = equipment?.[slot];
        const selected = item?.id && item.id === this.selectedInventoryItemId;
        if (!item) {
          return `
            <button class="loadout-slot slot-${slot} is-empty" type="button" data-loadout-filter="${slot}" aria-label="${label}: ${pickLanguage("未装备", "empty", this.language)}">
              <span aria-hidden="true">${meta.icon}</span><small>${label}</small>
            </button>`;
        }
        return `
          <button class="loadout-slot slot-${slot} rarity-${rarityKey(item.rarity)} ${selected ? "is-selected" : ""}" type="button" data-item-select="${escapeHtml(item.id)}" aria-label="查看已装备的${escapeHtml(item.name)}">
            <span aria-hidden="true">${escapeHtml(item.icon || meta.icon)}</span>
            <small>${label}</small>
            <strong>${escapeHtml(getItemDisplayName(item, this.language))}</strong>
          </button>`;
      }).join("");
      this.dom.managerEquipment.innerHTML = `
        <div class="loadout-avatar" aria-hidden="true">
          <span>${escapeHtml(classMeta.emoji || "⚔️")}</span>
          <strong>${escapeHtml(classMeta.name || pickLanguage("冒险者", "Adventurer", this.language))}</strong>
        </div>
        ${slots}`;
    }
  }

  renderFloors(floors = [], selectedFloorId) {
    if (!this.dom.floorList) return;
    this.dom.floorList.innerHTML = floors
      .map((floor) => {
        const id = floor.id ?? floor.floorId;
        const locked = floor.unlocked === false;
        const state = locked
          ? floor.lockedByPrestige ? pickLanguage("需转生", "Rebirth Required", this.language) : pickLanguage("未解锁", "Locked", this.language)
          : floor.cleared ? pickLanguage("已通过", "Cleared", this.language) : pickLanguage("可挑战", "Available", this.language);
        const classes = [
          "floor-button",
          id === selectedFloorId ? "is-selected" : "",
          floor.cleared ? "is-cleared" : "",
          floor.isBoss ? "is-boss" : "",
        ].filter(Boolean).join(" ");
        return `
          <li>
            <button class="${classes}" type="button" data-floor-id="${id}"
              ${locked ? "disabled" : ""} aria-pressed="${id === selectedFloorId}">
              <span class="floor-number">${locked ? "🔒" : String(id).padStart(2, "0")}</span>
              <span class="floor-copy">
                <strong>${escapeHtml(floor.name || `第 ${id} 层`)}</strong>
                <small>${pickLanguage("推荐战力", "Recommended Power", this.language)} ${formatNumber(floor.recommendedPower, this.language)}</small>
              </span>
              <span class="floor-state">${state}</span>
            </button>
          </li>`;
      })
      .join("");
    if (globalThis.matchMedia?.("(max-width: 1000px)")?.matches) {
      this.dom.floorList.querySelector(".floor-button.is-selected")?.scrollIntoView({
        block: "nearest",
        inline: "center",
      });
    }
  }

  renderFloorPreview(floor, heroPower) {
    if (!this.dom.floorPreview || !floor) return;
    const id = floor.id ?? floor.floorId;
    const powerRatio = floor.recommendedPower > 0 ? heroPower / floor.recommendedPower : 1;
    const danger = powerRatio >= 1.2
      ? pickLanguage("优势明显", "Favored", this.language)
      : powerRatio >= 0.9 ? pickLanguage("势均力敌", "Even Match", this.language) : pickLanguage("凶险异常", "Deadly", this.language);
    this.dom.floorPreview.innerHTML = `
      <div class="preview-topline">
        <span class="danger-tag">${floor.isBoss ? pickLanguage("首领层", "Boss Floor", this.language) : danger}</span>
        <span class="recommended-power">${pickLanguage("推荐战力", "Recommended Power", this.language)} <strong>${formatNumber(floor.recommendedPower, this.language)}</strong></span>
      </div>
      <div class="floor-emblem" aria-hidden="true">${escapeHtml(floor.icon || floor.emoji || (floor.isBoss ? "👑" : "🚪"))}</div>
      <div class="preview-copy">
        <p class="panel-kicker">当前选择</p>
        <h3 id="floor-preview-title">第 ${id} 层 · ${escapeHtml(floor.name || "无名地窟")}</h3>
        <p>${escapeHtml(floor.description || "黑暗中传来兵刃划过石壁的声响。")}</p>
        ${floor.pacing?.isGate
          ? `<p class="floor-gate-hint"><strong>阶段检验 · ${escapeHtml(floor.pacing.name || "构筑检验")}</strong><span>${escapeHtml(floor.pacing.hint || "提升装备和技能后再继续深入。")}</span></p>`
          : ""}
      </div>
      <dl class="preview-details">
        <div><dt>敌群</dt><dd>${escapeHtml(floor.enemyCountText || (floor.isBoss ? "1 名首领" : "3–5 名"))}</dd></div>
        <div><dt>金币</dt><dd>${escapeHtml(floor.goldText || "未知")}</dd></div>
        <div><dt>掉落</dt><dd class="rarity-${rarityKey(floor.minRarity || "normal")}">${escapeHtml(floor.dropText || "普通+")}</dd></div>
      </dl>
      <button class="primary-button enter-button" type="button" data-enter-floor ${floor.unlocked === false ? "disabled" : ""}>
        <span aria-hidden="true">⚔</span>
        ${floor.unlocked === false ? pickLanguage("尚未解锁", "Locked", this.language) : pickLanguage("进入地牢", "Enter Dungeon", this.language)}
      </button>`;
  }

  renderInventory(items = [], equipment = {}, limit = 24) {
    if (!this.dom.inventory) return;
    this.lastInventoryRender = { items, equipment, limit };
    const equippedBySlot = equipment || {};
    const visible = this.applyInventoryView(items);
    this.dom.inventory.innerHTML = items.length > 0 && visible.length === 0
      ? `<div class="empty-state inventory-filter-empty"><span aria-hidden="true">🔍</span><strong>该分类暂无装备</strong><p>换一个筛选条件试试。</p></div>`
      : visible.map((item) => renderInventoryTile(item, item.id === this.selectedInventoryItemId, this.language)).join("");

    const equippedItems = Object.entries(equippedBySlot)
      .filter(([, item]) => item)
      .map(([slot, item]) => ({ slot, item }));
    let selected = items.find((item) => item.id === this.selectedInventoryItemId) ?? null;
    let selectedLocation = selected ? "inventory" : null;
    let selectedSlot = selected?.slot ?? null;
    if (!selected) {
      const equipped = equippedItems.find((entry) => entry.item.id === this.selectedInventoryItemId);
      if (equipped) {
        selected = equipped.item;
        selectedLocation = "equipment";
        selectedSlot = equipped.slot;
      }
    }
    if (!selected && this.equipmentManagerExpanded && visible[0]) {
      selected = visible[0];
      selectedLocation = "inventory";
      selectedSlot = selected.slot;
      this.selectedInventoryItemId = selected.id;
    }
    if (!selected && this.selectedInventoryItemId) this.selectedInventoryItemId = null;
    for (const tile of this.dom.inventory.querySelectorAll("[data-item-select]")) {
      const active = tile.dataset.itemSelect === this.selectedInventoryItemId;
      tile.classList.toggle("is-selected", active);
      tile.setAttribute("aria-pressed", String(active));
    }
    if (this.dom.inventoryDetail) {
      this.dom.inventoryDetail.innerHTML = selected
        ? renderItemInspector(selected, equippedBySlot[selected.slot], selectedLocation, selectedSlot, this.language)
        : renderEmptyItemInspector(this.language);
    }
    this.dom.inventoryPanel?.classList.toggle("has-item-selection", Boolean(selected));
    this.renderEquipment(equipment);
    if (this.dom.inventoryEmpty) this.dom.inventoryEmpty.hidden = items.length > 0;
    setText(this.dom.inventoryCount, `${items.length}`);
    setText(this.dom.inventoryLimit, `${limit}`);
    const capacity = this.dom.inventoryCount?.parentElement;
    if (capacity) capacity.setAttribute("aria-label", `${pickLanguage("背包容量", "Inventory capacity", this.language)} ${items.length} / ${limit}`);
    this.syncInventoryControls();
  }

  renderMaterials(rowsOrMap = []) {
    if (!this.dom.materialsList) return;
    const rows = Array.isArray(rowsOrMap)
      ? rowsOrMap
      : listOwnedMaterials(rowsOrMap);
    if (rows.length === 0) {
      this.dom.materialsList.innerHTML = `<p class="materials-empty">${pickLanguage("暂无材料。野外与事件中可获得。", "No materials yet. Find them outdoors and in events.", this.language)}</p>`;
      return;
    }
    this.dom.materialsList.innerHTML = rows.map((source) => {
      const row = localizeMaterial(source, this.language);
      return `<article class="material-chip" title="${escapeHtml(row.description || row.name)}"><span aria-hidden="true">${escapeHtml(row.emoji || "📦")}</span><strong>${escapeHtml(row.name || getMaterialName(row.id))}</strong><em>×${formatNumber(row.amount)}</em></article>`;
    }).join("");
  }

  /** Pure display-side filter + sort; the save's item order is never touched. */
  applyInventoryView(items) {
    const filtered = this.inventoryFilter === "all"
      ? [...items]
      : items.filter((item) => item.slot === this.inventoryFilter);
    const rank = { normal: 0, excellent: 1, rare: 2, legendary: 3 };
    const byPower = (a, b) => numberOr(b.power, 0) - numberOr(a.power, 0);
    if (this.inventorySort === "power") filtered.sort(byPower);
    else if (this.inventorySort === "rarity") {
      filtered.sort((a, b) =>
        (rank[rarityKey(b.rarity)] ?? 0) - (rank[rarityKey(a.rarity)] ?? 0) || byPower(a, b));
    } else if (this.inventorySort === "level") {
      filtered.sort((a, b) => numberOr(b.level, 0) - numberOr(a.level, 0) || byPower(a, b));
    }
    return filtered;
  }

  setInventoryView({ filter, sort } = {}) {
    if (filter) this.inventoryFilter = ["weapon", "helmet", "armor", "footwear", "accessory"].includes(filter) ? filter : "all";
    if (sort) this.inventorySort = ["power", "rarity", "level"].includes(sort) ? sort : "default";
    const last = this.lastInventoryRender;
    if (last) this.renderInventory(last.items, last.equipment, last.limit);
    else this.syncInventoryControls();
  }

  setEquipmentManagerExpanded(expanded, render = true) {
    this.equipmentManagerExpanded = expanded === true;
    this.dom.inventoryPanel?.classList.toggle("is-expanded", this.equipmentManagerExpanded);
    document.body.classList.toggle("has-equipment-manager", this.equipmentManagerExpanded);
    if (render) {
      const last = this.lastInventoryRender;
      if (last) this.renderInventory(last.items, last.equipment, last.limit);
    }
  }

  syncInventoryControls() {
    for (const button of document.querySelectorAll("[data-inventory-filter]")) {
      button.classList.toggle("is-active", button.dataset.inventoryFilter === this.inventoryFilter);
    }
    for (const button of document.querySelectorAll("[data-inventory-sort]")) {
      button.classList.toggle("is-active", button.dataset.inventorySort === this.inventorySort);
    }
  }

  renderShop(shop = {}, gold = 0, equipment = {}) {
    if (!this.dom.shop) return;
    const stock = Array.isArray(shop?.stock) ? shop.stock : [];
    this.dom.shop.innerHTML = stock.length > 0
      ? stock.map((listing) => renderShopItem(listing, gold, equipment, this.language)).join("")
      : `<div class="empty-state shop-empty"><span aria-hidden="true">🏪</span><strong>${pickLanguage("本轮货架已售空", "Sold out", this.language)}</strong><p>${pickLanguage("继续远征，胜利后商队会定期补货。", "Keep adventuring; the caravan restocks after victories.", this.language)}</p></div>`;
  }

  renderCharacterManager(model = {}) {
    const characters = Array.isArray(model.characters) ? model.characters : [];
    const activeId = model.activeCharacterId;
    const limit = Math.max(1, numberOr(model.characterLimit, 8));
    setText(this.dom.characterCount, characters.length);
    setText(this.dom.characterLimit, limit);
    if (this.dom.characterCreate) {
      this.dom.characterCreate.disabled = characters.length >= limit;
      this.dom.characterCreate.title = characters.length >= limit ? `最多创建 ${limit} 个角色` : "";
    }
    if (!this.dom.characterList) return;
    this.dom.characterList.innerHTML = characters.length > 0
      ? characters.map((character) => {
        const hero = character.hero ?? character;
        const classMeta = character.classMeta ?? {};
        const id = String(character.id ?? hero.id ?? "");
        const active = id === activeId || character.active === true;
        const name = character.name || hero.name || `无名${classMeta.name ?? "冒险者"}`;
        const prestige = numberOr(character.prestigeCount ?? hero.prestigeCount, 0);
        return `
          <article class="character-card ${active ? "is-active" : ""}" data-character-id="${escapeHtml(id)}">
            <span class="character-card-icon" aria-hidden="true">${escapeHtml(classMeta.emoji || character.emoji || "⚔️")}</span>
            <span class="character-card-copy">
              <strong>${escapeHtml(name)}</strong>
              <small>${escapeHtml(classMeta.name || character.className || "冒险者")} · Lv.${numberOr(character.level ?? hero.level, 1)} · 转生 ${prestige}</small>
            </span>
            <span class="character-card-actions">
              <button class="character-switch-button" type="button" data-character-switch="${escapeHtml(id)}" ${active ? "disabled" : ""}>${active ? "当前" : "进入"}</button>
              <button class="icon-button character-delete-button" type="button" data-character-delete="${escapeHtml(id)}" ${characters.length <= 1 ? "disabled" : ""} aria-label="删除${escapeHtml(name)}" title="删除角色">×</button>
            </span>
          </article>`;
      }).join("")
      : `<div class="character-empty">尚未创建角色</div>`;
  }

  renderWorld(model = {}) {
    const world = model.world ?? {};
    const regions = Array.isArray(world.regions) ? world.regions : [];
    const scene = model.worldScene || "map";
    const currentNode = world.currentNode || null;
    this.worldMapViewMode = sanitizeWorldMapViewMode(
      model.settings?.worldMapViewMode ?? this.worldMapViewMode,
    );

    setText(this.dom.worldMapLevel, world.worldLevel ?? model.worldLevel ?? 1);
    setText(
      this.dom.worldMapRegion,
      world.currentRegionName || regions.find((region) => region.unlocked)?.name || "—",
    );
    setText(
      this.dom.worldMapBlurb,
      scene === "map"
        ? (this.worldMapViewMode === "list"
          ? "列表视图：点击节点进入地点。可随时切回地图视图。"
          : "在羊皮纸地图上点击节点，进入城镇、野外或副本。")
        : (currentNode?.description || "探索灰烬世界。"),
    );

    this.renderWorldMapModeToggle(this.worldMapViewMode);

    if (this.dom.worldMapBoard) {
      this.dom.worldMapBoard.innerHTML = regions.map((region) => renderWorldRegionCard(region, this.language)).join("");
    }

    if (scene === "map") {
      this.renderImmersiveWorldMap(world);
    }

    if (currentNode?.type === "town" || scene === "town") {
      setText(this.dom.townTitle, currentNode?.name || "城镇");
      setText(this.dom.townDescription, currentNode?.description || "");
      setText(this.dom.townFlavor, currentNode?.flavor || "");
      if (this.dom.townEmblem) {
        this.dom.townEmblem.textContent = currentNode?.emoji || "🏰";
      }
      this.renderTownNpcs(model.townNpcs);
    }

    if (currentNode?.type === "outdoor" || scene === "outdoor") {
      setText(this.dom.outdoorTitle, currentNode?.name || "野外");
      setText(
        this.dom.outdoorDescription,
        currentNode?.description || "强度随当前角色的远征进度变化。",
      );
      if (this.dom.outdoorEmblem) {
        this.dom.outdoorEmblem.textContent = currentNode?.emoji || "🌲";
      }
    }

    this.applyWorldScene(scene, { battleActive: this.dom.battleView && !this.dom.battleView.hidden });
    // 场景切换之后再套视图模式，避免被其它 hidden 逻辑冲掉。
    if (scene === "map") {
      this.applyWorldMapViewMode(this.worldMapViewMode);
    }
  }

  renderWorldMapModeToggle(mode = "map") {
    const selected = sanitizeWorldMapViewMode(mode);
    for (const button of document.querySelectorAll("[data-world-map-mode]")) {
      const active = button.dataset.worldMapMode === selected;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }
  }

  applyWorldMapViewMode(mode = "map") {
    const selected = sanitizeWorldMapViewMode(mode);
    this.worldMapViewMode = selected;
    const stage = this.dom.worldMapStage
      || document.querySelector("[data-world-map-stage]");
    if (stage) {
      stage.dataset.viewMode = selected;
      stage.classList.toggle("is-map-mode", selected === "map");
      stage.classList.toggle("is-list-mode", selected === "list");
    }
    // 兼容：仍同步 hidden，但主要靠 stage 的 CSS 规则切换
    if (this.dom.worldMapSvgHost) {
      this.dom.worldMapSvgHost.hidden = selected !== "map";
    }
    if (this.dom.worldMapBoard) {
      this.dom.worldMapBoard.hidden = selected !== "list";
    }
    if (selected !== "map") this.hideWorldMapCard();
    this.renderWorldMapModeToggle(selected);
  }

  renderImmersiveWorldMap(world = {}) {
    if (!this.dom.worldMapSvg) return;
    if (this.worldMapMount?.destroy) this.worldMapMount.destroy();
    const mapModel = buildWorldMapModel(world.regions || [], world);
    this.worldMapMount = mountWorldMapSvg(this.dom.worldMapSvg, mapModel, {
      reducedMotion: this.reducedMotion,
      language: this.language,
    });
    this.bindWorldMapHover(this.worldMapMount?.root);
  }

  bindWorldMapHover(root) {
    if (!root || root.dataset.wmHoverBound === "1") return;
    root.dataset.wmHoverBound = "1";
    const showFromTarget = (target) => {
      const node = target?.closest?.("[data-world-node]");
      if (!node || !root.contains(node)) return;
      this.showWorldMapCard({
        id: node.dataset.worldNode,
        name: node.dataset.nodeName,
        type: node.dataset.nodeType,
        description: node.dataset.nodeDesc,
        unlocked: node.dataset.nodeUnlocked === "1",
        region: node.dataset.nodeRegion,
        range: node.dataset.nodeRange,
      });
    };
    root.addEventListener("pointerover", (event) => showFromTarget(event.target));
    root.addEventListener("focusin", (event) => showFromTarget(event.target));
    root.addEventListener("pointerout", (event) => {
      const next = event.relatedTarget;
      if (next && root.contains(next)) return;
      // 保留卡片，直到点别处或切换视图；避免一移开就丢信息。
    });
  }

  showWorldMapCard(node = {}) {
    if (!this.dom.worldMapCard) return;
    this.selectedMapNodeId = node.id || null;
    const typeLabel = node.type === "town"
      ? pickLanguage("城镇 · 安全区", "Town · Safe Zone", this.language)
      : node.type === "outdoor"
        ? pickLanguage("野外 · 刷怪", "Outdoor · Combat", this.language)
        : node.type === "dungeon"
          ? pickLanguage("副本 · 深入", "Dungeon · Delve", this.language)
          : pickLanguage("地点", "Location", this.language);
    setText(this.dom.worldMapCardKicker, typeLabel);
    setText(this.dom.worldMapCardTitle, node.name || "—");
    setText(this.dom.worldMapCardDesc, node.description || "");
    const metaParts = [
      node.region,
      node.range,
      node.unlocked ? pickLanguage("可进入", "Available", this.language) : pickLanguage("未解锁", "Locked", this.language),
    ].filter(Boolean);
    setText(this.dom.worldMapCardMeta, metaParts.join(" · "));
    if (this.dom.worldMapCardEnter) {
      this.dom.worldMapCardEnter.hidden = !node.unlocked;
      this.dom.worldMapCardEnter.dataset.nodeId = node.id || "";
    }
    this.dom.worldMapCard.hidden = false;
  }

  hideWorldMapCard() {
    if (!this.dom.worldMapCard) return;
    this.dom.worldMapCard.hidden = true;
    this.selectedMapNodeId = null;
  }

  applyWorldScene(scene = "map", options = {}) {
    const battleActive = options.battleActive === true;
    const resolved = ["map", "town", "dungeon", "outdoor"].includes(scene) ? scene : "map";
    this.currentWorldScene = resolved;
    this.currentAdventureMode = resolved === "outdoor" ? "outdoor" : "dungeon";

    if (!battleActive) {
      if (this.dom.worldMapView) this.dom.worldMapView.hidden = resolved !== "map";
      if (this.dom.townView) this.dom.townView.hidden = resolved !== "town";
      if (this.dom.idleView) this.dom.idleView.hidden = resolved !== "dungeon";
      if (this.dom.outdoorView) this.dom.outdoorView.hidden = resolved !== "outdoor";
    }

    const titles = {
      map: { kicker: "灰烬编年史", title: "世界地图", status: "探索中" },
      town: { kicker: "安全区", title: "城镇", status: "补给中" },
      dungeon: { kicker: "地下遗迹", title: "地牢远征", status: "等待出发" },
      outdoor: { kicker: "自由探索", title: "野外漫步", status: "等待漫步" },
    };
    const meta = titles[resolved] || titles.map;
    setText(this.dom.sceneKicker, meta.kicker);
    setText(this.dom.sceneTitle, meta.title);

    const showBack = !battleActive && resolved !== "map";
    for (const button of document.querySelectorAll("[data-world-back]")) {
      // 城镇内操作区自带返回按钮；标题栏按钮在非地图场景显示
      if (button.closest(".town-actions") || button.closest(".outdoor-actions")) continue;
      button.hidden = !showBack;
    }

    if (!battleActive) {
      this.setStatus(meta.status, false);
    }
  }

  renderAdventureMode(mode = "dungeon", outdoor = {}, worldScene = null) {
    const selected = worldScene
      || (mode === "outdoor" ? "outdoor" : mode === "map" || mode === "town" ? mode : "dungeon");
    this.currentAdventureMode = selected === "outdoor" ? "outdoor" : "dungeon";
    const battleVisible = this.dom.battleView && !this.dom.battleView.hidden;
    if (!battleVisible && worldScene) {
      this.applyWorldScene(worldScene, { battleActive: false });
    } else if (!battleVisible && !worldScene) {
      // 兼容旧调用：无 worldScene 时退回地牢/野外二分
      if (this.dom.worldMapView) this.dom.worldMapView.hidden = true;
      if (this.dom.townView) this.dom.townView.hidden = true;
      if (this.dom.idleView) this.dom.idleView.hidden = selected !== "dungeon";
      if (this.dom.outdoorView) this.dom.outdoorView.hidden = selected !== "outdoor";
    }
    setText(this.dom.outdoorFloor, `第 ${numberOr(outdoor.targetFloor ?? outdoor.floorId, 1)} 层附近`);
    setText(this.dom.outdoorTotalWaves, formatNumber(outdoor.totalWaves ?? outdoor.completedWaves ?? 0));
  }

  renderTownNpcs(npcs = []) {
    if (!this.dom.townNpcList) return;
    const list = Array.isArray(npcs) ? npcs : [];
    if (list.length === 0) {
      this.dom.townNpcList.innerHTML = `<p class="town-npc-empty">这个镇子暂时没有可交谈的人。</p>`;
      return;
    }
    this.dom.townNpcList.innerHTML = list.map((npc) => `
      <button class="town-npc-card" type="button" role="listitem" data-town-npc="${escapeHtml(npc.id)}">
        <span class="npc-emoji" aria-hidden="true">${escapeHtml(npc.emoji || "🗨️")}</span>
        <span>
          <strong>${escapeHtml(npc.name || "无名")}</strong>
          <small>${escapeHtml(npc.blurb || "村民")}</small>
        </span>
        <span class="npc-marker" aria-label="${npc.marker === "available" ? "可接任务" : npc.marker === "turnin" ? "可交付" : npc.marker === "active" ? "任务进行中" : ""}">${escapeHtml(npc.markerLabel || "")}</span>
      </button>
    `).join("");
  }

  showEventCard(eventModel = null) {
    if (!this.dom.eventDialog || !eventModel?.card) return;
    const card = eventModel.card;
    const phase = eventModel.phase || "choice";
    setText(this.dom.eventTitle, card.title || pickLanguage("突发事件", "Unexpected Event", this.language));
    const rewardChips = formatEventRewardChips(eventModel.rewards, this.language);
    if (phase === "result") {
      this.dom.eventContent.innerHTML = `
        <div class="event-card-hero">
          <span class="event-emoji" aria-hidden="true">${escapeHtml(card.emoji || "❔")}</span>
          <p>${escapeHtml(card.text || "")}</p>
        </div>
        <div class="event-result-box">${escapeHtml(localizeRuntimeText(eventModel.resultText || pickLanguage("你做出了选择。", "You made your choice.", this.language), this.language))}</div>
        ${rewardChips ? `<div class="event-reward-chips">${rewardChips}</div>` : ""}
      `;
      this.dom.eventActions.innerHTML = `
         <button class="primary-button" type="button" data-event-continue>${pickLanguage("继续漫步", "Continue", this.language)}</button>
      `;
    } else {
      this.dom.eventContent.innerHTML = `
        <div class="event-card-hero">
          <span class="event-emoji" aria-hidden="true">${escapeHtml(card.emoji || "❔")}</span>
          <p>${escapeHtml(card.text || "")}</p>
        </div>
      `;
      const options = Array.isArray(card.options) ? card.options : [];
      this.dom.eventActions.innerHTML = options.map((option, index) => `
        <button class="${index === 0 ? "primary-button" : "secondary-button"}" type="button" data-event-option="${index}">
          ${escapeHtml(option.label || `选项 ${index + 1}`)}
        </button>
      `).join("");
    }
    openDialog(this.dom.eventDialog);
  }

  closeEventCard() {
    closeDialog(this.dom.eventDialog);
  }

  showDialogue(dialogue = null) {
    if (!this.dom.dialogueDialog || !dialogue?.node) return;
    const npc = dialogue.npc || {};
    const node = dialogue.node;
    setText(this.dom.dialogueTitle, npc.name || pickLanguage("对话", "Dialogue", this.language));
    if (this.dom.dialogueEmoji) this.dom.dialogueEmoji.textContent = npc.emoji || "🗨️";
    this.dom.dialogueContent.innerHTML = `<p>${escapeHtml(node.text || "……")}</p>`;
    const options = Array.isArray(node.options) ? node.options : [];
    this.dom.dialogueActions.innerHTML = options.map((option, index) => `
      <button class="${index === 0 ? "primary-button" : "secondary-button"}" type="button" data-dialogue-option="${index}">
        ${escapeHtml(option.label || `选项 ${index + 1}`)}
      </button>
    `).join("") || `<button class="primary-button" type="button" data-dialogue-close>${pickLanguage("告辞", "Farewell", this.language)}</button>`;
    openDialog(this.dom.dialogueDialog);
  }

  closeDialogue() {
    closeDialog(this.dom.dialogueDialog);
  }

  showQuestLog(log = {}) {
    if (!this.dom.questDialog || !this.dom.questLogContent) return;
    const active = Array.isArray(log.active) ? log.active : [];
    const completed = Array.isArray(log.completed) ? log.completed : [];
    const activeMarkup = active.length
      ? active.map((quest) => `
        <article class="quest-log-item ${quest.ready ? "is-ready" : ""}">
          <strong>${quest.ready ? "✅ " : "❗ "}${escapeHtml(quest.name || quest.id)}</strong>
          <p>${escapeHtml(quest.description || "")}</p>
          <div class="quest-progress">${escapeHtml(quest.progressText || "")}</div>
        </article>
      `).join("")
      : `<p class="quest-log-empty">${pickLanguage("当前没有进行中的任务。", "No active quests.", this.language)}</p>`;
    const completedMarkup = completed.length
      ? `<h3 class="panel-kicker" style="margin:14px 0 8px">${pickLanguage("已完成", "Completed", this.language)}</h3>
        ${completed.map((quest) => `
          <article class="quest-log-item">
            <strong>${escapeHtml(quest.name || quest.id)}</strong>
            <p>${escapeHtml(quest.description || "")}</p>
          </article>
        `).join("")}`
      : "";
    this.dom.questLogContent.innerHTML = `<div class="quest-log-list">${activeMarkup}${completedMarkup}</div>`;
    openDialog(this.dom.questDialog);
  }

  closeQuestLog() {
    closeDialog(this.dom.questDialog);
  }

  activateInventoryTab(name) {
    const selected = ["shop", "materials"].includes(name) ? name : "inventory";
    for (const button of document.querySelectorAll("[data-inventory-tab]")) {
      const active = button.dataset.inventoryTab === selected;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    }
    for (const panel of document.querySelectorAll("[data-inventory-view]")) {
      panel.hidden = panel.dataset.inventoryView !== selected;
    }
  }

  activateCharacterTab(name, { focus = false } = {}) {
    const valid = ["attributes", "skills", "career", "equipment"];
    const selected = valid.includes(name) ? name : "attributes";
    for (const tab of document.querySelectorAll("[data-character-tab]")) {
      const active = tab.dataset.characterTab === selected;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      if (active && focus) tab.focus();
    }
    for (const panel of document.querySelectorAll("[data-character-view]")) {
      const active = panel.dataset.characterView === selected;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    }
  }

  showClassSelection(model = {}) {
    if (!this.dom.classDialog) return;
    const hero = model.character?.hero ?? {};
    this.renderCharacterManager(model);
    this.selectClassOption(hero.classId || model.classes?.[0]?.id || "warrior");
    if (typeof this.dom.classDialog.showModal === "function") {
      if (!this.dom.classDialog.open) this.dom.classDialog.showModal();
    } else {
      this.dom.classDialog.setAttribute("open", "");
    }
  }

  showCharacterManager(model = {}) {
    this.showClassSelection(model);
  }

  selectClassOption(classId) {
    this.selectedClassId = classId;
    for (const option of document.querySelectorAll("[data-class-id]")) {
      const selected = option.dataset.classId === classId;
      option.classList.toggle("is-selected", selected);
      option.setAttribute("aria-checked", String(selected));
    }
  }

  closeClassSelection() {
    if (!this.dom.classDialog) return;
    if (this.dom.classDialog.open && typeof this.dom.classDialog.close === "function") {
      this.dom.classDialog.close();
    } else {
      this.dom.classDialog.removeAttribute("open");
    }
  }


  closeCharacterManager() {
    this.closeClassSelection();
  }

  showReforge(pending) {
    if (!this.dom.reforgeDialog || !this.dom.reforgeContent || !pending?.original || !pending?.candidate) return;
    const delta = numberOr(pending.candidate.power, 0) - numberOr(pending.original.power, 0);
    this.dom.reforgeContent.innerHTML = `
      <div class="reforge-cost-line"><span>本次已支付</span><strong>◈ ${formatNumber(pending.cost)}</strong></div>
      <div class="reforge-comparison">
        ${renderReforgeColumn("原词条", pending.original, "old")}
        ${renderReforgeColumn("新词条", pending.candidate, "new")}
      </div>
      <p class="reforge-power-delta ${delta >= 0 ? "comparison-up" : "comparison-down"}">
        装备战力 ${delta >= 0 ? "+" : ""}${formatNumber(delta)}
      </p>`;
    if (typeof this.dom.reforgeDialog.showModal === "function") {
      if (!this.dom.reforgeDialog.open) this.dom.reforgeDialog.showModal();
    } else {
      this.dom.reforgeDialog.setAttribute("open", "");
    }
  }

  closeReforge() {
    if (!this.dom.reforgeDialog) return;
    if (this.dom.reforgeDialog.open && typeof this.dom.reforgeDialog.close === "function") {
      this.dom.reforgeDialog.close();
    } else {
      this.dom.reforgeDialog.removeAttribute("open");
    }
  }

  showBattle({ hero, classMeta, stats, enemies, floor, speed, mode = "dungeon", waveNumber = 1 }) {
    this.dom.idleView.hidden = true;
    if (this.dom.outdoorView) this.dom.outdoorView.hidden = true;
    if (this.dom.worldMapView) this.dom.worldMapView.hidden = true;
    if (this.dom.townView) this.dom.townView.hidden = true;
    for (const button of document.querySelectorAll(".dungeon-heading-actions [data-world-back]")) {
      button.hidden = true;
    }
    this.dom.battleView.hidden = false;
    setText(this.dom.heroBattleName, hero.name || pickLanguage("无名战士", "Unnamed Warrior", this.language));
    const portrait = document.querySelector(".hero-combatant .combatant-portrait");
    if (portrait) portrait.textContent = classMeta?.emoji || "⚔️";
    setText(this.dom.battleRound, 1);
    setMeter(this.dom.heroHpFill, 1, this.dom.heroHpFill?.parentElement);
    setText(this.dom.heroHpText, `${formatNumber(stats.maxHp)} / ${formatNumber(stats.maxHp)}`);
    if (this.dom.minions) {
      this.dom.minions.replaceChildren();
      this.dom.minions.hidden = true;
    }
    this.dom.log?.replaceChildren();
    this.setCharacterControlsDisabled(true);
    const outdoor = mode === "outdoor";
    this.currentAdventureMode = outdoor ? "outdoor" : "dungeon";
    setText(this.dom.battleCaption, outdoor ? pickLanguage(`野外漫步 · 第 ${waveNumber} 波`, `Outdoor Run · Wave ${waveNumber}`, this.language) : pickLanguage("自动战斗", "Auto Battle", this.language));
    if (this.dom.retreat) this.dom.retreat.hidden = outdoor;
    if (this.dom.outdoorStop) this.dom.outdoorStop.hidden = !outdoor;
    this.setStatus(outdoor ? `第 ${waveNumber} 波 · 漫步中` : `第 ${floor.id ?? floor.floorId} 层 · 战斗中`, true);
    this.updateSpeed(speed);
    this.setBattleControlsDisabled(false);

    if (this.dom.enemies) {
      this.dom.enemies.innerHTML = enemies.map((enemy) => `
        <article class="enemy-combatant ${enemy.isElite ? "is-elite" : ""} ${enemy.isBoss ? "is-boss" : ""}" data-enemy-id="${escapeHtml(enemy.id)}">
          <span class="enemy-portrait" aria-hidden="true">${escapeHtml(enemy.icon || "💀")}</span>
          <div>
            <div class="enemy-name-row">
              <strong>${enemy.isBoss ? `<span class="unit-badge is-boss">${pickLanguage("首领", "Boss", this.language)}</span>` : enemy.isElite ? `<span class="unit-badge is-elite">${pickLanguage("精英", "Elite", this.language)}</span>` : ""}${escapeHtml(getUnitDisplayName(enemy, this.language))}</strong>
              <span data-enemy-hp-text>${formatNumber(enemy.hp ?? enemy.maxHp)} / ${formatNumber(enemy.maxHp)}</span>
            </div>
            <div class="meter enemy-hp" role="progressbar" aria-label="${escapeHtml(enemy.name)}生命值"
              aria-valuemin="0" aria-valuemax="100" aria-valuenow="100">
              <span class="meter-fill" style="width: 100%"></span>
            </div>
          </div>
        </article>`).join("");
    }
  }

  applyBattleSnapshot(snapshot = {}) {
    const hero = snapshot.player || snapshot.hero || {};
    const heroHp = numberOr(snapshot.playerHp ?? snapshot.heroHp ?? hero.hp, 0);
    const heroMaxHp = Math.max(1, numberOr(snapshot.playerMaxHp ?? snapshot.heroMaxHp ?? hero.maxHp, heroHp || 1));
    setMeter(this.dom.heroHpFill, heroHp / heroMaxHp, this.dom.heroHpFill?.parentElement);
    setText(this.dom.heroHpText, `${formatNumber(heroHp)} / ${formatNumber(heroMaxHp)}`);
    this.applyMinionSnapshot(Array.isArray(snapshot.minions) ? snapshot.minions : []);

    const enemies = Array.isArray(snapshot.enemies)
      ? snapshot.enemies
      : Object.entries(snapshot.enemies || {}).map(([id, value]) => ({ id, ...value }));
    for (const enemy of enemies) {
      const card = this.dom.enemies?.querySelector(`[data-enemy-id="${cssEscape(enemy.id)}"]`);
      if (!card) continue;
      const hp = Math.max(0, numberOr(enemy.hp, 0));
      const maxHp = Math.max(1, numberOr(enemy.maxHp, hp || 1));
      const fill = card.querySelector(".meter-fill");
      const meter = fill?.parentElement;
      setMeter(fill, hp / maxHp, meter);
      setText(card.querySelector("[data-enemy-hp-text]"), `${formatNumber(hp)} / ${formatNumber(maxHp)}`);
      card.classList.toggle("is-defeated", hp <= 0);
    }
  }

  /** Keeps every summoned minion visible as a chip; the dead stay grayed out. */
  applyMinionSnapshot(minions) {
    if (!this.dom.minions) return;
    this.dom.minions.hidden = minions.length === 0;
    for (const minion of minions) {
      if (!minion?.id) continue;
      let chip = this.dom.minions.querySelector(`[data-minion-id="${cssEscape(minion.id)}"]`);
      if (!chip) {
        chip = document.createElement("span");
        chip.className = "minion-chip";
        chip.dataset.minionId = String(minion.id);
        chip.innerHTML = `<span class="minion-emoji" aria-hidden="true"></span><span class="minion-hp"><i></i></span>`;
        this.dom.minions.append(chip);
      }
      const hp = Math.max(0, numberOr(minion.hp, 0));
      const maxHp = Math.max(1, numberOr(minion.maxHp, hp || 1));
      const emoji = chip.querySelector(".minion-emoji");
      if (emoji) emoji.textContent = minion.emoji || "💀";
      const fill = chip.querySelector(".minion-hp i");
      if (fill) fill.style.width = `${Math.round((hp / maxHp) * 100)}%`;
      chip.classList.toggle("is-dead", hp <= 0);
      chip.title = `${minion.name ?? "召唤物"} ${formatNumber(hp)} / ${formatNumber(maxHp)}`;
    }
  }

  appendBattleLog(entry) {
    if (!this.dom.log) return;
    const item = document.createElement("li");
    item.dataset.logType = logType(entry);
    item.textContent = localizeBattleLog(entry, this.language);
    this.dom.log.append(item);
    if (this.dom.log.children.length > 160) this.dom.log.firstElementChild?.remove();
    this.dom.log.scrollTop = this.dom.log.scrollHeight;
    if (Number.isFinite(entry?.round)) setText(this.dom.battleRound, entry.round);
    this.spawnBattleEffects(entry);
    this.playLogSound(entry);
  }

  playLogSound(entry) {
    if (!entry || typeof entry !== "object") return;
    if (entry.type === "status") return this.audio.play("burn");
    if (entry.type === "loot") return this.audio.play("loot");
    if (entry.type !== "action") return;
    if (entry.actionType === "heal") return this.audio.play("heal");
    if (["guard", "empower", "summon"].includes(entry.actionType)) return this.audio.play("buff");
    if (entry.dodged || (numberOr(entry.dodgedCount, 0) > 0 && numberOr(entry.successfulHitCount, 0) === 0)) {
      return this.audio.play("dodge");
    }
    return this.audio.play(entry.critical || numberOr(entry.criticalCount, 0) > 0 ? "crit" : "hit");
  }

  /** Floating combat text + hit flash, driven purely by log entries. */
  spawnBattleEffects(entry) {
    if (this.reducedMotion || !entry || typeof entry !== "object") return;
    if (entry.type === "status" && entry.actor) {
      this.floatOverUnit(entry.actor, `-${formatNumber(entry.damage)}`, "is-burn");
      return;
    }
    if (entry.type !== "action") return;
    if (entry.actionType === "heal" && entry.actor) {
      this.floatOverUnit(entry.actor, `+${formatNumber(entry.healing)}`, "is-heal");
      return;
    }
    if (!Array.isArray(entry.targets)) return;
    if (["single", "aoe"].includes(entry.actionType) && entry.actor) {
      this.animateUnitAttack(entry.actor, entry.actionType === "aoe");
    }
    let landedHits = 0;
    let criticalHits = 0;
    for (const target of entry.targets) {
      if (!target?.id || entry.actionType === "summon") continue;
      if (target.dodged) {
        this.floatOverUnit(target, "闪避", "is-dodge");
      } else {
        this.floatOverUnit(target, `-${formatNumber(target.damage)}`, target.critical ? "is-crit" : "", true);
        this.impactOverUnit(target, target.critical === true);
        landedHits += 1;
        if (target.critical) criticalHits += 1;
      }
    }
    if (criticalHits > 0 || (entry.actionType === "aoe" && landedHits >= 2)) {
      this.pulseBattleImpact(criticalHits > 0);
    }
  }

  animateUnitAttack(unit, isArea = false) {
    const card = this.findUnitCard(unit);
    if (!card) return;
    card.classList.remove("is-attacking", "is-area-attacking", "is-attacking-left");
    void card.offsetWidth;
    card.classList.toggle("is-attacking-left", unit.side === "enemy");
    card.classList.add(isArea ? "is-area-attacking" : "is-attacking");
    setTimeout(() => {
      card.classList.remove("is-attacking", "is-area-attacking", "is-attacking-left");
    }, 280);
  }

  impactOverUnit(unit, critical = false) {
    const card = this.findUnitCard(unit);
    if (!card) return;
    const burst = document.createElement("span");
    burst.className = `hit-impact${critical ? " is-critical" : ""}`;
    burst.setAttribute("aria-hidden", "true");
    burst.innerHTML = `<i class="hit-impact-ring"></i>${[
      [-17, -12], [18, -9], [-13, 14], [16, 13], [0, -20], [2, 20],
    ].slice(0, critical ? 6 : 4).map(([x, y], index) =>
      `<i class="hit-spark" style="--spark-x:${x}px;--spark-y:${y}px;--spark-delay:${index * 12}ms"></i>`,
    ).join("")}`;
    card.append(burst);
    const remove = () => burst.remove();
    burst.addEventListener("animationend", remove, { once: true });
    setTimeout(remove, 620);
  }

  pulseBattleImpact(critical = false) {
    const view = this.dom.battleView;
    if (!view) return;
    view.classList.remove("is-impacting", "is-critical-impact");
    void view.offsetWidth;
    view.classList.toggle("is-critical-impact", critical);
    view.classList.add("is-impacting");
    setTimeout(() => view.classList.remove("is-impacting", "is-critical-impact"), 260);
  }

  floatOverUnit(unit, text, extraClass = "", flash = false) {
    const card = this.findUnitCard(unit);
    if (!card) return;
    if (flash) {
      card.classList.remove("is-hit", "is-hit-left");
      // 重新触发受击动画需要强制一次 reflow。
      void card.offsetWidth;
      card.classList.toggle("is-hit-left", unit.side === "player" || unit.side === "minion");
      card.classList.add("is-hit");
      setTimeout(() => card.classList.remove("is-hit", "is-hit-left"), 320);
    }
    const float = document.createElement("span");
    float.className = `damage-float ${extraClass}`.trim();
    float.textContent = text;
    card.append(float);
    const remove = () => float.remove();
    float.addEventListener("animationend", remove, { once: true });
    setTimeout(remove, 1300);
  }

  findUnitCard(unit) {
    const id = String(unit?.id ?? "");
    if (!id) return null;
    if (unit.side === "player") return document.querySelector(".hero-combatant");
    if (unit.side === "minion") {
      return this.dom.minions?.querySelector(`[data-minion-id="${cssEscape(id)}"]`);
    }
    return this.dom.enemies?.querySelector(`[data-enemy-id="${cssEscape(id)}"]`);
  }

  finishBattle(victory, retreat = false) {
    this.setBattleControlsDisabled(true);
    this.setCharacterControlsDisabled(false);
    this.setStatus(retreat ? "已撤退" : victory ? "远征胜利" : "远征失败", false);
  }

  returnToDungeon(mode = this.currentWorldScene || this.currentAdventureMode) {
    this.dom.battleView.hidden = true;
    if (this.dom.retreat) this.dom.retreat.hidden = false;
    if (this.dom.outdoorStop) this.dom.outdoorStop.hidden = true;
    this.setCharacterControlsDisabled(false);
    this.activatePanel("dungeon");
    const scene = mode === "outdoor"
      ? "outdoor"
      : mode === "town"
        ? "town"
        : mode === "map"
          ? "map"
          : mode === "dungeon"
            ? "dungeon"
            : (this.currentWorldScene || "map");
    this.applyWorldScene(scene, { battleActive: false });
  }

  updateSpeed(speed) {
    for (const button of this.dom.speedControls?.querySelectorAll("[data-speed]") || []) {
      const active = numberOr(button.dataset.speed, 1) === speed;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }
  }

  setBattleControlsDisabled(disabled) {
    for (const button of this.dom.speedControls?.querySelectorAll("button") || []) {
      button.disabled = disabled;
    }
    if (this.dom.skip) this.dom.skip.disabled = disabled;
    if (this.dom.retreat) this.dom.retreat.disabled = disabled;
    if (this.dom.outdoorStop) this.dom.outdoorStop.disabled = disabled;
  }

  setCharacterControlsDisabled(disabled) {
    if (this.dom.autoAllocate) this.dom.autoAllocate.disabled = disabled;
    for (const button of document.querySelectorAll(
      "[data-allocate-stat], [data-unequip-slot], [data-equip-id], [data-sell-id], [data-reforge-id], [data-upgrade-skill], [data-reset-skills], [data-prestige], [data-character-manage], [data-class-change], [data-shop-refresh], [data-buy-listing], [data-world-node], [data-world-back], [data-world-map-mode], [data-world-map-card-enter], [data-town-shop], [data-town-inventory], [data-town-characters], [data-town-npc], [data-quest-log], [data-start-outdoor], [data-event-option], [data-event-continue], [data-dialogue-option]",
    )) {
      button.disabled = disabled;
    }
  }

  showResult(result) {
    result = { ...result, diagnosis: localizeDiagnosis(result.diagnosis, this.language) };
    this.lastResult = result;
    if (!this.dom.resultContent || !this.dom.resultDialog) return;
    setText(this.dom.resultKicker, pickLanguage("远征结算", "Expedition Summary", this.language));
    setText(this.dom.resultTitle, pickLanguage("战斗结果", "Battle Result", this.language));
    setText(this.dom.resultReturn, result.outdoor === true ? pickLanguage("返回野外", "Return Outdoors", this.language) : pickLanguage("返回地牢", "Return to Dungeon", this.language));
    if (this.dom.resultAgain) {
      const canRepeat = result.canRepeat === true;
      this.dom.resultAgain.hidden = !canRepeat;
      if (canRepeat) {
        const advances = result.victory && result.nextFloorId
          && result.nextFloorId !== result.floorId;
        setText(this.dom.resultAgain, advances ? pickLanguage(`⚔ 挑战第 ${result.nextFloorId} 层`, `⚔ Challenge Floor ${result.nextFloorId}`, this.language) : pickLanguage("⚔ 再战本层", "⚔ Fight Again", this.language));
      }
    }
    this.audio.play(result.victory ? "victory" : "defeat");
    if (result.victory && result.levelsGained) this.audio.play("levelup");
    const retreated = result.retreat === true;
    const lootItems = Array.isArray(result.lootItems)
      ? result.lootItems
      : result.loot ? [result.loot] : [];
    const salvagedItems = Array.isArray(result.salvagedItems)
      ? result.salvagedItems
      : result.salvagedItem ? [result.salvagedItem] : [];
    const previousEquipment = result.previousEquipment || {};
    const rewardMarkup = result.victory
      ? `
        <div class="result-rewards" aria-label="战斗收益">
          <div><span>${pickLanguage("经验", "Experience", this.language)}</span><strong>+${formatNumber(result.experience, this.language)}</strong></div>
          <div><span>${pickLanguage("金币", "Gold", this.language)}</span><strong>+${formatNumber(result.gold, this.language)}</strong></div>
        </div>
        ${result.levelsGained ? `<p class="level-up-callout">✦ 等级提升至 Lv.${result.level}${result.skillPointsGained ? `，技能点 +${result.skillPointsGained}` : ""}</p>` : result.skillPointsGained ? `<p class="level-up-callout">✦ 技能点 +${result.skillPointsGained}</p>` : ""}
        ${lootItems.length > 0 ? `<section class="loot-result"><h3>${pickLanguage("获得装备", "Equipment Found", this.language)}${lootItems.length > 1 ? ` (${lootItems.length})` : ""}</h3>${lootItems.map((item) => renderResultLoot(item, previousEquipment[item.slot] ?? result.equippedItem, this.language)).join("")}</section>` : ""}
        ${salvagedItems.length > 0 ? `<p class="salvage-note">💰 背包已满，${salvagedItems.map((item) => escapeHtml(item.name)).join("、")} 已自动分解为 ${formatNumber(result.salvageGold)} 枚金币。</p>` : ""}`
      : `
        <div class="result-rewards is-defeat" aria-label="${retreated ? "撤退损失" : "战败损失"}">
          <div><span>损失经验</span><strong>-${formatNumber(result.experienceLost)}</strong></div>
          <div><span>损失金币</span><strong>-${formatNumber(result.goldLost)}</strong></div>
        </div>
        <p class="defeat-note">${retreated ? "你及时脱离了战场。" : "你被拖回了营地。"}角色和装备都得以保留，可以整备后再次挑战。</p>`;
    const diagnosisMarkup = !result.victory && result.diagnosis?.suggestions?.length
      ? `<section class="battle-diagnosis"><h3>⌁ ${escapeHtml(t("diagnostics.title", this.language))}</h3><div>${result.diagnosis.suggestions.map((item) => `<article class="severity-${escapeHtml(item.severity)}"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.detail)}</p><small>${escapeHtml(item.action)}</small></article>`).join("")}</div></section>`
      : "";

    this.dom.resultContent.innerHTML = `
      <div class="result-banner ${result.victory ? "is-victory" : retreated ? "is-retreat" : "is-defeat"}">
        <span aria-hidden="true">${result.victory ? "🏆" : retreated ? "↩" : "☠️"}</span>
        <div><strong>${result.victory ? pickLanguage("清剿完成", "Victory", this.language) : retreated ? pickLanguage("已撤退", "Retreated", this.language) : pickLanguage("远征失利", "Defeat", this.language)}</strong><p>${escapeHtml(localizeRuntimeText(result.summary || "", this.language))}</p></div>
      </div>
      ${result.saveFailed ? `<p class="save-error-note" role="alert">进度暂时无法写入浏览器存储，请检查存储权限后再继续。</p>` : ""}
      ${rewardMarkup}
      ${diagnosisMarkup}
      ${renderBattleReport(result.statistics, this.language)}`;
    if (typeof this.dom.resultDialog.showModal === "function") {
      if (!this.dom.resultDialog.open) this.dom.resultDialog.showModal();
    } else {
      this.dom.resultDialog.setAttribute("open", "");
    }
  }

  showOutdoorResult(result = {}) {
    this.lastResult = { ...result, outdoor: true };
    if (!this.dom.resultContent || !this.dom.resultDialog) return;
    setText(this.dom.resultKicker, "野外漫步");
    setText(this.dom.resultTitle, "漫步结算");
    setText(this.dom.resultReturn, "返回荒野");
    if (this.dom.resultAgain) this.dom.resultAgain.hidden = true;
    this.audio.play(result.reason === "defeat" ? "defeat" : "victory");
    const stopped = result.reason === "manual" || result.reason === "complete";
    const bannerTitle = result.reason === "defeat" ? "漫步中止" : "收益已结算";
    const stored = numberOr(result.itemsStored, 0);
    const salvaged = numberOr(result.itemsSalvaged, 0);
    this.dom.resultContent.innerHTML = `
      <div class="result-banner ${result.reason === "defeat" ? "is-defeat" : "is-victory"}">
        <span aria-hidden="true">${result.reason === "defeat" ? "☠️" : "🌲"}</span>
        <div><strong>${bannerTitle}</strong><p>${escapeHtml(result.summary || "")}</p></div>
      </div>
      <div class="result-rewards outdoor-rewards" aria-label="野外收益">
        <div><span>完成波次</span><strong>${formatNumber(result.completedWaves)}</strong></div>
        <div><span>经验</span><strong>+${formatNumber(result.experience)}</strong></div>
        <div><span>金币</span><strong>+${formatNumber(result.gold)}</strong></div>
      </div>
      <p class="outdoor-settlement-note">装备收入背包 ${formatNumber(stored)} 件${salvaged ? `，${formatNumber(salvaged)} 件已分解为金币` : ""}${result.materialCount ? `；获得材料 ${formatNumber(result.materialCount)} 件` : ""}${Array.isArray(result.materialLabels) && result.materialLabels.length ? `（${result.materialLabels.map((label) => escapeHtml(label)).join("、")}）` : ""}。</p>
      ${result.saveFailed ? `<p class="save-error-note" role="alert">进度暂时无法写入浏览器存储，请检查存储权限后再继续。</p>` : ""}`;
    if (typeof this.dom.resultDialog.showModal === "function") {
      if (!this.dom.resultDialog.open) this.dom.resultDialog.showModal();
    } else {
      this.dom.resultDialog.setAttribute("open", "");
    }
  }

  closeResult() {
    if (!this.dom.resultDialog) return;
    if (this.dom.resultDialog.open && typeof this.dom.resultDialog.close === "function") {
      this.dom.resultDialog.close();
    } else {
      this.dom.resultDialog.removeAttribute("open");
    }
    this.handlers.closeResult?.();
  }

  showToast(message, tone = "normal") {
    if (!this.dom.toast) return;
    clearTimeout(this.toastTimer);
    this.dom.toast.textContent = localizeRuntimeText(message, this.language);
    this.dom.toast.hidden = false;
    this.dom.toast.classList.toggle("is-error", tone === "error");
    this.dom.toast.classList.toggle("is-reward", tone === "reward");
    this.dom.toast.setAttribute("role", tone === "error" ? "alert" : "status");
    this.dom.toast.setAttribute("aria-live", tone === "error" ? "assertive" : "polite");
    this.toastTimer = setTimeout(() => {
      this.dom.toast.hidden = true;
    }, 2600);
  }

  showSaveError() {
    if (this.dom.resultDialog?.open && this.dom.resultContent) {
      if (!this.dom.resultContent.querySelector(".save-error-note")) {
        this.dom.resultContent.insertAdjacentHTML(
          "afterbegin",
          `<p class="save-error-note" role="alert">进度暂时无法写入浏览器存储，请检查存储权限后再继续。</p>`,
        );
      }
      return;
    }
    this.showToast("浏览器未能保存进度，请检查存储权限。", "error");
  }

  activatePanel(name) {
    for (const panel of document.querySelectorAll("[data-game-panel]")) {
      panel.classList.toggle("is-active", panel.dataset.gamePanel === name);
    }
    for (const tab of document.querySelectorAll("[data-mobile-tab]")) {
      const active = tab.dataset.mobileTab === name;
      tab.classList.toggle("is-active", active);
      if (active) tab.setAttribute("aria-current", "page");
      else tab.removeAttribute("aria-current");
    }
  }

  focusDungeonEntry() {
    this.dom.floorPreview?.querySelector("[data-enter-floor]")?.focus();
  }

  setStatus(label, active) {
    if (!this.dom.status) return;
    this.dom.status.innerHTML = `<i aria-hidden="true"></i>${escapeHtml(label)}`;
    this.dom.status.classList.toggle("is-battling", active);
  }
}

function collectDom() {
  const hook = (name) => document.querySelector(`[data-${name}]`);
  return {
    coins: hook("coins"),
    maxFloor: hook("max-floor"),
    worldLevel: hook("world-level"),
    sceneKicker: hook("scene-kicker"),
    sceneTitle: hook("scene-title"),
    worldMapView: hook("world-map-view"),
    worldMapStage: hook("world-map-stage"),
    worldMapBoard: hook("world-map-board"),
    worldMapSvg: hook("world-map-svg"),
    worldMapSvgHost: hook("world-map-svg-host"),
    worldMapCard: hook("world-map-card"),
    worldMapCardKicker: hook("world-map-card-kicker"),
    worldMapCardTitle: hook("world-map-card-title"),
    worldMapCardDesc: hook("world-map-card-desc"),
    worldMapCardMeta: hook("world-map-card-meta"),
    worldMapCardEnter: hook("world-map-card-enter"),
    worldMapLevel: hook("world-map-level"),
    worldMapRegion: hook("world-map-region"),
    worldMapBlurb: hook("world-map-blurb"),
    townView: hook("town-view"),
    townTitle: hook("town-title"),
    townDescription: hook("town-description"),
    townFlavor: hook("town-flavor"),
    townEmblem: hook("town-emblem"),
    townNpcList: hook("town-npc-list"),
    eventDialog: hook("event-dialog"),
    eventTitle: hook("event-title"),
    eventContent: hook("event-content"),
    eventActions: hook("event-actions"),
    dialogueDialog: hook("dialogue-dialog"),
    dialogueTitle: hook("dialogue-title"),
    dialogueEmoji: hook("dialogue-emoji"),
    dialogueContent: hook("dialogue-content"),
    dialogueActions: hook("dialogue-actions"),
    questDialog: hook("quest-dialog"),
    questLogContent: hook("quest-log-content"),
    level: hook("level"),
    expText: hook("exp-text"),
    expFill: hook("exp-fill"),
    power: hook("power"),
    hp: hook("hp"),
    attack: hook("attack"),
    defense: hook("defense"),
    speed: hook("speed"),
    strength: hook("strength"),
    agility: hook("agility"),
    intelligence: hook("intelligence"),
    vitality: hook("vitality"),
    statPoints: hook("stat-points"),
    skillPoints: hook("skill-points"),
    skills: hook("skills"),
    className: hook("class-name"),
    prestigeCount: hook("prestige-count"),
    classMark: document.querySelector(".class-mark"),
    prestige: hook("prestige"),
    autoAllocate: hook("auto-allocate"),
    equipment: hook("equipment"),
    managerEquipment: hook("manager-equipment"),
    managerPower: hook("manager-power"),
    managerHp: hook("manager-hp"),
    managerAttack: hook("manager-attack"),
    managerDefense: hook("manager-defense"),
    managerSpeed: hook("manager-speed"),
    floorList: hook("floor-list"),
    floorPreview: hook("floor-preview"),
    idleView: hook("idle-view"),
    battleView: hook("battle-view"),
    enemies: hook("enemies"),
    heroBattleName: hook("hero-battle-name"),
    heroHpFill: hook("hero-hp-fill"),
    heroHpText: hook("hero-hp-text"),
    minions: hook("minions"),
    battleRound: hook("battle-round"),
    log: hook("log"),
    speedControls: hook("speed-controls"),
    skip: hook("skip"),
    retreat: hook("retreat"),
    inventory: hook("inventory"),
    inventoryPanel: document.querySelector(".inventory-panel"),
    inventoryDetail: hook("inventory-detail"),
    inventoryEmpty: hook("inventory-empty"),
    inventoryCount: hook("inventory-count"),
    inventoryLimit: hook("inventory-limit"),
    materialsList: hook("materials-list"),
    shop: hook("shop"),
    shopRefresh: hook("shop-refresh"),
    classDialog: hook("class-dialog"),
    characterList: hook("character-list"),
    characterCount: hook("character-count"),
    characterLimit: hook("character-limit"),
    characterName: hook("character-name"),
    characterCreate: hook("character-create"),
    outdoorView: hook("outdoor-view"),
    outdoorFloor: hook("outdoor-floor"),
    outdoorTotalWaves: hook("outdoor-total-waves"),
    outdoorStop: hook("stop-outdoor"),
    outdoorTitle: hook("outdoor-title"),
    outdoorDescription: hook("outdoor-description"),
    outdoorEmblem: hook("outdoor-emblem"),
    battleCaption: hook("battle-caption"),
    reforgeDialog: hook("reforge-dialog"),
    reforgeContent: hook("reforge-content"),
    reforgeClose: hook("reforge-close"),
    resultDialog: hook("result-dialog"),
    resultContent: hook("result-content"),
    resultKicker: hook("result-kicker"),
    resultTitle: hook("result-title"),
    resultReturn: hook("result-return"),
    resultAgain: hook("result-again"),
    soundToggle: hook("toggle-sound"),
    languageLabel: hook("language-label"),
    endgameObjective: hook("endgame-objective"),
    importFile: hook("import-file"),
    bulkRarity: hook("bulk-rarity"),
    careerVictories: hook("career-victories"),
    careerDefeats: hook("career-defeats"),
    careerFloor: hook("career-floor"),
    careerWaves: hook("career-waves"),
    toast: hook("toast"),
    status: document.querySelector(".status-indicator"),
  };
}

function renderInventoryTile(item, selected = false, language = "zh-CN") {
  const meta = SLOT_META[item.slot] || { icon: "◆" };
  const displayName = getItemDisplayName(item, language);
  const slotLabel = getSlotLabel(item.slot, language);
  const locked = item.locked === true;
  return `
    <button class="inventory-item-tile rarity-${rarityKey(item.rarity)} ${locked ? "is-locked" : ""} ${item.upgradeDelta > 0 ? "is-upgrade" : ""} ${selected ? "is-selected" : ""}" type="button" data-item-select="${escapeHtml(item.id)}" aria-pressed="${selected ? "true" : "false"}" title="${escapeHtml(displayName)} · ${slotLabel} · Lv.${numberOr(item.level, 1)}">
      <span class="item-tile-icon" aria-hidden="true">${escapeHtml(item.icon || meta.icon)}</span>
      <span class="item-tile-power">✦ ${formatNumber(item.power)}</span>
      <span class="item-tile-name">${escapeHtml(displayName)}</span>
      <span class="item-tile-level">Lv.${numberOr(item.level, 1)}</span>
      ${item.upgradeDelta > 0 ? `<span class="item-tile-upgrade" title="预计提升 ${formatNumber(item.upgradeDelta)} 战力">↑</span>` : ""}
      ${locked ? `<span class="item-tile-lock" aria-label="已锁定">🔒</span>` : ""}
    </button>`;
}

function renderEmptyItemInspector(language = "zh-CN") {
  return `
    <button class="icon-button item-inspector-close" type="button" data-inventory-detail-close aria-label="关闭装备详情" title="关闭详情">×</button>
    <div class="item-inspector-empty">
      <span aria-hidden="true">✦</span>
      <strong>${pickLanguage("选择一件装备", "Select an item", language)}</strong>
      <p>${pickLanguage("查看它与当前装备的属性差异。", "Compare it with your currently equipped item.", language)}</p>
    </div>`;
}

function renderItemInspector(item, equippedItem, location = "inventory", slot = item?.slot, language = "zh-CN") {
  const meta = SLOT_META[item.slot] || { icon: "◆" };
  const slotLabel = getSlotLabel(item.slot, language);
  const displayName = getItemDisplayName(item, language);
  const locked = item.locked === true;
  const isEquipped = location === "equipment";
  const comparisonTarget = equippedItem?.id === item.id ? null : equippedItem;
  const comparison = compareStats(item, comparisonTarget);
  const statMarkup = comparison.length > 0
    ? comparison.map(({ key, value, delta }) => {
      const deltaMarkup = comparisonTarget && delta !== 0
        ? `<em class="${delta > 0 ? "comparison-up" : "comparison-down"}">${delta > 0 ? "+" : "−"}${formatStatValue(key, Math.abs(delta))}</em>`
        : "";
      return `<div><span>${escapeHtml(getStatLabel(key, language))}</span><strong>${formatStatValue(key, value, language)}</strong>${deltaMarkup}</div>`;
    }).join("")
    : `<p class="item-inspector-no-stats">${pickLanguage("无额外属性", "No bonus stats", language)}</p>`;
  const comparisonLabel = comparisonTarget
    ? `${pickLanguage("对比", "Compared with", language)}: ${getItemDisplayName(comparisonTarget, language)}`
    : (isEquipped ? pickLanguage("当前已装备", "Currently equipped", language) : `${slotLabel}: ${pickLanguage("槽位为空", "empty slot", language)}`);
  const actions = isEquipped
    ? `
      <button class="secondary-button" type="button" data-unequip-slot="${escapeHtml(slot)}">${pickLanguage("卸下装备", "Unequip", language)}</button>
      <button class="primary-button" type="button" data-reforge-id="${escapeHtml(item.id)}" data-reforge-location="equipment" data-reforge-slot="${escapeHtml(slot)}">${pickLanguage("重铸", "Reforge", language)} ${formatNumber(getReforgeCost(item), language)}${formatReforgeMaterialSuffix(language)}</button>`
    : `
      <button class="primary-button" type="button" data-equip-id="${escapeHtml(item.id)}">${equippedItem ? pickLanguage("替换装备", "Replace", language) : pickLanguage("装备", "Equip", language)}</button>
      <button class="secondary-button" type="button" data-reforge-id="${escapeHtml(item.id)}" data-reforge-location="inventory">${pickLanguage("重铸", "Reforge", language)} ${formatNumber(getReforgeCost(item), language)}${formatReforgeMaterialSuffix(language)}</button>
      <button class="secondary-button inspector-sell-button" type="button" data-sell-id="${escapeHtml(item.id)}" ${locked ? `disabled title="${pickLanguage("已锁定，无法出售", "Locked items cannot be sold", language)}"` : ""}>${pickLanguage("出售", "Sell", language)} ${formatNumber(getSellValue(item), language)}</button>`;
  return `
    <button class="icon-button item-inspector-close" type="button" data-inventory-detail-close aria-label="关闭装备详情" title="关闭详情">×</button>
    <div class="item-inspector-hero rarity-${rarityKey(item.rarity)}">
      <span class="item-inspector-icon" aria-hidden="true">${escapeHtml(item.icon || meta.icon)}</span>
      <div>
        <p>${getRarityLabel(item.rarity, language)} · ${slotLabel} · Lv.${numberOr(item.level, 1)}</p>
        <h3>${escapeHtml(displayName)}</h3>
      </div>
      <button class="icon-button lock-button ${locked ? "is-locked" : ""}" type="button" data-lock-id="${escapeHtml(item.id)}" aria-label="${locked ? "解锁" : "锁定"}${escapeHtml(item.name)}" title="${locked ? "解锁（允许出售）" : "锁定（防止出售）"}">${locked ? "🔒" : "🔓"}</button>
    </div>
    <div class="item-inspector-power"><span>${pickLanguage("装备战力", "Item Power", language)}</span><strong>✦ ${formatNumber(item.power, language)}</strong>${numberOr(item.upgradeDelta, 0) !== 0 && !isEquipped ? `<em class="${item.upgradeDelta > 0 ? "comparison-up" : "comparison-down"}">${item.upgradeDelta > 0 ? "+" : ""}${formatNumber(item.upgradeDelta, language)}</em>` : ""}</div>
    <p class="item-comparison-label">${escapeHtml(comparisonLabel)}</p>
    <div class="item-inspector-stats">${statMarkup}</div>
    ${renderAffixQuality(item, language)}
    ${renderEffect(item.effect, language)}
    <div class="item-inspector-actions">${actions}</div>`;
}

/** Per-affix roll-quality chips: how close each roll is to its level ceiling. */
function renderAffixQuality(item, language = "zh-CN") {
  const affixes = Array.isArray(item?.affixes) ? item.affixes : [];
  if (affixes.length === 0) return "";
  const chips = affixes.map((affix) => {
    const quality = getAffixRollQuality(affix, item.level);
    if (!quality) return "";
    const tier = quality.percent >= 80 ? "q-high" : quality.percent >= 40 ? "q-mid" : "q-low";
    const localized = localizeAffix(affix, language);
    return `<span class="affix-chip ${tier}" title="${escapeHtml(localized.name || localized.id)}: ${quality.percent}%">${escapeHtml(localized.name || localized.id)} ${quality.percent}%</span>`;
  }).join("");
  return chips ? `<p class="item-affix-quality" aria-label="词条成色">${chips}</p>` : "";
}

function renderShopItem(listing, gold, equipment = {}, language = "zh-CN") {
  const item = listing?.item;
  if (!item) return "";
  const meta = SLOT_META[item.slot] || { icon: "◆" };
  const price = getShopPrice(item);
  // 与身上同部位装备对比(↑绿↓红),买前一眼看出值不值。
  const comparison = compareStats(item, equipment?.[item.slot]);
  const statMarkup = comparison.length > 0
    ? comparison.slice(0, 6).map(({ key, value, delta }) => {
      const deltaMarkup = delta === 0
        ? ""
        : `<span class="${delta > 0 ? "comparison-up" : "comparison-down"}">${delta > 0 ? "↑" : "↓"}${formatStatValue(key, Math.abs(delta))}</span>`;
      return `<span>${escapeHtml(getStatLabel(key, language))} +${formatStatValue(key, value, language)} ${deltaMarkup}</span>`;
    }).join("")
    : `<span>${pickLanguage("无额外属性", "No bonus stats", language)}</span>`;
  return `
    <article class="shop-item rarity-${rarityKey(item.rarity)}">
      <div class="inventory-item-header">
        <span class="slot-icon" aria-hidden="true">${escapeHtml(item.emoji || meta.icon)}</span>
        <span class="inventory-item-name"><strong>${escapeHtml(getItemDisplayName(item, language))}</strong><small>${getSlotLabel(item.slot, language)} · Lv.${numberOr(item.level, 1)}</small></span>
        <span class="item-power">✦ ${formatNumber(item.power)}</span>
      </div>
      <p class="item-stats">${statMarkup}</p>
      ${renderEffect(item.effect, language)}
      <button class="secondary-button shop-buy-button" type="button" data-buy-listing="${escapeHtml(listing.listingId)}" ${numberOr(gold, 0) < price ? "disabled" : ""}>
        ◈ ${formatNumber(price)}
      </button>
    </article>`;
}

function renderWorldRegionCard(region, language = "zh-CN") {
  const unlocked = region.unlocked === true;
  const nodes = Array.isArray(region.nodes) ? region.nodes : [];
  const range = Array.isArray(region.worldLevelRange)
    ? region.worldLevelRange
    : null;
  const rangeText = range
    ? `${pickLanguage("世界", "World", language)} ${range[0]}–${range[1] ?? range[0]}`
    : (region.theme || "");
  const nodeMarkup = unlocked && nodes.length > 0
    ? `<div class="world-node-grid">${nodes.map((node) => {
      const typeLabel = node.type === "town"
        ? pickLanguage("城镇", "Town", language)
        : node.type === "outdoor"
          ? pickLanguage("野外", "Outdoor", language)
          : node.type === "dungeon"
            ? pickLanguage("副本", "Dungeon", language)
            : pickLanguage("节点", "Location", language);
      return `
        <button
          class="world-node-button"
          type="button"
          data-world-node="${escapeHtml(node.id)}"
          data-node-type="${escapeHtml(node.type || "node")}"
          ${node.locked ? "disabled" : ""}
          title="${escapeHtml(node.description || node.name || "")}"
        >
          <span class="node-emoji" aria-hidden="true">${escapeHtml(node.emoji || "◆")}</span>
          <span class="node-copy">
            <strong>${escapeHtml(node.name || node.id)}</strong>
            <small>${typeLabel}</small>
          </span>
        </button>`;
    }).join("")}</div>`
    : `<p class="world-region-lock-hint">${escapeHtml(
      unlocked
        ? pickLanguage("此区域暂无节点", "No locations in this region", language)
        : (language === "en-US" ? "Locked" : (region.unlockHint || "尚未解锁")),
    )}</p>`;

  return `
    <article class="world-region-card ${unlocked ? "is-active" : "is-locked"}" data-region-id="${escapeHtml(region.id)}">
      <header class="world-region-header">
        <div>
          <strong>${escapeHtml(region.name || region.id)}</strong>
          <small>${escapeHtml(rangeText)}</small>
        </div>
        <span class="world-region-emoji" aria-hidden="true">${escapeHtml(region.emoji || "◆")}</span>
      </header>
      <p class="world-region-desc">${escapeHtml(region.description || "")}</p>
      ${nodeMarkup}
    </article>`;
}

function renderReforgeColumn(label, item, tone) {
  const affixes = Array.isArray(item.affixes) && item.affixes.length
    ? item.affixes.map((affix) => {
      const quality = getAffixRollQuality(affix, item.level);
      const tier = !quality ? "" : quality.percent >= 80 ? "q-high" : quality.percent >= 40 ? "q-mid" : "q-low";
      const badge = quality ? ` <em class="affix-roll ${tier}">${quality.percent}%</em>` : "";
      return `<li>${escapeHtml(affix.name || affix.id)} <strong>+${formatStatValue(affix.stat, affix.value)}</strong>${badge}</li>`;
    }).join("")
    : "<li>无词条</li>";
  return `
    <section class="reforge-column ${tone === "new" ? "is-new" : "is-old"}">
      <header><span>${label}</span><strong>✦ ${formatNumber(item.power)}</strong></header>
      <h3>${escapeHtml(item.name)}</h3>
      <ul>${affixes}</ul>
    </section>`;
}

function renderResultLoot(item, equippedItem, language = "zh-CN") {
  const comparison = compareStats(item, equippedItem);
  return `
    <article class="result-loot-card rarity-${rarityKey(item.rarity)}">
      <span class="result-loot-icon" aria-hidden="true">${escapeHtml(item.icon || SLOT_META[item.slot]?.icon || "💎")}</span>
      <div>
        <span class="rarity-${rarityKey(item.rarity)}">${getRarityLabel(item.rarity, language)}</span>
        <h4>${escapeHtml(getItemDisplayName(item, language))}</h4>
        <p>${comparison.map(({ key, value, delta }) => {
          const deltaText = delta === 0 ? "" : ` ${delta > 0 ? "↑" : "↓"}${formatStatValue(key, Math.abs(delta))}`;
          const deltaClass = delta > 0 ? "comparison-up" : delta < 0 ? "comparison-down" : "";
          return `<span>${escapeHtml(getStatLabel(key, language))} +${formatStatValue(key, value, language)} <b class="${deltaClass}">${deltaText}</b></span>`;
        }).join(" · ")}</p>
        ${renderEffect(item.effect, language)}
      </div>
      <button class="primary-button" type="button" data-equip-id="${escapeHtml(item.id)}">立即装备</button>
    </article>`;
}

function renderEffect(effect, language = "zh-CN") {
  if (!effect) return "";
  effect = localizeEffect(effect, language);
  const label = effect.name || effect.id || "特殊效果";
  const description = effect.description || "传说特效，会在战斗中自动触发。";
  return `<p class="item-effect">🔥 ${escapeHtml(label)}：${escapeHtml(description)}</p>`;
}

/** Compact end-of-battle report; rows with zero value are hidden. */
function renderBattleReport(statistics, language = "zh-CN") {
  if (!statistics) return "";
  const skillHealing = Math.max(
    0,
    numberOr(statistics.playerHealing, 0) - numberOr(statistics.lifestealHealing, 0),
  );
  const row = (zh, en, value) => [pickLanguage(zh, en, language), value];
  const rows = [
    row("造成伤害", "Damage Dealt", statistics.playerDamageDealt),
    row("召唤物伤害", "Minion Damage", statistics.minionDamageDealt),
    row("承受伤害", "Damage Taken", statistics.playerDamageTaken),
    row("最大一击", "Largest Hit", statistics.playerMaxHit),
    row("暴击次数", "Critical Hits", statistics.playerCriticalHits),
    row("闪避次数", "Dodges", statistics.playerDodges),
    row("技能治疗", "Skill Healing", skillHealing),
    row("吸血回复", "Lifesteal", statistics.lifestealHealing),
    row("燃烧伤害", "Burn Damage", statistics.burnDamage),
    row("荆棘反伤", "Thorns Damage", statistics.thornsDamage),
    row("连击触发", "Extra Strikes", statistics.extraStrikes),
    row("召唤 / 折损", "Summoned / Lost", statistics.minionsSummoned > 0
      ? `${formatNumber(statistics.minionsSummoned)} / ${formatNumber(statistics.minionsLost)}`
      : 0),
  ].filter(([, value]) => typeof value === "string" || numberOr(value, 0) > 0);
  if (rows.length === 0) return "";
  return `
    <section class="battle-report" aria-label="${pickLanguage("战报统计", "Battle statistics", language)}">
      <h3>${pickLanguage("战报", "Battle Report", language)} · ${formatNumber(statistics.rounds, language)} ${pickLanguage("回合", "Rounds", language)}</h3>
      <div class="battle-report-grid">
        ${rows.map(([label, value]) => `<div><span>${label}</span><strong>${typeof value === "string" ? escapeHtml(value) : formatNumber(value)}</strong></div>`).join("")}
      </div>
    </section>`;
}

function compareStats(item, equippedItem) {
  const nextStats = readItemStats(item);
  const currentStats = readItemStats(equippedItem);
  return [...new Set([...Object.keys(nextStats), ...Object.keys(currentStats)])]
    .filter((key) => Number.isFinite(nextStats[key]) || Number.isFinite(currentStats[key]))
    .map((key) => ({
      key,
      value: numberOr(nextStats[key], 0),
      delta: numberOr(nextStats[key], 0) - numberOr(currentStats[key], 0),
    }))
    .sort((a, b) => (STAT_META[a.key]?.order ?? 99) - (STAT_META[b.key]?.order ?? 99));
}

function readItemStats(item) {
  if (!item) return {};
  const stats = { ...(item.stats || {}), ...(item.baseStats || {}) };
  for (const affix of item.affixes || []) {
    if (affix && typeof affix.stat === "string") {
      stats[affix.stat] = numberOr(stats[affix.stat], 0) + numberOr(affix.value, 0);
    }
  }
  return stats;
}

function setMeter(fill, ratio, meter) {
  const percent = Math.round(clamp(numberOr(ratio, 0), 0, 1) * 100);
  if (fill) fill.style.width = `${percent}%`;
  if (meter) meter.setAttribute("aria-valuenow", String(percent));
}

function setText(element, value) {
  if (element) element.textContent = String(value ?? "");
}

function logType(entry) {
  const type = entry?.type;
  if (type === "action") {
    return ["aoe", "guard", "heal", "summon", "empower"].includes(entry.actionType) ? "skill" : "damage";
  }
  if (type === "status") return "status";
  if (["attack", "damage", "critical", "death", "defeat"].includes(type)) return "damage";
  if (["skill", "aoe", "buff", "dodge", "guard"].includes(type)) return "skill";
  if (["reward", "victory", "loot"].includes(type)) return "reward";
  return "info";
}

function rarityKey(value) {
  if (typeof value === "object") value = value?.id ?? value?.key;
  return RARITY_CLASSES[value] || "normal";
}

function renderAttribute(element, stat, value, language = "zh-CN") {
  if (!element) return;
  element.innerHTML = `<span>${formatNumber(value)}</span><button class="stat-add-button" type="button"
    data-allocate-stat="${stat}" aria-label="${pickLanguage("增加", "Increase", language)} ${getStatLabel(stat, language)}" title="${pickLanguage("加 1 点", "Add 1 point", language)}">+</button>`;
}

function formatStatValue(key, value, language = "zh-CN") {
  if (STAT_META[key]?.percent) return `${Math.round(value * 100)}%`;
  return formatNumber(value, language);
}

function formatNumber(value, language = "zh-CN") {
  return Math.round(numberOr(value, 0)).toLocaleString(normalizeLanguage(language));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cssEscape(value) {
  if (globalThis.CSS?.escape) return CSS.escape(String(value));
  return String(value).replaceAll('"', '\\"');
}

function formatReforgeMaterialSuffix(language = "zh-CN") {
  const req = getReforgeMaterialRequirement();
  if (!req?.required) return "";
  const material = localizeMaterial({ id: req.materialId, name: req.name || getMaterialName(req.materialId), emoji: req.emoji }, language);
  return ` + ${material.emoji || "✨"}${material.name}×${req.amount || 1}`;
}

function numberOr(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function openDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.showModal === "function") {
    if (!dialog.open) dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
}

function closeDialog(dialog) {
  if (!dialog) return;
  if (dialog.open && typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

function formatEventRewardChips(rewards, language = "zh-CN") {
  if (!rewards || typeof rewards !== "object") return "";
  const chips = [];
  if (rewards.gold) chips.push(`<span>${pickLanguage("金币", "Gold", language)} +${formatNumber(rewards.gold, language)}</span>`);
  if (rewards.goldSpent) chips.push(`<span>${pickLanguage("花费", "Spent", language)} ${formatNumber(rewards.goldSpent, language)} ${pickLanguage("金", "gold", language)}</span>`);
  if (rewards.experience) chips.push(`<span>${pickLanguage("经验", "XP", language)} +${formatNumber(rewards.experience, language)}</span>`);
  if (Array.isArray(rewards.items) && rewards.items.length) {
    chips.push(`<span>${pickLanguage("装备", "Equipment", language)} ×${rewards.items.length}</span>`);
  }
  if (rewards.materials && typeof rewards.materials === "object") {
    for (const [id, amount] of Object.entries(rewards.materials)) {
      if (amount > 0) {
        const material = localizeMaterial({ id, name: getMaterialName(id), emoji: "✨" }, language);
        chips.push(`<span>${escapeHtml(`${material.emoji} ${material.name} ×${amount}`)}</span>`);
      }
    }
  }
  if (rewards.buffs && typeof rewards.buffs === "object") {
    const buffNames = { maxHp: "生命", attack: "攻击", defense: "防御", speed: "速度" };
    for (const [stat, amount] of Object.entries(rewards.buffs)) {
      if (amount) {
        const label = getStatLabel(stat, language) || pickLanguage("属性", "Stat", language);
        chips.push(`<span>${escapeHtml(label)} ${amount > 0 ? "+" : ""}${amount}</span>`);
      }
    }
  }
  if (rewards.battle) chips.push(`<span>${pickLanguage("触发战斗", "Battle triggered", language)}</span>`);
  return chips.join("");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
