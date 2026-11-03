(function bootstrapPromptArena() {
  "use strict";

  const data = window.GAME_DATA;
  const gameApi = window.BattleGame;

  if (!data || !gameApi) {
    document.body.innerHTML =
      '<p style="padding:32px;color:#ff7181;font-family:monospace">' +
      "游戏脚本加载失败，请确认 data.js、game.js、main.js 位于同一目录。" +
      "</p>";
    return;
  }

  const PROMPT_ACCENTS = {
    hothead: "#ff6f61",
    long_context: "#53d8ff",
    no_fluff: "#ffbd59",
    hallucination: "#bda1ff",
    code_refactor: "#54e5b1",
    security_audit: "#78f4d4",
    vram_overflow: "#d690ff",
  };

  const elements = {
    screens: Array.from(document.querySelectorAll(".screen")),
    modePve: document.querySelector("#btn-mode-pve"),
    backMode: document.querySelector("#btn-back-mode"),
    selectEyebrow: document.querySelector("#select-eyebrow"),
    selectTitle: document.querySelector("#select-title"),
    selectDescription: document.querySelector("#select-description"),
    selectSectionTitle: document.querySelector("#select-section-title"),
    characterGrid: document.querySelector("#character-grid"),
    equipEyebrow: document.querySelector("#equip-eyebrow"),
    equipTitle: document.querySelector("#equip-title"),
    selectedUnitLabel: document.querySelector("#selected-unit-label"),
    selectedCharacter: document.querySelector("#selected-character"),
    promptGrid: document.querySelector("#prompt-grid"),
    activeBonds: document.querySelector("#active-bonds"),
    promptCount: document.querySelector("#prompt-count"),
    loadoutHint: document.querySelector("#loadout-hint"),
    startBattleLabel: document.querySelector("#start-battle-label"),
    startBattle: document.querySelector("#btn-start-battle"),
    backSelect: document.querySelector("#btn-back-select"),
    roundValue: document.querySelector("#round-value"),
    arenaRound: document.querySelector("#arena-round strong"),
    turnPhaseLabel: document.querySelector("#turn-phase-label strong"),
    battleStatus: document.querySelector("#battle-status-text"),
    playerPanel: document.querySelector("#player-panel"),
    enemyPanel: document.querySelector("#enemy-panel"),
    settingsButton: document.querySelector("#btn-settings"),
    settingsModal: document.querySelector("#settings-modal"),
    closeSettingsTop: document.querySelector("#btn-close-settings-top"),
    closeSettings: document.querySelector("#btn-close-settings"),
    restartMatch: document.querySelector("#btn-restart-match"),
    returnMenu: document.querySelector("#btn-return-menu"),
    apiKeyInput: document.querySelector("#deepseek-api-key"),
    saveApiKey: document.querySelector("#btn-save-api-key"),
    apiKeyStatus: document.querySelector("#api-key-status"),
    globalEventBanner: document.querySelector("#global-event-banner"),
    globalEventTitle: document.querySelector("#global-event-title"),
    globalEventDescription: document.querySelector(
      "#global-event-description",
    ),
    refreshOverlay: document.querySelector("#prompt-refresh-overlay"),
    refreshRound: document.querySelector("#refresh-round"),
    refreshEventName: document.querySelector("#refresh-event-name"),
    refreshEventDescription: document.querySelector(
      "#refresh-event-description",
    ),
    refreshOfferGrid: document.querySelector("#refresh-offer-grid"),
    refreshCurrentList: document.querySelector("#refresh-current-list"),
    refreshHint: document.querySelector("#refresh-hint"),
    skipRefresh: document.querySelector("#btn-skip-refresh"),
    basicAttack: document.querySelector("#btn-basic-attack"),
    skillButtons: document.querySelector("#skill-buttons"),
    actionDockTitle: document.querySelector("#action-dock-title"),
    actionDockHint: document.querySelector("#action-dock-hint"),
    currentEnergy: document.querySelector("#current-energy"),
    battleLog: document.querySelector("#battle-log"),
    clearLog: document.querySelector("#btn-clear-log"),
    gameoverOverlay: document.querySelector("#screen-gameover"),
    gameoverCard: document.querySelector("#gameover-card"),
    gameoverTitle: document.querySelector("#gameover-title"),
    gameoverTitleEn: document.querySelector(".gameover-title-en"),
    gameoverTitleCn: document.querySelector("#gameover-title-cn"),
    gameoverSubtitle: document.querySelector("#gameover-subtitle"),
    gameoverRounds: document.querySelector("#gameover-rounds"),
    gameoverTotalDamage: document.querySelector("#gameover-total-damage"),
    gameoverEnemyDamage: document.querySelector("#gameover-enemy-damage"),
    gameoverPlayerAvatar: document.querySelector("#gameover-player-avatar"),
    gameoverPlayerName: document.querySelector("#gameover-player-name"),
    gameoverPlayerHp: document.querySelector("#gameover-player-hp"),
    gameoverEnemyAvatar: document.querySelector("#gameover-enemy-avatar"),
    gameoverEnemyName: document.querySelector("#gameover-enemy-name"),
    gameoverEnemyHp: document.querySelector("#gameover-enemy-hp"),
    gameoverPlayerPrompts: document.querySelector(
      "#gameover-player-prompts",
    ),
    gameoverReplay: document.querySelector("#btn-gameover-replay"),
    gameoverLobby: document.querySelector("#btn-gameover-lobby"),
    playerTrashTalk: document.querySelector("#player-trash-talk"),
    enemyTrashTalk: document.querySelector("#enemy-trash-talk"),
  };

  const fighters = {
    player: elements.playerPanel,
    enemy: elements.enemyPanel,
  };

  let game = null;
  let latestState = null;
  let battleUiReady = false;
  let currentBattle = null;
  let activeScreenId = null;
  let gameoverTimer = null;
  let gameoverGeneration = 0;
  const trashTalkPending = {
    player: false,
    enemy: false,
  };
  const trashTalkHideTimers = {
    player: null,
    enemy: null,
  };
  let trashTalkGeneration = 0;

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getCharacter(characterId) {
    return gameApi.getCharacter(characterId, data);
  }

  function getPrompt(promptId) {
    return gameApi.getPrompt(promptId, data);
  }

  function getInitials(name) {
    if (name === "DeepSeek") {
      return "DS";
    }
    return String(name).charAt(0).toUpperCase();
  }

  function showScreen(screenId) {
    if (activeScreenId === screenId) {
      return;
    }

    elements.screens.forEach(function toggleScreen(screen) {
      const isActive = screen.id === screenId;
      screen.classList.toggle("is-active", isActive);
      screen.setAttribute("aria-hidden", String(!isActive));
    });

    activeScreenId = screenId;
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function sideLabel(fighterId) {
    if (!latestState) {
      return fighterId === "player" ? "玩家" : "电脑";
    }
    return fighterId === "player"
      ? latestState.playerLabel
      : latestState.enemyLabel;
  }

  function getStoredApiKey() {
    try {
      return window.localStorage.getItem(
        gameApi.API_KEY_STORAGE_KEY,
      ) || "";
    } catch {
      return "";
    }
  }

  function setApiKeyStatus(message, saved = false) {
    elements.apiKeyStatus.textContent = message;
    elements.apiKeyStatus.classList.toggle("is-saved", saved);
  }

  function loadApiKey() {
    const apiKey = getStoredApiKey();
    elements.apiKeyInput.value = apiKey;
    if (apiKey) {
      setApiKeyStatus("Key 已保存在当前浏览器中。", true);
    }
  }

  function saveApiKey() {
    const apiKey = elements.apiKeyInput.value.trim();
    try {
      if (apiKey) {
        window.localStorage.setItem(
          gameApi.API_KEY_STORAGE_KEY,
          apiKey,
        );
        setApiKeyStatus(
          "已保存到当前浏览器的 localStorage。",
          true,
        );
      } else {
        window.localStorage.removeItem(gameApi.API_KEY_STORAGE_KEY);
        setApiKeyStatus(
          "已清除 Key。Key 仅保存在当前浏览器中。",
          false,
        );
      }
    } catch {
      setApiKeyStatus("浏览器禁止访问 localStorage，无法保存 Key。");
    }
  }

  function hideTrashTalk(fighterId) {
    const bubble =
      fighterId === "player"
        ? elements.playerTrashTalk
        : elements.enemyTrashTalk;
    bubble.classList.remove("is-visible");
    window.setTimeout(() => {
      bubble.hidden = true;
    }, 220);
  }

  function showTrashTalk(fighterId, text) {
    const bubble =
      fighterId === "player"
        ? elements.playerTrashTalk
        : elements.enemyTrashTalk;
    if (trashTalkHideTimers[fighterId]) {
      window.clearTimeout(trashTalkHideTimers[fighterId]);
    }

    bubble.textContent = text;
    bubble.hidden = false;
    void bubble.offsetWidth;
    bubble.classList.add("is-visible");
    trashTalkHideTimers[fighterId] = window.setTimeout(() => {
      hideTrashTalk(fighterId);
      trashTalkHideTimers[fighterId] = null;
    }, 3000);
  }

  function clearTrashTalkBubbles() {
    trashTalkGeneration += 1;
    [elements.playerTrashTalk, elements.enemyTrashTalk].forEach(
      function resetBubble(bubble) {
        bubble.classList.remove("is-visible");
        bubble.hidden = true;
        bubble.textContent = "";
      },
    );
  }

  async function requestTrashTalk(event) {
    const fighterId = event.speakerId;
    if (
      !latestState ||
      !latestState.battle ||
      trashTalkPending[fighterId]
    ) {
      return;
    }

    const apiKey = getStoredApiKey();
    if (!apiKey) {
      return;
    }

    trashTalkPending[fighterId] = true;
    const generation = trashTalkGeneration;
    try {
      const line = await gameApi.generateTrashTalk(
        event.speakerName,
        `${event.situation}，你的对手是${event.opponentName}`,
        { apiKey },
      );
      if (generation === trashTalkGeneration) {
        showTrashTalk(fighterId, line);
      }
    } catch (error) {
      setApiKeyStatus(
        "垃圾话请求失败：" +
          (error && error.message ? error.message : "未知错误"),
      );
    } finally {
      trashTalkPending[fighterId] = false;
    }
  }

  function openSettings() {
    elements.settingsModal.classList.add("is-visible");
    elements.settingsModal.setAttribute("aria-hidden", "false");
    window.setTimeout(function focusSettings() {
      elements.restartMatch.focus({ preventScroll: true });
    }, 60);
  }

  function closeSettings() {
    const wasOpen = elements.settingsModal.classList.contains("is-visible");
    elements.settingsModal.classList.remove("is-visible");
    elements.settingsModal.setAttribute("aria-hidden", "true");
    if (wasOpen) {
      elements.settingsButton.focus({ preventScroll: true });
    }
  }

  function renderCharacterCards() {
    elements.characterGrid.innerHTML = data.characters
      .map(function createCharacterMarkup(character, index) {
        const trait = character.trait;
        return `
          <button
            class="character-card"
            type="button"
            data-character-id="${escapeHtml(character.id)}"
            style="--card-accent: ${escapeHtml(character.accent)}"
            aria-label="选择 ${escapeHtml(character.name)}，${escapeHtml(character.role)}"
          >
            <span class="character-card__top">
              <span class="character-role">${escapeHtml(character.role)}</span>
              <span class="unit-index">UNIT_0${index + 1}</span>
            </span>
            <span class="character-avatar" aria-hidden="true">
              <img
                class="character-avatar__image"
                src="${escapeHtml(character.avatar)}"
                alt=""
                loading="lazy"
                onerror="this.hidden = true; this.parentElement.classList.add('is-avatar-missing')"
              />
              <span class="avatar-fallback">
                ${escapeHtml(getInitials(character.name))}
              </span>
            </span>
            <h3>${escapeHtml(character.name)}</h3>
            <p class="character-description">
              ${escapeHtml(character.description)}
            </p>
            <span class="stat-strip" aria-label="基础属性">
              <span><small>HP</small><strong>${character.hp}</strong></span>
              <span><small>ATK</small><strong>${character.atk}</strong></span>
              <span><small>DEF</small><strong>${character.def}</strong></span>
            </span>
            <span class="trait-copy">
              <strong>【${escapeHtml(trait.name)}】</strong>
              ${escapeHtml(trait.description)}
            </span>
            <span class="deploy-hint">
              <span>DEPLOY UNIT</span>
              <span aria-hidden="true">→</span>
            </span>
          </button>
        `;
      })
      .join("");
  }

  function renderSelectCopy() {
    elements.selectEyebrow.textContent =
      "AUTONOMOUS BATTLE PROTOCOL / 01";
    elements.selectTitle.innerHTML =
      "选择一个 AI <span>定义战场规则。</span>";
    elements.selectDescription.textContent =
      "每个模型拥有独立的战斗特性。选定你的核心，下一步再为它装载三项 Prompt。";
    elements.selectSectionTitle.textContent = "选择作战单元";
  }

  function renderEquipScreen(state) {
    const character = getCharacter(state.characterId);
    if (!character) {
      return;
    }

    elements.equipEyebrow.textContent = "PLAYER / LOADOUT CONFIGURATION";
    elements.equipTitle.textContent = "玩家 装载 Prompt";
    elements.selectedUnitLabel.textContent = "玩家 DEPLOYED CORE";
    elements.startBattleLabel.textContent = "开始战斗";

    elements.selectedCharacter.innerHTML = `
      <div class="selected-unit" style="--unit-accent: ${escapeHtml(character.accent)}">
        <div class="selected-unit__avatar" aria-hidden="true">
          <img
            src="${escapeHtml(character.avatar)}"
            alt=""
            onerror="this.hidden = true; this.parentElement.classList.add('is-avatar-missing')"
          />
          <span class="avatar-fallback">
            ${escapeHtml(getInitials(character.name))}
          </span>
        </div>
        <div>
          <h2>${escapeHtml(character.name)}</h2>
          <p class="selected-unit__role">${escapeHtml(character.role)} / CORE LOCKED</p>
        </div>
        <div class="selected-unit__stats">
          <div><span>HP</span><strong>${character.hp}</strong></div>
          <div><span>ATK</span><strong>${character.atk}</strong></div>
          <div><span>DEF</span><strong>${character.def}</strong></div>
        </div>
        <p class="selected-unit__trait">
          <strong>【${escapeHtml(character.trait.name)}】</strong>
          ${escapeHtml(character.trait.description)}
        </p>
      </div>
    `;

    const selectedIds = state.selectedPromptIds;
    const atCapacity = selectedIds.length >= data.rules.maxPromptSlots;

    elements.promptGrid.innerHTML = state.offeredPromptIds
      .map(function createPromptMarkup(promptId) {
        const prompt = getPrompt(promptId);
        if (!prompt) {
          return "";
        }

        const selectedIndex = selectedIds.indexOf(promptId);
        const isSelected = selectedIndex >= 0;
        const disabled = atCapacity && !isSelected;
        const accent = PROMPT_ACCENTS[prompt.id] || "#59ddff";
        const activeTag = prompt.active
          ? '<span class="prompt-active-tag">主动</span>'
          : "";

        return `
          <button
            class="prompt-card${isSelected ? " is-selected" : ""}"
            type="button"
            data-prompt-id="${escapeHtml(prompt.id)}"
            style="--prompt-accent: ${accent}"
            aria-pressed="${String(isSelected)}"
            ${disabled ? "disabled" : ""}
          >
            <span class="prompt-card__top">
              <span>${escapeHtml(prompt.category)} ${activeTag}</span>
              <span class="prompt-card__check" aria-hidden="true">
                ${isSelected ? selectedIndex + 1 : "+"}
              </span>
            </span>
            <h3>${escapeHtml(prompt.name)}</h3>
            <p>${escapeHtml(prompt.description)}</p>
          </button>
        `;
      })
      .join("");

    const activeBonds = (data.bonds || []).filter((bond) =>
      bond.requiredPromptIds.every((promptId) =>
        selectedIds.includes(promptId),
      ),
    );
    elements.activeBonds.classList.toggle(
      "is-active",
      activeBonds.length > 0,
    );
    elements.activeBonds.innerHTML = activeBonds.length
      ? activeBonds
          .map(
            (bond) => `
              <span>
                <strong>已激活：${escapeHtml(bond.name)}</strong>
                ${escapeHtml(bond.description)}
              </span>
            `,
          )
          .join("")
      : "当前组合尚未激活羁绊";

    elements.promptCount.textContent = String(selectedIds.length);
    elements.startBattle.disabled = !state.canStartBattle;

    if (selectedIds.length === data.rules.maxPromptSlots) {
      elements.loadoutHint.textContent = "装备完成 · 战术协议已锁定";
    } else {
      const remaining = data.rules.maxPromptSlots - selectedIds.length;
      elements.loadoutHint.textContent = `还需选择 ${remaining} 个 Prompt`;
    }
  }

  function closePromptRefresh() {
    elements.refreshOverlay.classList.remove("is-visible");
    elements.refreshOverlay.setAttribute("aria-hidden", "true");
  }

  function updateGlobalEventBanner(state) {
    const event =
      state.phase === gameApi.PHASES.BATTLE
        ? state.activeGlobalEvent
        : null;
    if (!event) {
      elements.globalEventBanner.hidden = true;
      return;
    }

    elements.globalEventBanner.hidden = false;
    elements.globalEventTitle.textContent =
      `服务器警告：${event.name}生效中`;
    elements.globalEventDescription.textContent = event.description;
  }

  function renderPromptRefresh(state) {
    const refresh = state.promptRefresh;
    if (!refresh) {
      return;
    }

    const selectedPromptId = state.refreshSelectedPromptId;
    elements.refreshRound.textContent = String(refresh.round).padStart(
      2,
      "0",
    );
    elements.refreshEventName.textContent =
      refresh.globalEvent?.name || "无环境事件";
    elements.refreshEventDescription.textContent =
      refresh.globalEvent?.description || "本次刷新没有触发环境事件。";

    elements.refreshOfferGrid.innerHTML = refresh.offeredPromptIds
      .map(function createOffer(promptId) {
        const prompt = getPrompt(promptId);
        if (!prompt) {
          return "";
        }
        const selected = prompt.id === selectedPromptId;
        return `
          <button
            class="refresh-offer${selected ? " is-selected" : ""}"
            type="button"
            data-refresh-prompt-id="${escapeHtml(prompt.id)}"
            aria-pressed="${String(selected)}"
          >
            <span>${escapeHtml(prompt.category)}</span>
            <strong>${escapeHtml(prompt.name)}</strong>
            <p>${escapeHtml(prompt.description)}</p>
          </button>
        `;
      })
      .join("");

    elements.refreshCurrentList.innerHTML = refresh.currentPromptIds
      .map(function createCurrentPrompt(promptId) {
        const prompt = getPrompt(promptId);
        return `
          <button
            class="refresh-slot"
            type="button"
            data-outgoing-prompt-id="${escapeHtml(promptId)}"
            ${selectedPromptId ? "" : "disabled"}
          >
            <span>REPLACE</span>
            <strong>${escapeHtml(prompt ? prompt.name : promptId)}</strong>
          </button>
        `;
      })
      .join("");

    elements.refreshHint.textContent = selectedPromptId
      ? `已选择【${getPrompt(selectedPromptId)?.name || selectedPromptId}】，请点击一个当前装备词条进行替换。`
      : "请先选择一个候补词条，再选择要替换的装备槽位。";

    elements.refreshOverlay.classList.add("is-visible");
    elements.refreshOverlay.setAttribute("aria-hidden", "false");
  }

  function hydrateCombatant(side, fighter) {
    const panel = fighters[side];
    if (!panel || !fighter) {
      return;
    }

    panel.style.setProperty("--fighter-accent", fighter.accent);
    panel.querySelector("[data-fighter-name]").textContent = fighter.name;
    const avatar = panel.querySelector("[data-avatar]");
    const avatarImage = avatar.querySelector("[data-avatar-image]");
    const avatarFallback = avatar.querySelector("[data-avatar-fallback]");
    avatarFallback.textContent = getInitials(fighter.name);
    avatar.classList.toggle("is-avatar-missing", !fighter.avatar);
    avatarImage.onerror = function showAvatarFallback() {
      avatarImage.hidden = true;
      avatar.classList.add("is-avatar-missing");
    };
    avatarImage.onload = function showAvatarImage() {
      avatarImage.hidden = false;
      avatar.classList.remove("is-avatar-missing");
    };
    if (fighter.avatar) {
      avatarImage.src = fighter.avatar;
      avatarImage.alt = "";
      avatarImage.hidden = false;
    } else {
      avatarImage.removeAttribute("src");
      avatarImage.hidden = true;
    }
    panel.querySelector(".agent-role").textContent = fighter.role;
    panel.querySelector("[data-trait]").innerHTML =
      `【${escapeHtml(fighter.trait.name)}】` +
      escapeHtml(fighter.trait.description);
    panel.querySelector("[data-atk]").textContent = String(fighter.atk);
    panel.querySelector("[data-def]").textContent = String(fighter.def);

    const sideLabelElement = panel.querySelector(".side-label");
    if (sideLabelElement) {
      sideLabelElement.textContent = sideLabel(side);
    }

    const promptChips = fighter.promptIds
      .map(function getPromptName(promptId) {
        const prompt = getPrompt(promptId);
        return prompt ? prompt.name : promptId;
      })
      .map(function wrapPrompt(name) {
        return `<span>${escapeHtml(name)}</span>`;
      })
      .join("");
    const bondChips = (fighter.bonds || [])
      .map(function createBondChip(bond) {
        return `<span class="bond-chip">羁绊·${escapeHtml(
          bond.name,
        )}</span>`;
      })
      .join("");
    panel.querySelector("[data-prompt-list]").innerHTML =
      promptChips + bondChips;

    updateHealth(side, fighter.hp, fighter.maxHp);
    updateEnergy(side, fighter.energy, fighter.maxEnergy);
    updateToken(side, fighter.token, fighter.maxToken);
  }

  function updateHealth(side, hp, maxHp) {
    const panel = fighters[side];
    if (!panel || !Number.isFinite(hp) || !Number.isFinite(maxHp)) {
      return;
    }

    const safeMaxHp = Math.max(1, maxHp);
    const safeHp = Math.max(0, Math.min(hp, safeMaxHp));
    const percent = (safeHp / safeMaxHp) * 100;
    const bar = panel.querySelector("[data-hp-bar]");
    const text = panel.querySelector("[data-hp-text]");
    const track = panel.querySelector(".hp-track");

    bar.style.width = percent + "%";
    bar.classList.toggle("is-low", percent <= 25);
    text.textContent = `${safeHp} / ${safeMaxHp}`;
    track.setAttribute("aria-valuenow", String(safeHp));
    track.setAttribute("aria-valuemax", String(safeMaxHp));
    panel.classList.toggle("is-defeated", safeHp <= 0);
  }

  function updateEnergy(side, energy, maxEnergy) {
    const panel = fighters[side];
    if (!panel || !Number.isFinite(energy) || !Number.isFinite(maxEnergy)) {
      return;
    }

    const safeMax = Math.max(1, maxEnergy);
    const safeEnergy = Math.max(0, Math.min(energy, safeMax));
    panel.querySelector("[data-energy-bar]").style.width =
      (safeEnergy / safeMax) * 100 + "%";
    panel.querySelector("[data-energy-text]").textContent =
      `${safeEnergy} / ${safeMax}`;
  }

  function updateToken(side, token, maxToken) {
    const panel = fighters[side];
    if (!panel || !Number.isFinite(token) || !Number.isFinite(maxToken)) {
      return;
    }

    const safeMax = Math.max(1, maxToken);
    const safeToken = Math.max(0, Math.min(token, safeMax));
    panel.querySelector("[data-token-bar]").style.width =
      (safeToken / safeMax) * 100 + "%";
    panel.querySelector("[data-token-text]").textContent =
      `${safeToken} / ${safeMax}`;
  }

  function refreshFighterStatuses(state) {
    if (!state.battle) {
      return;
    }

    ["player", "enemy"].forEach(function updateStatus(side) {
      const fighter = state.battle[side];
      const panel = fighters[side];
      panel.classList.toggle(
        "is-stunned",
        fighter.status.stunnedActions > 0,
      );
      panel.classList.toggle("is-defeated", fighter.hp <= 0);
      panel.classList.toggle(
        "is-active-turn",
        state.phase === gameApi.PHASES.BATTLE &&
          state.battle.activeSide === side,
      );
    });
  }

  function turnLabel(state) {
    if (!state.battle) {
      return "";
    }
    if (state.phase === gameApi.PHASES.PROMPT_REFRESH) {
      return "Prompt 重构阶段";
    }
    if (state.phase === gameApi.PHASES.RESULT) {
      return "战斗结束";
    }

    const active = state.battle.activeSide;
    if (state.mode === "pve" && active === "enemy") {
      return state.aiThinking ? "电脑思考中…" : "电脑行动阶段";
    }
    if (state.actionLocked) {
      return `${sideLabel(active)}结算中…`;
    }
    return `${sideLabel(active)}操作阶段`;
  }

  function updateBattleScreen(state) {
    const battle = state.battle;
    if (!battle) {
      return;
    }

    latestState = state;
    currentBattle = battle;
    if (!battleUiReady) {
      hydrateCombatant("player", battle.player);
      hydrateCombatant("enemy", battle.enemy);
      battleUiReady = true;
    } else {
      updateHealth("player", battle.player.hp, battle.player.maxHp);
      updateHealth("enemy", battle.enemy.hp, battle.enemy.maxHp);
      updateEnergy("player", battle.player.energy, battle.player.maxEnergy);
      updateEnergy("enemy", battle.enemy.energy, battle.enemy.maxEnergy);
      updateToken("player", battle.player.token, battle.player.maxToken);
      updateToken("enemy", battle.enemy.token, battle.enemy.maxToken);
    }
    elements.playerPanel.querySelector("[data-atk]").textContent = String(
      battle.player.atk,
    );
    elements.playerPanel.querySelector("[data-def]").textContent = String(
      battle.player.def,
    );
    elements.enemyPanel.querySelector("[data-atk]").textContent = String(
      battle.enemy.atk,
    );
    elements.enemyPanel.querySelector("[data-def]").textContent = String(
      battle.enemy.def,
    );

    const roundText = String(battle.round).padStart(2, "0");
    elements.roundValue.textContent = roundText;
    elements.arenaRound.textContent = roundText;
    elements.turnPhaseLabel.textContent = turnLabel(state);
    elements.battleStatus.textContent =
      state.phase === gameApi.PHASES.RESULT
        ? "SIMULATION COMPLETE"
        : state.phase === gameApi.PHASES.PROMPT_REFRESH
          ? "ROGUE REFRESH"
        : state.actionLocked
          ? "RESOLVING ACTION"
          : "MANUAL TURN MODE";
    refreshFighterStatuses(state);
    renderActionPanel(state);
  }

  function renderActionPanel(state) {
    const battle = state.battle;
    if (!battle) {
      return;
    }

    const activeSide = battle.activeSide;
    const activeFighter = battle[activeSide];
    const activeSkills =
      activeSide === "player" ? battle.playerSkills : battle.enemySkills;
    const canOperate = state.canAct && state.phase === gameApi.PHASES.BATTLE;
    const isAiTurn = state.mode === "pve" && activeSide === "enemy";

    elements.actionDockTitle.textContent = turnLabel(state);
    elements.actionDockHint.textContent = isAiTurn
      ? "AI 正在评估生命值、能量与可用技能。"
      : state.actionLocked
        ? "行动正在结算，操作锁将在短暂延迟后解除。"
        : activeFighter.status.stunnedActions > 0
          ? "当前角色眩晕；执行任意行动将跳过本回合。"
          : "选择普通攻击、角色专属技能或已装载的 Prompt 技能。";

    elements.basicAttack.disabled = !canOperate;
    elements.basicAttack.classList.toggle("is-ready", canOperate);
    elements.currentEnergy.querySelector("strong").textContent = String(
      activeFighter.energy,
    );
    elements.currentEnergy.querySelector("small").textContent =
      `/ ${activeFighter.maxEnergy}`;

    elements.skillButtons.innerHTML = activeSkills.length
      ? activeSkills
          .map(function createSkillButton(skill) {
            const disabled = !canOperate || !skill.usable;
            const typeLabel =
              skill.category === "角色大招"
                ? "ULTIMATE"
                : skill.category === "基础技能"
                  ? "BASE SKILL"
                  : skill.type === "ultimate"
                    ? "PROMPT ULTIMATE"
                    : "PROMPT SKILL";
            const icon =
              skill.type === "ultimate"
                ? "✦"
                : skill.type === "base"
                  ? "◆"
                  : "+";
            const charged =
              skill.type === "ultimate" &&
              activeFighter.energy >= skill.energyCost &&
              skill.usable;
            const reason = skill.reason
              ? `<span class="skill-reason">${escapeHtml(skill.reason)}</span>`
              : "";
            return `
              <button
                class="combat-action combat-action--skill${skill.type === "ultimate" ? " is-ultimate" : ""}${skill.type === "base" ? " is-base" : ""}${charged ? " is-charged" : ""}"
                type="button"
                data-skill-id="${escapeHtml(skill.id)}"
                ${disabled ? "disabled" : ""}
                title="${escapeHtml(skill.description || skill.reason || skill.name)}"
              >
                <span class="combat-action__icon" aria-hidden="true">
                  ${icon}
                </span>
                <span>
                  <small>${typeLabel}</small>
                  ${escapeHtml(skill.name)}
                </span>
                <strong class="action-cost">
                  <span>${skill.energyCost} EP</span>
                  <span>${skill.tokenCost} TK</span>
                </strong>
                ${reason}
              </button>
            `;
          })
          .join("")
      : '<p class="no-skills">当前角色没有主动 Prompt 技能</p>';
  }

  function handleStateChange(state, reason) {
    latestState = state;

    if (state.phase === gameApi.PHASES.MODE_SELECT) {
      hideGameOver();
      battleUiReady = false;
      currentBattle = null;
      closeSettings();
      closePromptRefresh();
      updateGlobalEventBanner(state);
      clearTrashTalkBubbles();
      showScreen("screen-mode");
      return;
    }

    if (state.phase === gameApi.PHASES.CHARACTER_SELECT) {
      hideGameOver();
      battleUiReady = false;
      currentBattle = null;
      closePromptRefresh();
      updateGlobalEventBanner(state);
      clearTrashTalkBubbles();
      renderSelectCopy();
      showScreen("screen-select");
      return;
    }

    if (state.phase === gameApi.PHASES.PROMPT_SELECT) {
      hideGameOver();
      battleUiReady = false;
      currentBattle = null;
      closePromptRefresh();
      updateGlobalEventBanner(state);
      clearTrashTalkBubbles();
      renderEquipScreen(state);
      showScreen("screen-equip");
      return;
    }

    showScreen("screen-battle");

    if (state.phase === gameApi.PHASES.BATTLE) {
      hideGameOver();
      closePromptRefresh();
      updateBattleScreen(state);
      updateGlobalEventBanner(state);
      return;
    }

    if (state.phase === gameApi.PHASES.PROMPT_REFRESH) {
      hideGameOver();
      updateBattleScreen(state);
      updateGlobalEventBanner(state);
      renderPromptRefresh(state);
      return;
    }

    if (state.phase === gameApi.PHASES.RESULT) {
      closePromptRefresh();
      updateBattleScreen(state);
      updateGlobalEventBanner(state);
      clearTrashTalkBubbles();
      scheduleGameOver(state, reason);
    }
  }

  function hideGameOver() {
    gameoverGeneration += 1;
    if (gameoverTimer !== null) {
      window.clearTimeout(gameoverTimer);
      gameoverTimer = null;
    }
    elements.gameoverOverlay.classList.remove("is-visible");
    elements.gameoverOverlay.setAttribute("aria-hidden", "true");
  }

  function populateGameOver(state) {
    const result = state.result;
    const battle = state.battle;
    if (!result || !battle) {
      return;
    }

    const isVictory = result.winner === "player";
    const isDraw = result.winner === "draw";
    elements.gameoverCard.classList.toggle(
      "is-victory",
      isVictory,
    );
    elements.gameoverCard.classList.toggle(
      "is-defeat",
      !isVictory && !isDraw,
    );
    elements.gameoverCard.classList.toggle("is-draw", isDraw);

    elements.gameoverTitleEn.textContent = isDraw
      ? "DRAW"
      : isVictory
        ? "VICTORY"
        : "DEFEAT";
    elements.gameoverTitleCn.textContent = isDraw
      ? "平局"
      : isVictory
        ? "胜利"
        : "失败";
    elements.gameoverSubtitle.textContent = isDraw
      ? "双方在回合上限前未能分出胜负，系统已归档本次模拟。"
      : isVictory
        ? "你的 AI 成功压制对手，战场控制权已确认。"
        : "作战单元失去响应，调整 Prompt 组合后再次连接。";

    elements.gameoverRounds.textContent = String(
      result.totalRounds ?? result.round ?? 0,
    ).padStart(2, "0");
    elements.gameoverTotalDamage.textContent = Number(
      result.playerTotalDamage || 0,
    ).toLocaleString("zh-CN");
    elements.gameoverEnemyDamage.textContent = Number(
      result.enemyTotalDamage || 0,
    ).toLocaleString("zh-CN");

    elements.gameoverPlayerAvatar.src = battle.player.avatar;
    elements.gameoverPlayerAvatar.alt =
      battle.player.name + " 最终立绘";
    elements.gameoverPlayerName.textContent = battle.player.name;
    elements.gameoverPlayerHp.textContent = String(
      Math.max(0, battle.player.hp),
    );
    elements.gameoverEnemyAvatar.src = battle.enemy.avatar;
    elements.gameoverEnemyAvatar.alt = battle.enemy.name + " 最终立绘";
    elements.gameoverEnemyName.textContent = battle.enemy.name;
    elements.gameoverEnemyHp.textContent = String(
      Math.max(0, battle.enemy.hp),
    );

    elements.gameoverPlayerPrompts.innerHTML = battle.player.promptIds
      .map(function createPromptTag(promptId) {
        const prompt = getPrompt(promptId);
        const accent = PROMPT_ACCENTS[promptId] || "#59ddff";
        return `<span style="--tag-accent:${accent}">${escapeHtml(
          prompt ? prompt.name : promptId,
        )}</span>`;
      })
      .join("");
  }

  function scheduleGameOver(state, reason) {
    if (
      gameoverTimer !== null ||
      elements.gameoverOverlay.classList.contains("is-visible")
    ) {
      return;
    }

    const generation = ++gameoverGeneration;
    populateGameOver(state);
    gameoverTimer = window.setTimeout(function revealGameOver() {
      gameoverTimer = null;
      if (
        generation !== gameoverGeneration ||
        !latestState ||
        latestState.phase !== gameApi.PHASES.RESULT
      ) {
        return;
      }
      elements.gameoverOverlay.classList.add("is-visible");
      elements.gameoverOverlay.setAttribute("aria-hidden", "false");
      window.setTimeout(function focusGameOverAction() {
        elements.gameoverReplay.focus({ preventScroll: true });
      }, 420);
    }, 1000);
  }

  function resetBattleLog() {
    elements.battleLog.innerHTML = `
      <div class="log-placeholder">
        <span>&gt;_</span>
        等待战斗数据流…
      </div>
    `;
  }

  function appendLog(tag, message, kind = "system", round = null) {
    const placeholder = elements.battleLog.querySelector(".log-placeholder");
    if (placeholder) {
      placeholder.remove();
    }

    const entry = document.createElement("div");
    entry.className = `log-entry log-entry--${kind}`;

    const roundElement = document.createElement("span");
    roundElement.className = "log-entry__round";
    const eventRound =
      round !== null ? round : currentBattle ? currentBattle.round : 0;
    roundElement.textContent = `[回合${eventRound}]`;

    const label = document.createElement("span");
    label.className = "log-entry__tag";
    label.textContent = `[${tag}]`;

    const copy = document.createElement("p");
    copy.className = "log-entry__message";
    copy.textContent = message;

    entry.append(roundElement, label, copy);
    elements.battleLog.appendChild(entry);

    while (elements.battleLog.children.length > 160) {
      elements.battleLog.firstElementChild.remove();
    }

    window.requestAnimationFrame(function scrollLogToLatest() {
      elements.battleLog.scrollTop = elements.battleLog.scrollHeight;
    });
  }

  function shakeFighter(fighterId) {
    const panel = fighters[fighterId];
    gameApi.playHitAnimation(panel);
  }

  function playAttackLunge(fighterId) {
    const panel = fighters[fighterId];
    gameApi.playAttackAnimation(panel, fighterId);
  }

  function spawnDamageFloat(fighterId, event) {
    const panel = fighters[fighterId];
    if (!panel) {
      return;
    }

    const layer = panel.querySelector("[data-damage-layer]");
    const damageNode = gameApi.showDamageNumber(layer, event);
    if (damageNode && event.source === "phantom") {
      damageNode.classList.add("is-phantom");
    }
  }

  function spawnHealFloat(fighterId, amount) {
    const panel = fighters[fighterId];
    if (!panel || amount <= 0) {
      return;
    }

    const layer = panel.querySelector("[data-damage-layer]");
    const healNode = document.createElement("span");
    healNode.className = "damage-float is-heal";
    healNode.textContent = `+${amount}`;
    healNode.style.setProperty("--damage-drift", "0px");
    healNode.addEventListener(
      "animationend",
      function removeHealNumber() {
        healNode.remove();
      },
      { once: true },
    );
    layer.appendChild(healNode);
  }

  function spawnShieldFloat(fighterId, amount) {
    const panel = fighters[fighterId];
    if (!panel || amount <= 0) {
      return;
    }

    const layer = panel.querySelector("[data-damage-layer]");
    const shieldNode = document.createElement("span");
    shieldNode.className = "damage-float is-shielded";
    shieldNode.textContent = `护盾 -${amount}`;
    shieldNode.style.setProperty("--damage-drift", "0px");
    shieldNode.addEventListener(
      "animationend",
      function removeShieldNumber() {
        shieldNode.remove();
      },
      { once: true },
    );
    layer.appendChild(shieldNode);
  }

  function actionName(event) {
    let name;
    if (event.skillName) {
      name = event.skillName;
    } else if (event.source === "burn") {
      name = "火焰灼烧";
    } else if (event.source === "ultimate") {
      name = "显存溢出";
    } else if (event.source === "phantom") {
      name = "视频生成";
    } else {
      name = "普通攻击";
    }

    if (event.attackCount > 1) {
      return `${name}（第 ${event.attackIndex}/${event.attackCount} 段）`;
    }
    return name;
  }

  function handleDamage(event) {
    const currentState = game.getState();
    latestState = currentState;
    currentBattle = currentState.battle;
    updateHealth(event.targetId, event.hpAfter, event.maxHp);
    refreshFighterStatuses(currentState);
    shakeFighter(event.targetId);
    if (event.critical) {
      gameApi.playCriticalFlash();
      gameApi.playScreenShake();
    }
    if (event.amount > 0 || event.guarded || event.missed) {
      spawnDamageFloat(event.targetId, event);
    } else if (event.shieldAbsorbed > 0) {
      spawnShieldFloat(event.targetId, event.shieldAbsorbed);
    }

    const attacker = sideLabel(event.attackerId);
    const target = sideLabel(event.targetId);
    const action = actionName(event);

    if (event.missed) {
      appendLog(
        "MISS",
        event.forcedMiss
          ? `${attacker} 使用了 ${action}，但受到【道德审查】强制影响，本次攻击必定闪避。`
          : `${attacker} 使用了 ${action}，但 ${target} 闪避了本次攻击。`,
        "system",
        event.round,
      );
      return;
    }

    if (event.selfHit) {
      gameApi.showBondBanner("赛博精神病已激活！");
      appendLog(
        "COMBO",
        `${attacker} 触发【赛博精神病】，攻击反噬自身，扣除 ${event.amount} 点生命。`,
        "bond",
        event.round,
      );
      return;
    }

    if (event.guarded) {
      appendLog(
        "GUARD",
        `${attacker} 使用了 ${action}，但 ${target} 的安全护栏免疫了伤害。`,
        "system",
        event.round,
      );
      return;
    }

    if (event.shieldAbsorbed > 0) {
      appendLog(
        "SHIELD",
        `${attacker} 使用了 ${action}，对 ${target} 造成 ${event.calculatedDamage} 点伤害；护盾吸收 ${event.shieldAbsorbed} 点，实际扣除 ${event.amount} 点生命。`,
        "system",
        event.round,
      );
      return;
    }

    const criticalText = event.critical ? "（暴击）" : "";
    appendLog(
      event.critical ? "CRIT" : "DAMAGE",
      `${attacker} 使用了 ${action}，对 ${target} 造成了 ${event.amount} 点伤害${criticalText}。`,
      event.critical ? "critical" : "damage",
      event.round,
    );
  }

  function handleBattleEvent(event) {
    if (!battleUiReady && game.getState().battle) {
      updateBattleScreen(game.getState());
    }

    switch (event.type) {
      case gameApi.BATTLE_EVENTS.BATTLE_START:
        clearTrashTalkBubbles();
        resetBattleLog();
        appendLog(
          "SYSTEM",
          `${sideLabel("player")} 与 ${sideLabel("enemy")} 进入战斗。${
            latestState.mode === "pve"
              ? "玩家行动后，电脑将延迟 1 秒自动行动。"
              : "双方共用屏幕并交替操作。"
          }`,
          "system",
          0,
        );
        (event.playerBonds || []).forEach((bond) => {
          appendLog(
            "COMBO",
            `玩家已激活羁绊【${bond.name}】：${bond.description}`,
            "bond",
            0,
          );
        });
        (event.enemyBonds || []).forEach((bond) => {
          appendLog(
            "COMBO",
            `电脑已激活羁绊【${bond.name}】：${bond.description}`,
            "bond",
            0,
          );
        });
        break;

      case gameApi.BATTLE_EVENTS.TURN_START:
        playAttackLunge(event.fighterId);
        appendLog(
          "TURN",
          `${sideLabel(event.fighterId)} 开始行动。`,
          "system",
          event.round,
        );
        break;

      case gameApi.BATTLE_EVENTS.HEAL:
        updateHealth(event.fighterId, event.hpAfter, event.maxHp);
        spawnHealFloat(event.fighterId, event.amount);
        appendLog(
          "HEAL",
          event.source === "passive"
            ? `${sideLabel(event.fighterId)} 触发 安全审查，恢复了 ${event.amount} 点生命。`
            : `${sideLabel(event.fighterId)} 的 ${event.skillName || "技能"} 恢复了 ${event.amount} 点生命。`,
          "heal",
          event.round,
        );
        break;

      case gameApi.BATTLE_EVENTS.SKILL_USED:
        if (event.skillType === "ultimate") {
          gameApi.playScreenShake();
        }
        gameApi.playVFX(
          currentBattle
            ? currentBattle[event.fighterId].characterId
            : event.fighterId,
          event.skillType,
          {
            sourceElement: fighters[event.fighterId],
            targetElement:
              fighters[event.targetId] || fighters[event.fighterId],
          },
        );
        appendLog(
          "SKILL",
          `${sideLabel(event.fighterId)} 使用了 ${event.skillName}。`,
          "system",
          event.round,
        );
        break;

      case gameApi.BATTLE_EVENTS.STUN_APPLIED:
        appendLog(
          "STUN",
          `${sideLabel(event.attackerId)} 的 ${event.stunSourceName || event.skillName || "幻觉污染"} 生效，${sideLabel(
            event.targetId,
          )} 下一次行动将被跳过。`,
          "stun",
          event.round,
        );
        break;

      case gameApi.BATTLE_EVENTS.STUNNED:
        appendLog(
          "STUN",
          `${sideLabel(event.fighterId)} 处于眩晕状态，本次行动被跳过。`,
          "stun",
          event.round,
        );
        break;

      case gameApi.BATTLE_EVENTS.ENERGY_CHANGED:
        updateEnergy(
          event.fighterId,
          event.energy,
          event.maxEnergy,
        );
        break;

      case gameApi.BATTLE_EVENTS.TOKEN_CHANGED:
        updateToken(
          event.fighterId,
          event.token,
          event.maxToken,
        );
        break;

      case gameApi.BATTLE_EVENTS.STAT_CHANGED:
        updateBattleScreen(game.getState());
        appendLog(
          "GROWTH",
          `${sideLabel(event.fighterId)} 的 ${event.source} 生效，攻击力永久 +${event.amount}，当前 ATK ${event.value}。`,
          "heal",
          event.round,
        );
        break;

      case gameApi.BATTLE_EVENTS.TRASH_TALK_TRIGGER:
        void requestTrashTalk(event);
        break;

      case gameApi.BATTLE_EVENTS.BOND_TRIGGERED:
        gameApi.showBondBanner(`${event.bondName}已激活！`);
        appendLog(
          "COMBO",
          `${sideLabel(event.fighterId)} 触发羁绊【${event.bondName}】：${event.description}`,
          "bond",
          event.round,
        );
        break;

      case gameApi.BATTLE_EVENTS.GLOBAL_EVENT:
        appendLog(
          "SERVER",
          `服务器警告：${event.globalEvent.name}生效中。${event.globalEvent.description}`,
          "critical",
          event.round,
        );
        break;

      case gameApi.BATTLE_EVENTS.PROMPT_REPLACED: {
        const outgoing = getPrompt(event.outgoingPromptId);
        appendLog(
          "REFRESH",
          `${sideLabel(event.fighterId)} 将【${outgoing?.name || event.outgoingPromptId}】替换为【${event.incomingPromptName}】。`,
          "system",
          event.round,
        );
        break;
      }

      case gameApi.BATTLE_EVENTS.DAMAGE:
        handleDamage(event);
        break;

      case gameApi.BATTLE_EVENTS.SELF_DAMAGE:
        updateHealth(event.fighterId, event.hpAfter, event.maxHp);
        appendLog(
          "COST",
          `${sideLabel(event.fighterId)} 使用 ${event.skillName} 支付了 ${event.amount} 点生命。`,
          "critical",
          event.round,
        );
        break;

      case gameApi.BATTLE_EVENTS.STATUS_APPLIED:
        appendLog(
          "STATUS",
          event.status === "summon-buff"
            ? `${sideLabel(event.fighterId)} 的 ${event.label} 生效，强化了 ${event.amount} 个幻影，持续 ${event.duration} 回合。`
            : `${sideLabel(event.fighterId)} 对 ${sideLabel(event.targetId)} 施加 ${event.label}：${event.description || `持续 ${event.duration} 回合`}。`,
          "stun",
          event.round,
        );
        break;

      case gameApi.BATTLE_EVENTS.STATUS_EXPIRED:
        appendLog(
          "STATUS",
          `${sideLabel(event.fighterId)} 的 ${event.label} 已结束。`,
          "system",
          event.round,
        );
        break;

      case gameApi.BATTLE_EVENTS.PHANTOM_SUMMON:
        appendLog(
          "SUMMON",
          event.persistent
            ? `${sideLabel(event.fighterId)} 召唤攻击力 ${event.attack}、生命值 ${event.maxHp} 的幻影，将在接下来 ${event.duration} 回合自动攻击。`
            : `${sideLabel(event.fighterId)} 触发 视频生成，攻击力 ${event.attack} 的幻影加入攻击。`,
          "system",
          event.round,
        );
        break;

      case gameApi.BATTLE_EVENTS.SUMMON_ATTACK:
        appendLog(
          "SUMMON",
          `${sideLabel(event.fighterId)} 的幻影自动攻击，攻击力 ${event.attack}，剩余 ${event.remainingTurns} 回合。`,
          "system",
          event.round,
        );
        break;

      case gameApi.BATTLE_EVENTS.BATTLE_END: {
        const winner =
          event.winner === "draw"
            ? "平局"
            : `${sideLabel(event.winner)} 胜利`;
        appendLog(
          "END",
          `${winner}。战斗在第 ${event.round} 回合结束。`,
          "system",
          event.round,
        );
        break;
      }

      default:
        break;
    }
  }

  function runGameAction(action) {
    try {
      action();
    } catch (error) {
      elements.actionDockHint.textContent = error.message;
    }
  }

  function findSkillContext(skillId) {
    if (!currentBattle) {
      return null;
    }
    const activeSide = currentBattle.activeSide;
    const skills =
      activeSide === "player"
        ? currentBattle.playerSkills
        : currentBattle.enemySkills;
    return skills.find((skill) => skill.id === skillId) || null;
  }

  function bindUi() {
    elements.modePve.addEventListener("click", function choosePve() {
      game.selectMode("pve");
    });

    elements.backMode.addEventListener("click", function backToMode() {
      game.restart();
    });

    elements.characterGrid.addEventListener("click", function selectCharacter(event) {
      const card = event.target.closest("[data-character-id]");
      if (card) {
        game.selectCharacter(card.dataset.characterId);
      }
    });

    elements.promptGrid.addEventListener("click", function selectPrompt(event) {
      const card = event.target.closest("[data-prompt-id]");
      if (card) {
        game.togglePrompt(card.dataset.promptId);
      }
    });

    elements.backSelect.addEventListener("click", function backFromEquip() {
      game.restart();
    });

    elements.startBattle.addEventListener("click", function confirmLoadout() {
      game.confirmLoadout();
    });

    elements.basicAttack.addEventListener("click", function basicAttack() {
      runGameAction(() => game.performBasicAttack());
    });

    elements.skillButtons.addEventListener("click", function useSkill(event) {
      const button = event.target.closest("[data-skill-id]");
      if (!button) {
        return;
      }
      const skill = findSkillContext(button.dataset.skillId);
      if (!skill) {
        return;
      }
      runGameAction(() => game.performSkill(skill.id));
    });

    elements.clearLog.addEventListener("click", resetBattleLog);
    elements.saveApiKey.addEventListener("click", saveApiKey);
    elements.apiKeyInput.addEventListener("keydown", function saveOnEnter(event) {
      if (event.key === "Enter") {
        event.preventDefault();
        saveApiKey();
      }
    });
    elements.settingsButton.addEventListener("click", openSettings);
    elements.closeSettingsTop.addEventListener("click", closeSettings);
    elements.closeSettings.addEventListener("click", closeSettings);

    elements.settingsModal.addEventListener("click", function closeOnBackdrop(event) {
      if (event.target === elements.settingsModal) {
        closeSettings();
      }
    });

    elements.restartMatch.addEventListener("click", function restartMatch() {
      closeSettings();
      game.restartBattle();
    });

    elements.returnMenu.addEventListener("click", function returnToMenu() {
      closeSettings();
      game.restart();
    });

    elements.refreshOfferGrid.addEventListener(
      "click",
      function selectRefreshPrompt(event) {
        const card = event.target.closest("[data-refresh-prompt-id]");
        if (!card) {
          return;
        }
        game.selectRefreshPrompt(card.dataset.refreshPromptId);
      },
    );

    elements.refreshCurrentList.addEventListener(
      "click",
      function replaceRefreshPrompt(event) {
        const slot = event.target.closest("[data-outgoing-prompt-id]");
        if (!slot) {
          return;
        }
        try {
          game.replaceRefreshPrompt(slot.dataset.outgoingPromptId);
        } catch (error) {
          elements.refreshHint.textContent = error.message;
        }
      },
    );

    elements.skipRefresh.addEventListener("click", function skipRefresh() {
      game.skipPromptRefresh();
    });

    document.addEventListener("keydown", function closeSettingsWithEscape(event) {
      if (
        event.key === "Escape" &&
        elements.settingsModal.classList.contains("is-visible")
      ) {
        closeSettings();
      }
    });

    elements.gameoverReplay.addEventListener("click", function replay() {
      hideGameOver();
      game.playAgain();
    });

    elements.gameoverLobby.addEventListener("click", function lobby() {
      hideGameOver();
      game.restart();
    });
  }

  function init() {
    renderCharacterCards();
    loadApiKey();
    game = new gameApi.GameController();
    window.promptArenaGame = game;

    bindUi();
    game.subscribe(handleStateChange);
    game.subscribeBattleEvents(handleBattleEvent);
    resetBattleLog();
  }

  init();
})();
