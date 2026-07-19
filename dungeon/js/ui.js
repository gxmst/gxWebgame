import { getReforgeCost, getSellValue, getShopPrice } from "./economy.js";

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
    this.dom = collectDom();
    this.bindEvents();
  }

  bindEvents() {
    document.addEventListener("click", (event) => {
      const classCancel = event.target.closest('[data-class-dialog] button[value="cancel"]');
      if (classCancel && this.dom.classDialog?.dataset.required === "true") {
        event.preventDefault();
        this.showToast("需要先确认一个职业。", "error");
        return;
      }

      const inventoryTab = event.target.closest("[data-inventory-tab]");
      if (inventoryTab) {
        this.activateInventoryTab(inventoryTab.dataset.inventoryTab);
        return;
      }

      const classOption = event.target.closest("[data-class-id]");
      if (classOption) {
        this.selectClassOption(classOption.dataset.classId);
        return;
      }

      if (event.target.closest("[data-class-confirm]")) {
        this.handlers.selectClass?.(this.selectedClassId || "warrior");
        return;
      }

      if (event.target.closest("[data-class-change]")) {
        this.handlers.changeClass?.();
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

    for (const closeButton of document.querySelectorAll("[data-result-close]")) {
      closeButton.addEventListener("click", () => this.closeResult());
    }

    this.dom.resultDialog?.addEventListener("cancel", () => this.closeResult());

    this.dom.classDialog?.addEventListener("cancel", (event) => {
      if (this.handlers.selectClass && this.dom.classDialog.dataset.required === "true") {
        event.preventDefault();
        return;
      }
      this.closeClassSelection();
    });
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
    this.renderCharacter(model.character);
    this.renderEquipment(model.character.equipment);
    this.renderFloors(model.floors, model.selectedFloorId);
    this.renderFloorPreview(model.selectedFloor, model.character.power);
    this.renderInventory(
      model.character.inventory,
      model.character.equipment,
      model.inventoryLimit,
    );
    this.renderShop(model.economy?.shop, model.character.gold);
    const pendingReforge = Boolean(model.economy?.pendingReforge);
    for (const button of document.querySelectorAll("[data-equip-id], [data-sell-id], [data-unequip-slot], [data-reforge-id]")) {
      button.disabled = pendingReforge;
    }
  }

  renderHeader(model) {
    setText(this.dom.coins, formatNumber(model.character.gold));
    setText(this.dom.maxFloor, model.highestUnlockedFloor);
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
      const typeLabel = skill.type === "aoe" ? "群体" : skill.type === "guard" ? "自保" : "单体";
      const next = skill.nextLevel;
      const cooldownPreview = next && next.cooldown !== skill.cooldown
        ? `${skill.cooldown}→${next.cooldown}`
        : `${skill.cooldown}`;
      const effect = skill.type === "guard"
        ? `减伤 ${Math.round((skill.reduction ?? 0) * 100)}%${next ? `→${Math.round((next.reduction ?? 0) * 100)}%` : ""} · 冷却 ${cooldownPreview}`
        : `倍率 ${Number(skill.multiplier ?? 1).toFixed(2)}${next ? `→${Number(next.multiplier ?? 1).toFixed(2)}` : ""} · 冷却 ${cooldownPreview}`;
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
    const equippedBySlot = equipment || {};
    this.dom.inventory.innerHTML = items
      .map((item) => renderInventoryItem(item, equippedBySlot[item.slot]))
      .join("");
    if (this.dom.inventoryEmpty) this.dom.inventoryEmpty.hidden = items.length > 0;
    setText(this.dom.inventoryCount, `${items.length}`);
    setText(this.dom.inventoryLimit, `${limit}`);
    const capacity = this.dom.inventoryCount?.parentElement;
    if (capacity) capacity.setAttribute("aria-label", `背包容量 ${items.length} / ${limit}`);
  }

  renderShop(shop = {}, gold = 0) {
    if (!this.dom.shop) return;
    const stock = Array.isArray(shop?.stock) ? shop.stock : [];
    this.dom.shop.innerHTML = stock.length > 0
      ? stock.map((listing) => renderShopItem(listing, gold)).join("")
      : `<div class="empty-state shop-empty"><span aria-hidden="true">🏪</span><strong>本轮货架已售空</strong><p>继续远征，胜利后商队会定期补货。</p></div>`;
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
    this.dom.classDialog.dataset.required = String(hero.classChosen !== true);
    this.selectClassOption(hero.classId || model.classes?.[0]?.id || "warrior");
    if (typeof this.dom.classDialog.showModal === "function") {
      if (!this.dom.classDialog.open) this.dom.classDialog.showModal();
    } else {
      this.dom.classDialog.setAttribute("open", "");
    }
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
    this.dom.classDialog.dataset.required = "false";
    if (this.dom.classDialog.open && typeof this.dom.classDialog.close === "function") {
      this.dom.classDialog.close();
    } else {
      this.dom.classDialog.removeAttribute("open");
    }
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

  showBattle({ hero, classMeta, stats, enemies, floor, speed }) {
    this.dom.idleView.hidden = true;
    this.dom.battleView.hidden = false;
    setText(this.dom.heroBattleName, hero.name || "无名战士");
    const portrait = document.querySelector(".hero-combatant .combatant-portrait");
    if (portrait) portrait.textContent = classMeta?.emoji || "⚔️";
    setText(this.dom.battleRound, 1);
    setMeter(this.dom.heroHpFill, 1, this.dom.heroHpFill?.parentElement);
    setText(this.dom.heroHpText, `${formatNumber(stats.maxHp)} / ${formatNumber(stats.maxHp)}`);
    this.dom.log?.replaceChildren();
    this.setCharacterControlsDisabled(true);
    this.setStatus(`第 ${floor.id ?? floor.floorId} 层 · 战斗中`, true);
    this.updateSpeed(speed);
    this.setBattleControlsDisabled(false);

    if (this.dom.enemies) {
      this.dom.enemies.innerHTML = enemies.map((enemy) => `
        <article class="enemy-combatant" data-enemy-id="${escapeHtml(enemy.id)}">
          <span class="enemy-portrait" aria-hidden="true">${escapeHtml(enemy.icon || "💀")}</span>
          <div>
            <div class="enemy-name-row">
              <strong>${escapeHtml(enemy.name)}</strong>
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

  appendBattleLog(entry) {
    if (!this.dom.log) return;
    const item = document.createElement("li");
    item.dataset.logType = logType(entry);
    item.textContent = entry?.message ?? entry?.text ?? String(entry ?? "");
    this.dom.log.append(item);
    if (this.dom.log.children.length > 160) this.dom.log.firstElementChild?.remove();
    this.dom.log.scrollTop = this.dom.log.scrollHeight;
    if (Number.isFinite(entry?.round)) setText(this.dom.battleRound, entry.round);
  }

  finishBattle(victory, retreat = false) {
    this.setBattleControlsDisabled(true);
    this.setCharacterControlsDisabled(false);
    this.setStatus(retreat ? "已撤退" : victory ? "远征胜利" : "远征失败", false);
  }

  returnToDungeon() {
    this.dom.battleView.hidden = true;
    this.dom.idleView.hidden = false;
    this.setCharacterControlsDisabled(false);
    this.activatePanel("dungeon");
    this.setStatus("等待出发", false);
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
  }

  setCharacterControlsDisabled(disabled) {
    if (this.dom.autoAllocate) this.dom.autoAllocate.disabled = disabled;
    for (const button of document.querySelectorAll(
      "[data-allocate-stat], [data-unequip-slot], [data-equip-id], [data-sell-id], [data-reforge-id], [data-upgrade-skill], [data-reset-skills], [data-prestige], [data-class-change], [data-shop-refresh], [data-buy-listing]",
    )) {
      button.disabled = disabled;
    }
  }

  showResult(result) {
    this.lastResult = result;
    if (!this.dom.resultContent || !this.dom.resultDialog) return;
    const retreated = result.retreat === true;
    const rewardMarkup = result.victory
      ? `
        <div class="result-rewards" aria-label="战斗收益">
          <div><span>经验</span><strong>+${formatNumber(result.experience)}</strong></div>
          <div><span>金币</span><strong>+${formatNumber(result.gold)}</strong></div>
        </div>
        ${result.levelsGained ? `<p class="level-up-callout">✦ 等级提升至 Lv.${result.level}${result.skillPointsGained ? `，技能点 +${result.skillPointsGained}` : ""}</p>` : result.skillPointsGained ? `<p class="level-up-callout">✦ 技能点 +${result.skillPointsGained}</p>` : ""}
        ${result.loot ? `<section class="loot-result"><h3>获得装备</h3>${renderResultLoot(result.loot, result.equippedItem)}</section>` : ""}
        ${result.salvagedItem ? `<p class="salvage-note">💰 背包已满，${escapeHtml(result.salvagedItem.name)} 已自动分解为 ${formatNumber(result.salvageGold)} 枚金币。</p>` : ""}`
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
      ${rewardMarkup}`;
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
    reforgeDialog: hook("reforge-dialog"),
    reforgeContent: hook("reforge-content"),
    reforgeClose: hook("reforge-close"),
    resultDialog: hook("result-dialog"),
    resultContent: hook("result-content"),
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
  return `
    <article class="inventory-item rarity-${rarityKey(item.rarity)}">
      <div class="inventory-item-header">
        <span class="slot-icon" aria-hidden="true">${escapeHtml(item.icon || meta.icon)}</span>
        <span class="inventory-item-name">
          <strong>${escapeHtml(item.name)}</strong>
          <small>${RARITY_LABELS[rarityKey(item.rarity)] || "普通"} · ${meta.label} · Lv.${numberOr(item.level, 1)}</small>
        </span>
        <span class="item-power">✦ ${formatNumber(item.power)}</span>
      </div>
      <p class="item-stats">${stats}</p>
      ${effectMarkup}
      <div class="item-actions">
        <button class="secondary-button equip-button" type="button" data-equip-id="${escapeHtml(item.id)}">
          ${equippedItem ? "替换装备" : "装备"}
        </button>
        <button class="secondary-button reforge-button" type="button" data-reforge-id="${escapeHtml(item.id)}" data-reforge-location="inventory">
          重铸 ${formatNumber(getReforgeCost(item))}
        </button>
        <button class="secondary-button sell-button" type="button" data-sell-id="${escapeHtml(item.id)}">
          出售 ${formatNumber(getSellValue(item))}
        </button>
      </div>
    </article>`;
}

function renderShopItem(listing, gold) {
  const item = listing?.item;
  if (!item) return "";
  const meta = SLOT_META[item.slot] || { label: "装备", icon: "◆" };
  const price = getShopPrice(item);
  const stats = readItemStats(item);
  const statMarkup = Object.entries(stats)
    .filter(([, value]) => Number.isFinite(value) && value !== 0)
    .slice(0, 5)
    .map(([key, value]) => `<span>${escapeHtml(STAT_META[key]?.label || key)} +${formatStatValue(key, value)}</span>`)
    .join("") || "<span>无额外属性</span>";
  return `
    <article class="shop-item rarity-${rarityKey(item.rarity)}">
      <div class="inventory-item-header">
        <span class="slot-icon" aria-hidden="true">${escapeHtml(item.emoji || meta.icon)}</span>
        <span class="inventory-item-name"><strong>${escapeHtml(item.name)}</strong><small>${meta.label} · Lv.${numberOr(item.level, 1)}</small></span>
        <span class="item-power">✦ ${formatNumber(item.power)}</span>
      </div>
      <p class="item-stats">${statMarkup}</p>
      <button class="secondary-button shop-buy-button" type="button" data-buy-listing="${escapeHtml(listing.listingId)}" ${numberOr(gold, 0) < price ? "disabled" : ""}>
        ◈ ${formatNumber(price)}
      </button>
    </article>`;
}

function renderReforgeColumn(label, item, tone) {
  const affixes = Array.isArray(item.affixes) && item.affixes.length
    ? item.affixes.map((affix) => `<li>${escapeHtml(affix.name || affix.id)} <strong>+${formatStatValue(affix.stat, affix.value)}</strong></li>`).join("")
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
  const description = effect.description || "特殊效果将在后续战斗扩展中生效。";
  return `<p class="item-effect">🔥 ${escapeHtml(label)}：${escapeHtml(description)}</p>`;
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
    return ["aoe", "guard", "heal"].includes(entry.actionType) ? "skill" : "damage";
  }
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
