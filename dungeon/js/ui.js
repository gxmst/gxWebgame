import { getReforgeCost, getSellValue, getShopPrice } from "./economy.js";
import { getAffixRollQuality } from "./loot.js";
import { GameAudio } from "./audio.js";

const SLOT_META = {
  weapon: { label: "武器", icon: "🗡️" },
  helmet: { label: "头盔", icon: "⛑️" },
  armor: { label: "护甲", icon: "🛡️" },
  accessory: { label: "饰品", icon: "💎" },
};

const STAT_META = {
  maxHp: { label: "生命", order: 1 },
  hp: { label: "生命", order: 1 },
  attack: { label: "攻击", order: 2 },
  defense: { label: "防御", order: 3 },
  speed: { label: "速度", order: 4 },
  strength: { label: "力量", order: 5 },
  agility: { label: "敏捷", order: 6 },
  intelligence: { label: "智力", order: 7 },
  vitality: { label: "体质", order: 8 },
  critChance: { label: "暴击", order: 9, percent: true },
  critDamage: { label: "暴伤", order: 10, percent: true },
  dodgeChance: { label: "闪避", order: 10, percent: true },
  damagePercent: { label: "增伤", order: 11, percent: true },
  physicalDamagePercent: { label: "物理增伤", order: 11, percent: true },
  magicDamagePercent: { label: "法术增伤", order: 11, percent: true },
  damageReduction: { label: "减伤", order: 12, percent: true },
};

const RARITY_LABELS = {
  normal: "普通",
  excellent: "优秀",
  common: "普通",
  uncommon: "优秀",
  rare: "稀有",
  legendary: "传说",
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
    // 动效开关:尊重系统的"减少动态效果"偏好。
    this.reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
    this.audio = new GameAudio();
    this.dom = collectDom();
    this.bindEvents();
  }

  bindEvents() {
    document.addEventListener("click", (event) => {
      const inventoryTab = event.target.closest("[data-inventory-tab]");
      if (inventoryTab) {
        this.activateInventoryTab(inventoryTab.dataset.inventoryTab);
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
  }

  render(model) {
    this.renderHeader(model);
    this.syncSound(model.settings?.soundEnabled !== false);
    this.renderCharacter(model.character);
    this.renderCareer(model.career);
    this.renderCharacterManager(model);
    this.renderEquipment(model.character.equipment);
    this.renderFloors(model.floors, model.selectedFloorId);
    this.renderFloorPreview(model.selectedFloor, model.character.power);
    this.renderWorld(model);
    this.renderAdventureMode(model.adventureMode, model.outdoor, model.worldScene);
    this.renderInventory(
      model.character.inventory,
      model.character.equipment,
      model.inventoryLimit,
    );
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

  syncSound(enabled) {
    this.audio.setEnabled(enabled);
    if (!this.dom.soundToggle) return;
    this.dom.soundToggle.textContent = enabled ? "🔊" : "🔇";
    this.dom.soundToggle.setAttribute("aria-label", enabled ? "关闭音效" : "开启音效");
    this.dom.soundToggle.title = enabled ? "关闭音效" : "开启音效";
  }

  renderCareer(career = {}) {
    setText(this.dom.careerVictories, formatNumber(career.totalVictories));
    setText(this.dom.careerDefeats, formatNumber(career.totalDefeats));
    setText(this.dom.careerFloor, `第 ${formatNumber(Math.max(1, numberOr(career.highestFloor, 1)))} 层`);
    setText(this.dom.careerWaves, formatNumber(career.outdoorWaves));
  }

  renderCharacter(character) {
    const { hero, stats, levelProgress, power, classMeta, skills, skillPoints, prestige } = character;
    setText(this.dom.level, hero.level);
    setText(
      this.dom.expText,
      levelProgress.maxLevel
        ? "已满级"
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
    setText(this.dom.hp, formatNumber(stats.maxHp));
    setText(this.dom.attack, formatNumber(stats.attack));
    setText(this.dom.defense, formatNumber(stats.defense));
    setText(this.dom.speed, formatNumber(stats.speed));
    renderAttribute(this.dom.strength, "strength", stats.strength);
    renderAttribute(this.dom.agility, "agility", stats.agility);
    renderAttribute(this.dom.intelligence, "intelligence", stats.intelligence);
    renderAttribute(this.dom.vitality, "vitality", stats.vitality);
    setText(this.dom.statPoints, formatNumber(hero.unspentStatPoints));
    setText(this.dom.skillPoints, formatNumber(skillPoints?.unspent ?? hero.unspentSkillPoints));

    const name = document.querySelector(".hero-name");
    const className = document.querySelector(".hero-class");
    setText(name, hero.name || `无名${classMeta?.name ?? "冒险者"}`);
    setText(className, `${classMeta?.name ?? "职业"} · ${classMeta?.role ?? "探索者"}`);
    setText(this.dom.className, classMeta?.name ?? "战士");
    setText(this.dom.prestigeCount, prestige?.currentCount ?? hero.prestigeCount ?? 0);
    if (this.dom.classMark) {
      this.dom.classMark.textContent = classMeta?.emoji ?? "⚔️";
      this.dom.classMark.setAttribute("aria-label", `职业：${classMeta?.name ?? "战士"}`);
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
    const rows = skills.map((skill) => {
      const typeLabel = {
        aoe: "群体",
        guard: "自保",
        heal: "治疗",
        summon: "召唤",
        empower: "形态",
      }[skill.type] ?? "单体";
      const next = skill.nextLevel;
      const cooldownPreview = next && next.cooldown !== skill.cooldown
        ? `${skill.cooldown}→${next.cooldown}`
        : `${skill.cooldown}`;
      const effectParts = [];
      if (skill.type === "guard") {
        if (numberOr(skill.reduction, 0) > 0) {
          effectParts.push(`减伤 ${Math.round(numberOr(skill.reduction, 0) * 100)}%${next ? `→${Math.round(numberOr(next.reduction, 0) * 100)}%` : ""}`);
        }
        if (numberOr(skill.dodgeBonus, 0) > 0) {
          effectParts.push(`闪避 +${Math.round(numberOr(skill.dodgeBonus, 0) * 100)}%${next ? `→${Math.round(numberOr(next.dodgeBonus, 0) * 100)}%` : ""}`);
        }
      } else if (skill.type === "heal") {
        effectParts.push(`恢复 ${Math.round(numberOr(skill.healRatio, 0) * 100)}%${next ? `→${Math.round(numberOr(next.healRatio, 0) * 100)}%` : ""} 生命`);
      } else if (skill.type === "summon") {
        effectParts.push(`召唤 ${numberOr(skill.summonCount, 1)}${next && numberOr(next.summonCount, 1) !== numberOr(skill.summonCount, 1) ? `→${numberOr(next.summonCount, 1)}` : ""} 名 · 上限 ${numberOr(skill.maxMinions, 1)}${next && numberOr(next.maxMinions, 1) !== numberOr(skill.maxMinions, 1) ? `→${numberOr(next.maxMinions, 1)}` : ""}`);
        effectParts.push(`攻 ${Math.round(numberOr(skill.minionAttackRatio, 0) * 100)}%${next ? `→${Math.round(numberOr(next.minionAttackRatio, 0) * 100)}%` : ""}`);
      } else if (skill.type === "empower") {
        effectParts.push(`增伤 ${Math.round(numberOr(skill.damageBonus, 0) * 100)}%${next ? `→${Math.round(numberOr(next.damageBonus, 0) * 100)}%` : ""}`);
        if (numberOr(skill.lifestealBonus, 0) > 0) {
          effectParts.push(`吸血 +${Math.round(numberOr(skill.lifestealBonus, 0) * 100)}%`);
        }
        effectParts.push(`持续 ${numberOr(skill.duration, 1)} 回合`);
      } else {
        effectParts.push(`倍率 ${Number(skill.multiplier ?? 1).toFixed(2)}${next ? `→${Number(next.multiplier ?? 1).toFixed(2)}` : ""}`);
        if (numberOr(skill.hitCount, 1) > 1) effectParts.push(`${numberOr(skill.hitCount, 1)} 段`);
        if (numberOr(skill.critChanceBonus, 0) > 0) {
          effectParts.push(`暴击 +${Math.round(numberOr(skill.critChanceBonus, 0) * 100)}%`);
        }
      }
      effectParts.push(`冷却 ${cooldownPreview}`);
      const effect = effectParts.join(" · ");
      const maxLevel = numberOr(skill.maxLevel, numberOr(skill.level, 1));
      const basic = skill.isBasic === true;
      const canUpgrade = !basic && numberOr(pointState.unspent, 0) > 0 && numberOr(skill.level, 1) < maxLevel;
      return `
        <div class="skill-row ${basic ? "is-basic" : ""}">
          <span class="skill-icon" aria-hidden="true">${escapeHtml(skill.emoji || "✦")}</span>
          <span class="skill-copy"><strong>${escapeHtml(skill.name || skill.id)}</strong><small>${typeLabel} · ${effect}</small></span>
          <span class="skill-level">Lv.${numberOr(skill.level, 1)}/${maxLevel}</span>
          ${basic ? "" : `<button class="skill-upgrade-button" type="button" data-upgrade-skill="${escapeHtml(skill.id)}" ${canUpgrade ? "" : "disabled"} aria-label="提升${escapeHtml(skill.name || skill.id)}">+</button>`}
        </div>`;
    }).join("");
    this.dom.skills.innerHTML = `${rows}${numberOr(pointState.spent, 0) > 0
      ? `<button class="skills-reset-button" type="button" data-reset-skills>重置技能点</button>`
      : ""}`;
    if (!skills.length) {
      this.dom.skills.innerHTML = `<div class="empty-state"><strong>暂无可用技能</strong></div>`;
    }
  }

  renderEquipment(equipment = {}) {
    if (!this.dom.equipment) return;
    this.dom.equipment.innerHTML = Object.entries(SLOT_META)
      .map(([slot, meta]) => {
        const item = equipment?.[slot];
        if (!item) {
          return `
            <div class="equipment-slot is-empty" data-slot="${slot}">
              <span class="slot-icon" aria-hidden="true">${meta.icon}</span>
              <span><small>${meta.label}</small><strong>未装备</strong></span>
            </div>`;
        }
        return `
          <div class="equipment-slot rarity-${rarityKey(item.rarity)}" data-slot="${slot}">
            <span class="slot-icon" aria-hidden="true">${escapeHtml(item.icon || meta.icon)}</span>
            <span><small>${meta.label}</small><strong>${escapeHtml(item.name)}</strong></span>
            <span class="equipment-slot-actions">
              <button class="icon-button" type="button" data-unequip-slot="${slot}" aria-label="卸下${escapeHtml(item.name)}" title="卸下">↧</button>
              <button class="icon-button" type="button" data-reforge-id="${escapeHtml(item.id)}" data-reforge-location="equipment" data-reforge-slot="${slot}" aria-label="重铸${escapeHtml(item.name)}" title="重铸词条">⚒</button>
            </span>
          </div>`;
      })
      .join("");
  }

  renderFloors(floors = [], selectedFloorId) {
    if (!this.dom.floorList) return;
    this.dom.floorList.innerHTML = floors
      .map((floor) => {
        const id = floor.id ?? floor.floorId;
        const locked = floor.unlocked === false;
        const state = locked
          ? floor.lockedByPrestige ? "需转生" : "未解锁"
          : floor.cleared ? "已通过" : "可挑战";
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
                <small>推荐战力 ${formatNumber(floor.recommendedPower)}</small>
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
      ? "优势明显"
      : powerRatio >= 0.9 ? "势均力敌" : "凶险异常";
    this.dom.floorPreview.innerHTML = `
      <div class="preview-topline">
        <span class="danger-tag">${floor.isBoss ? "首领层" : danger}</span>
        <span class="recommended-power">推荐战力 <strong>${formatNumber(floor.recommendedPower)}</strong></span>
      </div>
      <div class="floor-emblem" aria-hidden="true">${escapeHtml(floor.icon || floor.emoji || (floor.isBoss ? "👑" : "🚪"))}</div>
      <div class="preview-copy">
        <p class="panel-kicker">当前选择</p>
        <h3 id="floor-preview-title">第 ${id} 层 · ${escapeHtml(floor.name || "无名地窟")}</h3>
        <p>${escapeHtml(floor.description || "黑暗中传来兵刃划过石壁的声响。")}</p>
      </div>
      <dl class="preview-details">
        <div><dt>敌群</dt><dd>${escapeHtml(floor.enemyCountText || (floor.isBoss ? "1 名首领" : "3–5 名"))}</dd></div>
        <div><dt>金币</dt><dd>${escapeHtml(floor.goldText || "未知")}</dd></div>
        <div><dt>掉落</dt><dd class="rarity-${rarityKey(floor.minRarity || "normal")}">${escapeHtml(floor.dropText || "普通+")}</dd></div>
      </dl>
      <button class="primary-button enter-button" type="button" data-enter-floor ${floor.unlocked === false ? "disabled" : ""}>
        <span aria-hidden="true">⚔</span>
        ${floor.unlocked === false ? "尚未解锁" : "进入地牢"}
      </button>`;
  }

  renderInventory(items = [], equipment = {}, limit = 24) {
    if (!this.dom.inventory) return;
    this.lastInventoryRender = { items, equipment, limit };
    const equippedBySlot = equipment || {};
    const visible = this.applyInventoryView(items);
    this.dom.inventory.innerHTML = items.length > 0 && visible.length === 0
      ? `<div class="empty-state inventory-filter-empty"><span aria-hidden="true">🔍</span><strong>该分类暂无装备</strong><p>换一个筛选条件试试。</p></div>`
      : visible.map((item) => renderInventoryItem(item, equippedBySlot[item.slot])).join("");
    if (this.dom.inventoryEmpty) this.dom.inventoryEmpty.hidden = items.length > 0;
    setText(this.dom.inventoryCount, `${items.length}`);
    setText(this.dom.inventoryLimit, `${limit}`);
    const capacity = this.dom.inventoryCount?.parentElement;
    if (capacity) capacity.setAttribute("aria-label", `背包容量 ${items.length} / ${limit}`);
    this.syncInventoryControls();
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
    if (filter) this.inventoryFilter = ["weapon", "helmet", "armor", "accessory"].includes(filter) ? filter : "all";
    if (sort) this.inventorySort = ["power", "rarity", "level"].includes(sort) ? sort : "default";
    const last = this.lastInventoryRender;
    if (last) this.renderInventory(last.items, last.equipment, last.limit);
    else this.syncInventoryControls();
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
      ? stock.map((listing) => renderShopItem(listing, gold, equipment)).join("")
      : `<div class="empty-state shop-empty"><span aria-hidden="true">🏪</span><strong>本轮货架已售空</strong><p>继续远征，胜利后商队会定期补货。</p></div>`;
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

    setText(this.dom.worldMapLevel, world.worldLevel ?? model.worldLevel ?? 1);
    setText(
      this.dom.worldMapRegion,
      world.currentRegionName || regions.find((region) => region.unlocked)?.name || "—",
    );
    setText(
      this.dom.worldMapBlurb,
      scene === "map"
        ? "点击节点进入城镇补给、野外刷怪或地牢挑战。"
        : (currentNode?.description || "探索灰烬世界。"),
    );

    if (this.dom.worldMapBoard) {
      this.dom.worldMapBoard.innerHTML = regions.map((region) => renderWorldRegionCard(region)).join("");
    }

    if (currentNode?.type === "town" || scene === "town") {
      setText(this.dom.townTitle, currentNode?.name || "城镇");
      setText(this.dom.townDescription, currentNode?.description || "");
      setText(this.dom.townFlavor, currentNode?.flavor || "");
      if (this.dom.townEmblem) {
        this.dom.townEmblem.textContent = currentNode?.emoji || "🏰";
      }
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

  activateInventoryTab(name) {
    const selected = name === "shop" ? "shop" : "inventory";
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
    setText(this.dom.heroBattleName, hero.name || "无名战士");
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
    setText(this.dom.battleCaption, outdoor ? `野外漫步 · 第 ${waveNumber} 波` : "自动战斗");
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
              <strong>${enemy.isBoss ? `<span class="unit-badge is-boss">首领</span>` : enemy.isElite ? `<span class="unit-badge is-elite">精英</span>` : ""}${escapeHtml(enemy.name)}</strong>
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
    item.textContent = entry?.message ?? entry?.text ?? String(entry ?? "");
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
    for (const target of entry.targets) {
      if (!target?.id || entry.actionType === "summon") continue;
      if (target.dodged) {
        this.floatOverUnit(target, "闪避", "is-dodge");
      } else {
        this.floatOverUnit(target, `-${formatNumber(target.damage)}`, target.critical ? "is-crit" : "", true);
      }
    }
  }

  floatOverUnit(unit, text, extraClass = "", flash = false) {
    const card = this.findUnitCard(unit);
    if (!card) return;
    if (flash) {
      card.classList.remove("is-hit");
      // 重新触发受击动画需要强制一次 reflow。
      void card.offsetWidth;
      card.classList.add("is-hit");
      setTimeout(() => card.classList.remove("is-hit"), 320);
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
      "[data-allocate-stat], [data-unequip-slot], [data-equip-id], [data-sell-id], [data-reforge-id], [data-upgrade-skill], [data-reset-skills], [data-prestige], [data-character-manage], [data-class-change], [data-shop-refresh], [data-buy-listing], [data-world-node], [data-world-back], [data-town-shop], [data-town-inventory], [data-town-characters], [data-start-outdoor]",
    )) {
      button.disabled = disabled;
    }
  }

  showResult(result) {
    this.lastResult = result;
    if (!this.dom.resultContent || !this.dom.resultDialog) return;
    setText(this.dom.resultKicker, "远征结算");
    setText(this.dom.resultTitle, "战斗结果");
    setText(this.dom.resultReturn, result.outdoor === true ? "返回野外" : "返回地牢");
    if (this.dom.resultAgain) {
      const canRepeat = result.canRepeat === true;
      this.dom.resultAgain.hidden = !canRepeat;
      if (canRepeat) {
        const advances = result.victory && result.nextFloorId
          && result.nextFloorId !== result.floorId;
        setText(this.dom.resultAgain, advances ? `⚔ 挑战第 ${result.nextFloorId} 层` : "⚔ 再战本层");
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
          <div><span>经验</span><strong>+${formatNumber(result.experience)}</strong></div>
          <div><span>金币</span><strong>+${formatNumber(result.gold)}</strong></div>
        </div>
        ${result.levelsGained ? `<p class="level-up-callout">✦ 等级提升至 Lv.${result.level}${result.skillPointsGained ? `，技能点 +${result.skillPointsGained}` : ""}</p>` : result.skillPointsGained ? `<p class="level-up-callout">✦ 技能点 +${result.skillPointsGained}</p>` : ""}
        ${lootItems.length > 0 ? `<section class="loot-result"><h3>获得装备${lootItems.length > 1 ? `（${lootItems.length} 件）` : ""}</h3>${lootItems.map((item) => renderResultLoot(item, previousEquipment[item.slot] ?? result.equippedItem)).join("")}</section>` : ""}
        ${salvagedItems.length > 0 ? `<p class="salvage-note">💰 背包已满，${salvagedItems.map((item) => escapeHtml(item.name)).join("、")} 已自动分解为 ${formatNumber(result.salvageGold)} 枚金币。</p>` : ""}`
      : `
        <div class="result-rewards is-defeat" aria-label="${retreated ? "撤退损失" : "战败损失"}">
          <div><span>损失经验</span><strong>-${formatNumber(result.experienceLost)}</strong></div>
          <div><span>损失金币</span><strong>-${formatNumber(result.goldLost)}</strong></div>
        </div>
        <p class="defeat-note">${retreated ? "你及时脱离了战场。" : "你被拖回了营地。"}角色和装备都得以保留，可以整备后再次挑战。</p>`;

    this.dom.resultContent.innerHTML = `
      <div class="result-banner ${result.victory ? "is-victory" : retreated ? "is-retreat" : "is-defeat"}">
        <span aria-hidden="true">${result.victory ? "🏆" : retreated ? "↩" : "☠️"}</span>
        <div><strong>${result.victory ? "清剿完成" : retreated ? "已撤退" : "远征失利"}</strong><p>${escapeHtml(result.summary || "")}</p></div>
      </div>
      ${result.saveFailed ? `<p class="save-error-note" role="alert">进度暂时无法写入浏览器存储，请检查存储权限后再继续。</p>` : ""}
      ${rewardMarkup}
      ${renderBattleReport(result.statistics)}`;
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
      <p class="outdoor-settlement-note">装备收入背包 ${formatNumber(stored)} 件${salvaged ? `，${formatNumber(salvaged)} 件已分解为金币` : ""}${result.materialCount ? `；材料 ${formatNumber(result.materialCount)} 件` : ""}。</p>
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
    this.dom.toast.textContent = message;
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
    worldMapBoard: hook("world-map-board"),
    worldMapLevel: hook("world-map-level"),
    worldMapRegion: hook("world-map-region"),
    worldMapBlurb: hook("world-map-blurb"),
    townView: hook("town-view"),
    townTitle: hook("town-title"),
    townDescription: hook("town-description"),
    townFlavor: hook("town-flavor"),
    townEmblem: hook("town-emblem"),
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
    inventoryEmpty: hook("inventory-empty"),
    inventoryCount: hook("inventory-count"),
    inventoryLimit: hook("inventory-limit"),
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

function renderInventoryItem(item, equippedItem) {
  const meta = SLOT_META[item.slot] || { label: "装备", icon: "◆" };
  const comparison = compareStats(item, equippedItem);
  const stats = comparison.length > 0
    ? comparison.map(({ key, value, delta }) => {
      const deltaMarkup = delta === 0
        ? ""
        : `<span class="${delta > 0 ? "comparison-up" : "comparison-down"}">${delta > 0 ? "↑" : "↓"}${formatStatValue(key, Math.abs(delta))}</span>`;
      return `<span>${STAT_META[key]?.label || escapeHtml(key)} +${formatStatValue(key, value)} ${deltaMarkup}</span>`;
    }).join("")
    : "<span>无额外属性</span>";
  const effectMarkup = renderEffect(item.effect);
  const locked = item.locked === true;
  return `
    <article class="inventory-item rarity-${rarityKey(item.rarity)} ${locked ? "is-locked" : ""} ${item.upgradeDelta > 0 ? "is-upgrade" : ""}">
      <div class="inventory-item-header">
        <span class="slot-icon" aria-hidden="true">${escapeHtml(item.icon || meta.icon)}</span>
        <span class="inventory-item-name">
          <strong>${escapeHtml(item.name)}${item.upgradeDelta > 0 ? ` <span class="upgrade-badge" title="装备后战力提升">⬆ 升级 +${formatNumber(item.upgradeDelta)}</span>` : ""}</strong>
          <small>${RARITY_LABELS[rarityKey(item.rarity)] || "普通"} · ${meta.label} · Lv.${numberOr(item.level, 1)}</small>
        </span>
        <button class="icon-button lock-button ${locked ? "is-locked" : ""}" type="button" data-lock-id="${escapeHtml(item.id)}" aria-label="${locked ? "解锁" : "锁定"}${escapeHtml(item.name)}" title="${locked ? "解锁(允许出售)" : "锁定(防止出售)"}">${locked ? "🔒" : "🔓"}</button>
        <span class="item-power">✦ ${formatNumber(item.power)}</span>
      </div>
      <p class="item-stats">${stats}</p>
      ${renderAffixQuality(item)}
      ${effectMarkup}
      <div class="item-actions">
        <button class="secondary-button equip-button" type="button" data-equip-id="${escapeHtml(item.id)}">
          ${equippedItem ? "替换装备" : "装备"}
        </button>
        <button class="secondary-button reforge-button" type="button" data-reforge-id="${escapeHtml(item.id)}" data-reforge-location="inventory">
          重铸 ${formatNumber(getReforgeCost(item))}
        </button>
        <button class="secondary-button sell-button" type="button" data-sell-id="${escapeHtml(item.id)}" ${locked ? "disabled title=\"已锁定,无法出售\"" : ""}>
          出售 ${formatNumber(getSellValue(item))}
        </button>
      </div>
    </article>`;
}

/** Per-affix roll-quality chips: how close each roll is to its level ceiling. */
function renderAffixQuality(item) {
  const affixes = Array.isArray(item?.affixes) ? item.affixes : [];
  if (affixes.length === 0) return "";
  const chips = affixes.map((affix) => {
    const quality = getAffixRollQuality(affix, item.level);
    if (!quality) return "";
    const tier = quality.percent >= 80 ? "q-high" : quality.percent >= 40 ? "q-mid" : "q-low";
    return `<span class="affix-chip ${tier}" title="${escapeHtml(affix.name || affix.id)}:本词条区间的 ${quality.percent}% 位">${escapeHtml(affix.name || affix.id)} ${quality.percent}%</span>`;
  }).join("");
  return chips ? `<p class="item-affix-quality" aria-label="词条成色">${chips}</p>` : "";
}

function renderShopItem(listing, gold, equipment = {}) {
  const item = listing?.item;
  if (!item) return "";
  const meta = SLOT_META[item.slot] || { label: "装备", icon: "◆" };
  const price = getShopPrice(item);
  // 与身上同部位装备对比(↑绿↓红),买前一眼看出值不值。
  const comparison = compareStats(item, equipment?.[item.slot]);
  const statMarkup = comparison.length > 0
    ? comparison.slice(0, 6).map(({ key, value, delta }) => {
      const deltaMarkup = delta === 0
        ? ""
        : `<span class="${delta > 0 ? "comparison-up" : "comparison-down"}">${delta > 0 ? "↑" : "↓"}${formatStatValue(key, Math.abs(delta))}</span>`;
      return `<span>${STAT_META[key]?.label || escapeHtml(key)} +${formatStatValue(key, value)} ${deltaMarkup}</span>`;
    }).join("")
    : "<span>无额外属性</span>";
  return `
    <article class="shop-item rarity-${rarityKey(item.rarity)}">
      <div class="inventory-item-header">
        <span class="slot-icon" aria-hidden="true">${escapeHtml(item.emoji || meta.icon)}</span>
        <span class="inventory-item-name"><strong>${escapeHtml(item.name)}</strong><small>${meta.label} · Lv.${numberOr(item.level, 1)}</small></span>
        <span class="item-power">✦ ${formatNumber(item.power)}</span>
      </div>
      <p class="item-stats">${statMarkup}</p>
      ${renderEffect(item.effect)}
      <button class="secondary-button shop-buy-button" type="button" data-buy-listing="${escapeHtml(listing.listingId)}" ${numberOr(gold, 0) < price ? "disabled" : ""}>
        ◈ ${formatNumber(price)}
      </button>
    </article>`;
}

function renderWorldRegionCard(region) {
  const unlocked = region.unlocked === true;
  const nodes = Array.isArray(region.nodes) ? region.nodes : [];
  const range = Array.isArray(region.worldLevelRange)
    ? region.worldLevelRange
    : null;
  const rangeText = range
    ? `世界 ${range[0]}–${range[1] ?? range[0]}`
    : (region.theme || "");
  const nodeMarkup = unlocked && nodes.length > 0
    ? `<div class="world-node-grid">${nodes.map((node) => {
      const typeLabel = node.type === "town"
        ? "城镇"
        : node.type === "outdoor"
          ? "野外"
          : node.type === "dungeon"
            ? "副本"
            : "节点";
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
        ? "此区域暂无节点"
        : (region.unlockHint || "尚未解锁"),
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

function renderResultLoot(item, equippedItem) {
  const comparison = compareStats(item, equippedItem);
  return `
    <article class="result-loot-card rarity-${rarityKey(item.rarity)}">
      <span class="result-loot-icon" aria-hidden="true">${escapeHtml(item.icon || SLOT_META[item.slot]?.icon || "💎")}</span>
      <div>
        <span class="rarity-${rarityKey(item.rarity)}">${RARITY_LABELS[rarityKey(item.rarity)]}</span>
        <h4>${escapeHtml(item.name)}</h4>
        <p>${comparison.map(({ key, value, delta }) => {
          const deltaText = delta === 0 ? "" : ` ${delta > 0 ? "↑" : "↓"}${formatStatValue(key, Math.abs(delta))}`;
          const deltaClass = delta > 0 ? "comparison-up" : delta < 0 ? "comparison-down" : "";
          return `<span>${escapeHtml(STAT_META[key]?.label || key)} +${formatStatValue(key, value)} <b class="${deltaClass}">${deltaText}</b></span>`;
        }).join(" · ")}</p>
        ${renderEffect(item.effect)}
      </div>
      <button class="primary-button" type="button" data-equip-id="${escapeHtml(item.id)}">立即装备</button>
    </article>`;
}

function renderEffect(effect) {
  if (!effect) return "";
  const label = effect.name || effect.id || "特殊效果";
  const description = effect.description || "传说特效，会在战斗中自动触发。";
  return `<p class="item-effect">🔥 ${escapeHtml(label)}：${escapeHtml(description)}</p>`;
}

/** Compact end-of-battle report; rows with zero value are hidden. */
function renderBattleReport(statistics) {
  if (!statistics) return "";
  const skillHealing = Math.max(
    0,
    numberOr(statistics.playerHealing, 0) - numberOr(statistics.lifestealHealing, 0),
  );
  const rows = [
    ["造成伤害", statistics.playerDamageDealt],
    ["召唤物伤害", statistics.minionDamageDealt],
    ["承受伤害", statistics.playerDamageTaken],
    ["最大一击", statistics.playerMaxHit],
    ["暴击次数", statistics.playerCriticalHits],
    ["闪避次数", statistics.playerDodges],
    ["技能治疗", skillHealing],
    ["吸血回复", statistics.lifestealHealing],
    ["燃烧伤害", statistics.burnDamage],
    ["荆棘反伤", statistics.thornsDamage],
    ["连击触发", statistics.extraStrikes],
    ["召唤 / 折损", statistics.minionsSummoned > 0
      ? `${formatNumber(statistics.minionsSummoned)} / ${formatNumber(statistics.minionsLost)}`
      : 0],
  ].filter(([, value]) => typeof value === "string" || numberOr(value, 0) > 0);
  if (rows.length === 0) return "";
  return `
    <section class="battle-report" aria-label="战报统计">
      <h3>战报 · ${formatNumber(statistics.rounds)} 回合</h3>
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

function renderAttribute(element, stat, value) {
  if (!element) return;
  element.innerHTML = `<span>${formatNumber(value)}</span><button class="stat-add-button" type="button"
    data-allocate-stat="${stat}" aria-label="增加${STAT_META[stat]?.label || stat}" title="加 1 点">+</button>`;
}

function formatStatValue(key, value) {
  if (STAT_META[key]?.percent) return `${Math.round(value * 100)}%`;
  return formatNumber(value);
}

function formatNumber(value) {
  return Math.round(numberOr(value, 0)).toLocaleString("zh-CN");
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

function numberOr(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
