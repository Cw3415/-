(function defineBattleGame(root) {
  "use strict";

  const data =
    root.GAME_DATA ||
    (typeof module === "object" && module.exports ? require("./data.js") : null);

  if (!data) {
    throw new Error("game.js 需要先加载 data.js。");
  }

  const PHASES = Object.freeze({
    MODE_SELECT: "mode-select",
    CHARACTER_SELECT: "character-select",
    PROMPT_SELECT: "prompt-select",
    BATTLE: "battle",
    PROMPT_REFRESH: "prompt-refresh",
    RESULT: "result",
  });

  const BATTLE_STATUS = Object.freeze({
    IDLE: "idle",
    RUNNING: "running",
    FINISHED: "finished",
  });

  const BATTLE_EVENTS = Object.freeze({
    BATTLE_START: "battle-start",
    TURN_END: "turn-end",
    ROUND_START: "round-start",
    ROUND_END: "round-end",
    TURN_START: "turn-start",
    HEAL: "heal",
    STUNNED: "stunned",
    STUN_APPLIED: "stun-applied",
    DAMAGE: "damage",
    PHANTOM_SUMMON: "phantom-summon",
    SUMMON_ATTACK: "summon-attack",
    SKILL_USED: "skill-used",
    STATUS_APPLIED: "status-applied",
    STATUS_EXPIRED: "status-expired",
    STAT_CHANGED: "stat-changed",
    GLOBAL_EVENT: "global-event",
    PROMPT_REPLACED: "prompt-replaced",
    TRASH_TALK_TRIGGER: "trash-talk-trigger",
    BOND_TRIGGERED: "bond-triggered",
    SHIELD_ABSORBED: "shield-absorbed",
    SELF_DAMAGE: "self-damage",
    ENERGY_CHANGED: "energy-changed",
    TOKEN_CHANGED: "token-changed",
    ULTIMATE: "ultimate",
    BATTLE_END: "battle-end",
  });

  const ROUND_LIMIT = 100;
  const API_KEY_STORAGE_KEY = "promptArena.deepseekApiKey";

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function randomIndex(length, random) {
    const roll = clamp(Number(random()) || 0, 0, 0.9999999999999999);
    return Math.floor(roll * length);
  }

  function sampleUnique(items, count, random = Math.random) {
    if (!Array.isArray(items)) {
      throw new TypeError("sampleUnique 的 items 必须是数组。");
    }

    const limit = Math.min(Math.max(0, Math.floor(count)), items.length);
    const pool = items.slice();

    for (let index = pool.length - 1; index > 0; index -= 1) {
      const swapIndex = randomIndex(index + 1, random);
      const temp = pool[index];
      pool[index] = pool[swapIndex];
      pool[swapIndex] = temp;
    }

    return pool.slice(0, limit);
  }

  async function generateTrashTalk(roleName, situation, options = {}) {
    const storage = options.storage || root.localStorage;
    const apiKey =
      options.apiKey ||
      (storage ? storage.getItem(API_KEY_STORAGE_KEY) : "");
    const fetchImpl = options.fetchImpl || root.fetch;

    if (!apiKey) {
      throw new Error("请先在设置中填写 DeepSeek API Key。");
    }
    if (typeof fetchImpl !== "function") {
      throw new Error("当前浏览器不支持 fetch 请求。");
    }

    const controller =
      typeof AbortController === "function" ? new AbortController() : null;
    const timeoutMs = Number(options.timeoutMs) || 12000;
    const timeoutId = controller
      ? root.setTimeout(() => controller.abort(), timeoutMs)
      : null;

    try {
      const response = await fetchImpl(
        "https://api.deepseek.com/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + apiKey,
          },
          body: JSON.stringify({
            model: "deepseek-chat",
            messages: [
              {
                role: "system",
                content:
                  "你扮演大语言模型 " +
                  roleName +
                  "，正在和别的 AI 打架，请用一句傲慢/搞笑/中二的话嘲讽对方，不要超过20个字",
              },
              {
                role: "user",
                content: "当前战况：" + situation + "。只说一句台词。",
              },
            ],
            temperature: 1.2,
            max_tokens: 40,
            stream: false,
          }),
          signal: controller ? controller.signal : undefined,
        },
      );

      if (!response.ok) {
        throw new Error("DeepSeek API 请求失败：" + response.status);
      }

      const payload = await response.json();
      const rawText =
        payload &&
        payload.choices &&
        payload.choices[0] &&
        payload.choices[0].message &&
        payload.choices[0].message.content;
      const line = String(rawText || "")
        .replace(/^["“”'‘’]+|["“”'‘’]+$/g, "")
        .replace(/\s+/g, "")
        .trim();
      if (!line) {
        throw new Error("DeepSeek API 没有返回有效台词。");
      }
      return Array.from(line).slice(0, 20).join("");
    } catch (error) {
      if (error && error.name === "AbortError") {
        throw new Error("DeepSeek API 请求超时。");
      }
      throw error;
    } finally {
      if (timeoutId !== null) {
        root.clearTimeout(timeoutId);
      }
    }
  }

  function getCharacter(characterId, sourceData = data) {
    return sourceData.characters.find(function findCharacter(character) {
      return character.id === characterId;
    });
  }

  function getPrompt(promptId, sourceData = data) {
    return sourceData.prompts.find(function findPrompt(prompt) {
      return prompt.id === promptId;
    });
  }

  function getAvailablePrompts(characterId, sourceData = data) {
    const character = getCharacter(characterId, sourceData);
    if (!character) {
      return [];
    }

    return sourceData.prompts.filter((prompt) =>
      isPromptAvailableForCharacter(prompt, character),
    );
  }

  function isPromptAvailableForCharacter(prompt, character) {
    if (!prompt.restrictedTo) {
      return true;
    }
    const characterKeys = new Set([
      character.id.toLowerCase(),
      character.name.toLowerCase(),
    ]);
    return characterKeys.has(String(prompt.restrictedTo).toLowerCase());
  }

  function getPromptEffects(fighter, sourceData = data) {
    const effects = {
      atkFlat: 0,
      atkPercentBonus: 0,
      defFlat: 0,
      maxHpFlat: 0,
      maxEnergySet: 0,
      attackCount: 1,
      attackDamageMultiplier: 1,
      stunChance: 0,
      evasionChance: 0,
      defenseIgnoreRatio: 0,
      healPerRound: 0,
      healPerRoundMultiplier: 1,
      energyOnHit: 0,
      turnEndSelfDamage: 0,
      setDefenseToZero: false,
      damageTakenAtkGain: 0,
      ultimateDamageMultiplier: 1,
      ultimateTokenCostMultiplier: 1,
      skillTokenCostMultiplier: 1,
      skillDamageMultiplier: 1,
      normalAttackFlatBonus: 0,
      randomElementalAttack: false,
      elementalAttackChance: 0,
      postActionStunChance: 0,
      postUltimateStunActions: 0,
      basicAttackBonusEnergy: 0,
      summonDurationMultiplier: 1,
      summonEnergyOnHit: 0,
      selfHitChance: 0,
      selfHpCostRatio: 0,
      activeBonds: [],
      trueDamageHpRatio: 0,
      selfStunActions: 0,
      requiredPromptCount: 0,
      oncePerBattle: false,
    };

    fighter.promptIds.forEach(function applyPrompt(promptId) {
      const prompt = getPrompt(promptId, sourceData);
      if (!prompt || !prompt.effects) {
        return;
      }

      Object.keys(prompt.effects).forEach(function applyEffect(key) {
        const value = prompt.effects[key];

        if (key === "attackCount") {
          effects.attackCount = Math.max(effects.attackCount, value);
        } else if (key === "attackDamageMultiplier") {
          effects.attackDamageMultiplier *= value;
        } else if (key === "defenseIgnoreRatio") {
          effects.defenseIgnoreRatio = Math.max(
            effects.defenseIgnoreRatio,
            value,
          );
        } else if (key === "stunChance") {
          effects.stunChance += value;
        } else if (key === "evasionChance") {
          effects.evasionChance += value;
        } else if (key === "postActionStunChance") {
          effects.postActionStunChance += value;
        } else if (key === "ultimateDamageMultiplier") {
          effects.ultimateDamageMultiplier *= value;
        } else if (key === "ultimateTokenCostMultiplier") {
          effects.ultimateTokenCostMultiplier *= value;
        } else if (key === "skillTokenCostMultiplier") {
          effects.skillTokenCostMultiplier *= value;
        } else if (key === "skillDamageMultiplier") {
          effects.skillDamageMultiplier *= value;
        } else if (key === "summonDurationMultiplier") {
          effects.summonDurationMultiplier *= value;
        } else if (key === "elementalAttackChance") {
          effects.elementalAttackChance = Math.max(
            effects.elementalAttackChance,
            value,
          );
        } else if (typeof value === "number") {
          effects[key] += value;
        } else if (typeof effects[key] === "boolean") {
          effects[key] = effects[key] || Boolean(value);
        }
      });
    });

    const equippedPromptIds = new Set(fighter.promptIds);
    (sourceData.bonds || []).forEach((bond) => {
      if (
        bond.requiredPromptIds.every((promptId) =>
          equippedPromptIds.has(promptId),
        )
      ) {
        effects.activeBonds.push({
          id: bond.id,
          name: bond.name,
          description: bond.description,
        });
        Object.entries(bond.effects || {}).forEach(([key, value]) => {
          if (
            key === "healPerRoundMultiplier" ||
            key === "ultimateDamageMultiplier"
          ) {
            effects[key] *= value;
          } else if (key === "elementalAttackChance") {
            effects[key] = Math.max(effects[key], value);
          } else if (typeof value === "number") {
            effects[key] = (effects[key] || 0) + value;
          } else if (typeof effects[key] === "boolean") {
            effects[key] = effects[key] || Boolean(value);
          }
        });
      }
    });

    effects.attackCount = Math.max(1, Math.floor(effects.attackCount));
    effects.defenseIgnoreRatio = clamp(effects.defenseIgnoreRatio, 0, 1);
    effects.stunChance = clamp(effects.stunChance, 0, 1);
    effects.evasionChance = clamp(effects.evasionChance, 0, 1);
    effects.postActionStunChance = clamp(
      effects.postActionStunChance,
      0,
      1,
    );
    effects.summonDurationMultiplier = Math.max(
      1,
      effects.summonDurationMultiplier,
    );
    effects.ultimateTokenCostMultiplier = Math.max(
      0,
      effects.ultimateTokenCostMultiplier,
    );
    effects.skillTokenCostMultiplier = Math.max(
      0,
      effects.skillTokenCostMultiplier,
    );
    effects.skillDamageMultiplier = Math.max(
      0,
      effects.skillDamageMultiplier,
    );
    effects.selfHitChance = clamp(effects.selfHitChance, 0, 1);
    effects.elementalAttackChance = clamp(
      effects.elementalAttackChance,
      0,
      1,
    );
    effects.attackDamageMultiplier = Math.max(
      0,
      effects.attackDamageMultiplier,
    );

    return effects;
  }

  function createFighter(build, side, sourceData = data) {
    if (!build || !build.characterId || !Array.isArray(build.promptIds)) {
      throw new TypeError("角色配置必须包含 characterId 和 promptIds。");
    }

    if (side !== "player" && side !== "enemy") {
      throw new Error('side 只能是 "player" 或 "enemy"。');
    }

    const character = getCharacter(build.characterId, sourceData);
    if (!character) {
      throw new Error("未知角色：" + build.characterId);
    }

    const uniquePromptIds = Array.from(new Set(build.promptIds));
    if (uniquePromptIds.length !== build.promptIds.length) {
      throw new Error("同一 Prompt 不能重复装备。");
    }

    if (uniquePromptIds.length > sourceData.rules.maxPromptSlots) {
      throw new Error("Prompt 数量不能超过 " + sourceData.rules.maxPromptSlots);
    }

    uniquePromptIds.forEach(function validatePrompt(promptId) {
      const prompt = getPrompt(promptId, sourceData);
      if (!prompt) {
        throw new Error("未知 Prompt：" + promptId);
      }
      if (!isPromptAvailableForCharacter(prompt, character)) {
        throw new Error(
          "Prompt【" +
            prompt.name +
            "】仅限 " +
            prompt.restrictedTo +
            " 使用。",
        );
      }
    });

    const baseFighter = {
      id: side,
      side,
      characterId: character.id,
      name: character.name,
      role: character.role,
      description: character.description,
      accent: character.accent,
      avatar: character.avatar,
      promptIds: uniquePromptIds,
      trait: Object.assign({}, character.trait),
      baseStats: {
        hp: character.hp,
        atk: character.atk,
        def: character.def,
        token: character.token,
      },
    };

    const effects = getPromptEffects(baseFighter, sourceData);
    const maxHp = Math.max(1, character.hp + effects.maxHpFlat);

    return {
      id: side,
      side,
      characterId: character.id,
      name: character.name,
      role: character.role,
      description: character.description,
      accent: character.accent,
      avatar: character.avatar,
      promptIds: uniquePromptIds,
      trait: Object.assign({}, character.trait),
      baseStats: {
        hp: character.hp,
        atk: character.atk,
        def: character.def,
        token: character.token,
      },
      maxHp,
      hp: maxHp,
      atk: Math.max(
        0,
        Math.round(
          (character.atk + effects.atkFlat) *
            (1 + effects.atkPercentBonus),
        ),
      ),
      def: effects.setDefenseToZero
        ? 0
        : Math.max(0, character.def + effects.defFlat),
      energy: 0,
      maxEnergy: Math.max(
        1,
        effects.maxEnergySet > 0
          ? effects.maxEnergySet
          : sourceData.rules.maxEnergy || 100,
      ),
      token: Math.min(
        sourceData.rules.maxToken || 100,
        Math.max(
          0,
          Number.isFinite(character.token)
            ? character.token
            : sourceData.rules.maxToken || 100,
        ),
      ),
      maxToken: Math.max(
        1,
        sourceData.rules.maxToken || 100,
      ),
      modifiers: effects,
      bonds: effects.activeBonds.map((bond) => Object.assign({}, bond)),
      status: {
        stunnedActions: 0,
        forceNextMiss: 0,
        skillLockTurns: 0,
        shield: {
          amount: 0,
          duration: 0,
          createdTurn: 0,
        },
        slow: {
          attackReduction: 0,
          duration: 0,
        },
        burn: {
          damage: 0,
          duration: 0,
        },
        armorBreak: {
          defenseReduction: 0,
          duration: 0,
        },
      },
      summons: [],
      usedOnceSkills: [],
      ultimateUsed: false,
      aiLastBaseSkillTurn: -100,
      dynamicAtkGain: 0,
      trashTalkFlags: {
        lowHp: false,
      },
      stats: {
        damageDealt: 0,
        damageTaken: 0,
        healingDone: 0,
        attacks: 0,
      },
    };
  }

  /**
   * 纯伤害公式：
   * max(1, ATK * 技能倍率 - DEF * (1 - 穿甲比例))
   * 只要命中且未被免疫，最终至少造成 1 点伤害。
   * 暴击在扣除防御后再翻倍；真实伤害直接使用给定数值。
   */
  function calculateDamage(options) {
    const attacker = options.attacker;
    const target = options.target;
    const attackMultiplier = Number.isFinite(options.attackMultiplier)
      ? Math.max(0, options.attackMultiplier)
      : 1;
    const defenseIgnoreRatio = clamp(
      Number(options.defenseIgnoreRatio) || 0,
      0,
      1,
    );
    const defenseScale = Math.max(
      0,
      Number.isFinite(options.defenseScale) ? options.defenseScale : 1,
    );
    const critical = Boolean(options.critical);
    const criticalMultiplier = Math.max(
      1,
      Number(options.criticalMultiplier) || 1,
    );

    if (options.trueDamage) {
      const requestedTrueDamage = Number(options.trueDamage);
      const trueDamage = Number.isFinite(requestedTrueDamage)
        ? Math.max(1, Math.round(requestedTrueDamage))
        : 1;
      return {
        damage: trueDamage,
        preCriticalDamage: trueDamage,
        effectiveDefense: 0,
        critical: false,
        trueDamage: true,
      };
    }

    const effectiveDefense = Math.max(
      0,
      target.def * defenseScale * (1 - defenseIgnoreRatio),
    );
    const attackValue = attacker.atk * attackMultiplier;
    const preCriticalDamage = Math.max(
      1,
      Math.round(attackValue - effectiveDefense),
    );
    const damage = critical
      ? Math.max(1, Math.round(preCriticalDamage * criticalMultiplier))
      : preCriticalDamage;

    return {
      damage,
      preCriticalDamage,
      effectiveDefense,
      critical,
      trueDamage: false,
    };
  }

  function getEffectiveAttack(fighter) {
    const reduction =
      fighter.status && fighter.status.slow
        ? clamp(Number(fighter.status.slow.attackReduction) || 0, 0, 0.9)
        : 0;
    return Math.max(0, fighter.atk * (1 - reduction));
  }

  function getEffectiveDefense(fighter) {
    const reduction =
      fighter.status && fighter.status.armorBreak
        ? clamp(Number(fighter.status.armorBreak.defenseReduction) || 0, 0, 1)
        : 0;
    return Math.max(0, fighter.def * (1 - reduction));
  }

  function getSkillEnergyCost(fighter, skill) {
    const baseCost = Math.max(
      0,
      Number(
        Number.isFinite(skill.cost) ? skill.cost : skill.energyCost,
      ) || 0,
    );
    const isUltimate =
      skill.skillType === "ultimate" || skill.type === "ultimate";
    return isUltimate ? Math.min(baseCost, fighter.maxEnergy) : baseCost;
  }

  function getSkillTokenCost(fighter, skill, sourceData = data) {
    const isUltimate =
      skill.skillType === "ultimate" || skill.type === "ultimate";
    const baseCost = Math.max(
      0,
      Number(
        Number.isFinite(skill.tokenCost)
          ? skill.tokenCost
          : isUltimate
            ? sourceData.rules.ultimateSkillTokenCost || 50
            : sourceData.rules.baseSkillTokenCost || 20,
      ) || 0,
    );
    const ultimateMultiplier = isUltimate
      ? fighter.modifiers.ultimateTokenCostMultiplier
      : 1;
    return Math.max(
      0,
      Math.round(
        baseCost *
          ultimateMultiplier *
          fighter.modifiers.skillTokenCostMultiplier,
      ),
    );
  }

  class BattleEngine {
    constructor(options = {}) {
      if (!options.playerBuild || !options.enemyBuild) {
        throw new TypeError("BattleEngine 需要 playerBuild 和 enemyBuild。");
      }

      this.sourceData = options.data || data;
      this.random = options.random || Math.random;
      this.player = createFighter(
        options.playerBuild,
        "player",
        this.sourceData,
      );
      this.enemy = createFighter(options.enemyBuild, "enemy", this.sourceData);
      this.status = BATTLE_STATUS.IDLE;
      this.turn = 0;
      this.round = 1;
      this.activeSide = "player";
      this.isActionLocked = false;
      this.globalEvent = null;
      this.winner = null;
      this.totalRounds = 0;
      this.playerTotalDamage = 0;
      this.enemyTotalDamage = 0;
      this.lastRoundEvents = [];
      this.history = [];
      this.eventSequence = 0;
      this.summonSequence = 0;
      this.listeners = new Map();
    }

    on(eventType, listener) {
      if (typeof listener !== "function") {
        throw new TypeError("事件监听器必须是函数。");
      }

      if (!this.listeners.has(eventType)) {
        this.listeners.set(eventType, new Set());
      }
      this.listeners.get(eventType).add(listener);

      return () => {
        const bucket = this.listeners.get(eventType);
        if (bucket) {
          bucket.delete(listener);
        }
      };
    }

    emit(eventType, payload = {}) {
      const event = Object.assign(
        {
          id: ++this.eventSequence,
          type: eventType,
          round: this.round,
          playerHp: this.player.hp,
          enemyHp: this.enemy.hp,
        },
        payload,
      );

      this.history.push(event);
      this.lastRoundEvents.push(event);

      const exactListeners = this.listeners.get(eventType);
      const allListeners = this.listeners.get("*");

      if (exactListeners) {
        Array.from(exactListeners).forEach(function dispatch(listener) {
          try {
            listener(event);
          } catch (error) {
            console.error("战斗事件监听器执行失败：", error);
          }
        });
      }
      if (allListeners) {
        Array.from(allListeners).forEach(function dispatch(listener) {
          try {
            listener(event);
          } catch (error) {
            console.error("战斗事件监听器执行失败：", error);
          }
        });
      }

      return event;
    }

    start() {
      if (this.status === BATTLE_STATUS.FINISHED) {
        return this.getSnapshot();
      }

      if (this.status === BATTLE_STATUS.IDLE) {
        this.status = BATTLE_STATUS.RUNNING;
        this.emit(BATTLE_EVENTS.BATTLE_START, {
          firstMover: "player",
          activeSide: this.activeSide,
          playerBonds: this.player.bonds.map((bond) =>
            Object.assign({}, bond),
          ),
          enemyBonds: this.enemy.bonds.map((bond) =>
            Object.assign({}, bond),
          ),
        });
      }

      return this.getSnapshot();
    }

    /**
     * 结算一次完整行动，而不是自动结算整轮。
     * action: { type: "basic" } 或 { type: "skill", skillId: "..." }
     */
    performAction(fighterId, action = { type: "basic" }) {
      if (this.isActionLocked) {
        throw new Error("当前行动尚未结算完成，不能重复操作。");
      }

      this.isActionLocked = true;
      try {
        return this._executeAction(fighterId, action);
      } finally {
        this.isActionLocked = false;
      }
    }

    _executeAction(fighterId, action = { type: "basic" }) {
      if (this.status === BATTLE_STATUS.FINISHED) {
        return this.getSnapshot();
      }

      this.start();

      if (fighterId !== this.activeSide) {
        throw new Error("当前不是 " + fighterId + " 的行动阶段。");
      }

      const attacker = this._getFighter(fighterId);
      const target = fighterId === "player" ? this.enemy : this.player;
      if (!attacker || attacker.hp <= 0 || target.hp <= 0) {
        return this.getSnapshot();
      }

      this.turn += 1;
      this.lastRoundEvents = [];

      this.emit(BATTLE_EVENTS.TURN_START, {
        fighterId,
        targetId: target.id,
        turn: this.turn,
        round: this.round,
        actionType: action.type,
      });

      if (this._applyTurnStartEffects(attacker)) {
        return this.getSnapshot();
      }

      if (attacker.characterId === "sora") {
        this._processSummons(attacker, target);
        if (this.status === BATTLE_STATUS.FINISHED) {
          return this.getSnapshot();
        }
      }

      if (attacker.status.stunnedActions > 0) {
        attacker.status.stunnedActions -= 1;
        this.emit(BATTLE_EVENTS.STUNNED, {
          fighterId,
          remainingStunActions: attacker.status.stunnedActions,
        });
        this._finishAction(attacker);
        return this.getSnapshot();
      }

      if (action.type === "skill") {
        this._performSkillAction(attacker, target, action.skillId);
      } else {
        this._performBasicTurn(attacker, target);
      }

      if (this.status !== BATTLE_STATUS.FINISHED) {
        this._applyPostActionEffects(attacker);
      }

      if (this.status !== BATTLE_STATUS.FINISHED) {
        if (this.round >= ROUND_LIMIT && this.activeSide === "enemy") {
          const playerRatio = this.player.hp / this.player.maxHp;
          const enemyRatio = this.enemy.hp / this.enemy.maxHp;
          const winner =
            playerRatio === enemyRatio
              ? "draw"
              : playerRatio > enemyRatio
                ? "player"
                : "enemy";
          this._finishBattle(winner, "round-limit");
        } else {
          this._finishAction(attacker);
        }
      }

      return this.getSnapshot();
    }

    _applyPostActionEffects(attacker) {
      if (
        attacker.modifiers.postActionStunChance > 0 &&
        this.random() < attacker.modifiers.postActionStunChance
      ) {
        attacker.status.stunnedActions = Math.max(
          1,
          attacker.status.stunnedActions,
        );
        this.emit(BATTLE_EVENTS.STATUS_APPLIED, {
          fighterId: attacker.id,
          targetId: attacker.id,
          status: "redundancy-stun",
          label: "极度冗余",
          description: "行动后过载，下一次行动将被跳过",
          duration: 1,
          skillId: "extreme_redundancy",
        });
      }
    }

    // 兼容旧调用；现在每次调用只推进一个操作者的行动。
    resolveRound() {
      return this.performAction(this.activeSide, { type: "basic" });
    }

    _applyTurnStartEffects(attacker) {
      if (attacker.hp <= 0) {
        return true;
      }

      this._restoreToken(
        attacker,
        Math.max(0, this.sourceData.rules.tokenRegenPerTurn || 10),
      );

      if (
        attacker.status.burn.duration > 0 &&
        attacker.status.burn.damage > 0
      ) {
        const opponent =
          attacker.id === "player" ? this.enemy : this.player;
        this._attackOnce(opponent, attacker, {
          source: "burn",
          skillId: "burn",
          skillName: "火焰灼烧",
          trueDamageAmount: attacker.status.burn.damage,
          damageType: "灼烧",
          allowCritical: false,
          canStun: false,
          ignoreImmunity: true,
        });
        attacker.status.burn.duration -= 1;
        if (attacker.status.burn.duration === 0) {
          attacker.status.burn.damage = 0;
          this.emit(BATTLE_EVENTS.STATUS_EXPIRED, {
            fighterId: attacker.id,
            status: "burn",
            label: "火焰灼烧",
          });
        }
        if (this._checkBattleEnd()) {
          return true;
        }
      }

      const passiveHealing = this._healFighter(
        attacker,
        attacker.modifiers.healPerRound *
          attacker.modifiers.healPerRoundMultiplier,
        "passive",
        "安全审查",
        "security_audit",
      );
      if (
        passiveHealing > 0 &&
        attacker.modifiers.healPerRound > 0 &&
        attacker.modifiers.healPerRoundMultiplier > 1
      ) {
        this.emit(BATTLE_EVENTS.BOND_TRIGGERED, {
          fighterId: attacker.id,
          bondId: "infinite_refill",
          bondName: "无限续杯",
          description: "安全审查恢复量翻倍",
        });
      }
      return false;
    }

    _restoreToken(fighter, amount) {
      if (amount <= 0 || fighter.hp <= 0) {
        return 0;
      }
      const previous = fighter.token;
      fighter.token = Math.min(
        fighter.maxToken,
        fighter.token + Math.round(amount),
      );
      const restored = fighter.token - previous;
      if (restored > 0) {
        this.emit(BATTLE_EVENTS.TOKEN_CHANGED, {
          fighterId: fighter.id,
          token: fighter.token,
          maxToken: fighter.maxToken,
          amount: restored,
          source: "regeneration",
        });
      }
      return restored;
    }

    _performBasicTurn(attacker, target) {
      const attackCount = attacker.modifiers.attackCount;
      const elementTypes = ["冰霜", "火焰", "雷电"];
      const elementalChance = attacker.modifiers.randomElementalAttack
        ? clamp(
            Number(attacker.modifiers.elementalAttackChance) || 1,
            0,
            1,
          )
        : 0;

      for (let attackIndex = 0; attackIndex < attackCount; attackIndex += 1) {
        if (target.hp <= 0) {
          return;
        }

        const elementalAttack =
          elementalChance > 0 &&
          (elementalChance >= 1 || this.random() < elementalChance);
        const flatDamageBonus = elementalAttack
          ? attacker.modifiers.normalAttackFlatBonus
          : 0;
        const damageType = elementalAttack
          ? "元素·" +
            elementTypes[randomIndex(elementTypes.length, this.random)]
          : undefined;
        this._attackOnce(attacker, target, {
          attackIndex: attackIndex + 1,
          attackCount,
          attackMultiplier: attacker.modifiers.attackDamageMultiplier,
          defenseIgnoreRatio: attacker.modifiers.defenseIgnoreRatio,
          defenseScale: attackCount > 1 ? 0.5 : 1,
          damageType,
          flatDamageBonus,
          source: "basic",
          allowCritical: true,
          canStun: true,
        });

        if (this._checkBattleEnd()) {
          return;
        }
      }

      this._addEnergy(
        attacker,
        Math.max(0, this.sourceData.rules.basicAttackEnergyGain || 0) +
          Math.max(0, attacker.modifiers.basicAttackBonusEnergy || 0),
      );

      if (
        target.hp > 0 &&
        attacker.trait.kind === "phantom-summon"
      ) {
        this._trySummonPhantom(attacker, target);
      }
    }

    _performSkillAction(attacker, target, skillId) {
      const skill = this._getActiveSkill(attacker, skillId);
      if (!skill || !this.canUseSkill(attacker.id, skillId, true)) {
        throw new Error("该技能当前无法使用：" + skillId);
      }

      const energyCost = getSkillEnergyCost(attacker, skill);
      const tokenCost = getSkillTokenCost(
        attacker,
        skill,
        this.sourceData,
      );
      attacker.energy = Math.max(
        0,
        attacker.energy - energyCost,
      );
      attacker.token = Math.max(0, attacker.token - tokenCost);
      if (
        skill.skillType === "base" &&
        attacker.id === "enemy"
      ) {
        attacker.aiLastBaseSkillTurn = this.turn;
      }
      const oncePerBattle =
        Boolean(skill.oncePerBattle) ||
        skill.effectLogic === "vram-overflow";
      const ultimateDamageMultiplier =
        skill.skillType === "ultimate" || skill.type === "ultimate"
          ? attacker.modifiers.ultimateDamageMultiplier
          : 1;
      const skillDamageMultiplier =
        attacker.modifiers.skillDamageMultiplier;
      if (
        oncePerBattle &&
        !attacker.usedOnceSkills.includes(skill.id)
      ) {
        attacker.usedOnceSkills.push(skill.id);
      }

      this.emit(BATTLE_EVENTS.SKILL_USED, {
        fighterId: attacker.id,
        targetId: target.id,
        skillId: skill.id,
        skillName: skill.name,
        skillType: skill.skillType || skill.type,
        effectLogic: skill.effectLogic,
        description: skill.description || "",
        energyAfter: attacker.energy,
        tokenAfter: attacker.token,
        energyCost,
        tokenCost,
      });
      if (tokenCost > 0) {
        this.emit(BATTLE_EVENTS.TOKEN_CHANGED, {
          fighterId: attacker.id,
          token: attacker.token,
          maxToken: attacker.maxToken,
          amount: -tokenCost,
          source: "skill",
          skillId: skill.id,
        });
      }

      let damageEvent = null;
      switch (skill.effectLogic) {
        case "gpt-multimodal-parse": {
          damageEvent = this._attackOnce(attacker, target, {
            source: "skill",
            skillId: skill.id,
            skillName: skill.name,
            attackMultiplier:
              skill.attackMultiplier * skillDamageMultiplier,
            defenseIgnoreRatio: 0,
            damageType: "多模态",
            allowCritical: false,
            canStun: false,
          });
          const elementalTarget = this._getFighter(damageEvent.targetId);
          if (
            damageEvent.hit &&
            elementalTarget &&
            elementalTarget.hp > 0
          ) {
            this._applyGptElementalEffect(
              attacker,
              elementalTarget,
              skill,
            );
          }
          break;
        }

        case "gpt-data-flood": {
          const trueDamage = Math.round(
            getEffectiveAttack(attacker) *
              skill.attackMultiplier *
              ultimateDamageMultiplier *
              skillDamageMultiplier,
          );
          damageEvent = this._attackOnce(attacker, target, {
            source: "skill",
            skillId: skill.id,
            skillName: skill.name,
            trueDamageAmount: trueDamage,
            damageType: "真实",
            allowCritical: false,
            canStun: false,
          });
          this._healFighter(
            attacker,
            Math.round(attacker.maxHp * skill.selfHealRatio),
            "skill",
            skill.name,
            skill.id,
          );
          break;
        }

        case "claude-long-summary": {
          damageEvent = this._attackOnce(attacker, target, {
            source: "skill",
            skillId: skill.id,
            skillName: skill.name,
            attackMultiplier:
              skill.attackMultiplier *
              ultimateDamageMultiplier *
              skillDamageMultiplier,
            defenseIgnoreRatio: 0,
            damageType: "总结",
            allowCritical: false,
            canStun: false,
          });
          const shieldAmount = Math.max(
            1,
            Math.round(attacker.maxHp * skill.shieldRatio),
          );
          attacker.status.shield = {
            amount: shieldAmount,
            duration: Math.max(1, Number(skill.shieldDuration) || 2),
            createdTurn: this.turn,
          };
          this.emit(BATTLE_EVENTS.STATUS_APPLIED, {
            fighterId: attacker.id,
            targetId: attacker.id,
            status: "shield",
            label: "长篇总结护盾",
            amount: shieldAmount,
            duration: attacker.status.shield.duration,
          });
          break;
        }

        case "claude-safety-guard": {
          damageEvent = this._attackOnce(attacker, target, {
            source: "skill",
            skillId: skill.id,
            skillName: skill.name,
            attackMultiplier:
              skill.attackMultiplier *
              ultimateDamageMultiplier *
              skillDamageMultiplier,
            defenseIgnoreRatio: 0,
            damageType: "安全协议",
            allowCritical: false,
            canStun: false,
          });
          const stunTarget = this._getFighter(damageEvent.targetId);
          if (
            damageEvent.hit &&
            stunTarget &&
            stunTarget.hp > 0
          ) {
            stunTarget.status.stunnedActions = Math.max(
              stunTarget.status.stunnedActions,
              Math.max(1, Number(skill.stunActions) || 1),
            );
            this.emit(BATTLE_EVENTS.STUN_APPLIED, {
              attackerId: attacker.id,
              targetId: stunTarget.id,
              remainingStunActions: stunTarget.status.stunnedActions,
              skillId: skill.id,
              skillName: skill.name,
            });
          }
          this._healFighter(
            attacker,
            Math.round(attacker.maxHp * skill.selfHealRatio),
            "skill",
            skill.name,
            skill.id,
          );
          break;
        }

        case "deepseek-refactor": {
          damageEvent = this._attackOnce(attacker, target, {
            source: "skill",
            skillId: skill.id,
            skillName: skill.name,
            attackMultiplier:
              skill.attackMultiplier * skillDamageMultiplier,
            defenseIgnoreRatio: skill.defenseIgnoreRatio,
            damageType: "代码",
            allowCritical: false,
            canStun: false,
          });
          break;
        }

        case "deepseek-overload": {
          const hpCost = Math.min(
            Math.max(0, attacker.hp - 1),
            Math.max(1, Math.round(attacker.hp * skill.selfHpCostRatio)),
          );
          attacker.hp = Math.max(0, attacker.hp - hpCost);
          attacker.stats.damageTaken += hpCost;
          this._checkLowHpTrashTalk(attacker);
          this.emit(BATTLE_EVENTS.SELF_DAMAGE, {
            fighterId: attacker.id,
            amount: hpCost,
            hpAfter: attacker.hp,
            maxHp: attacker.maxHp,
            skillId: skill.id,
            skillName: skill.name,
          });
          const lostHp = Math.max(0, attacker.maxHp - attacker.hp);
          const trueDamage = Math.max(
            1,
            Math.round(
              lostHp *
                skill.lostHpDamageRatio *
                ultimateDamageMultiplier *
                skillDamageMultiplier,
            ),
          );
          damageEvent = this._attackOnce(attacker, target, {
            source: "skill",
            skillId: skill.id,
            skillName: skill.name,
            trueDamageAmount: trueDamage,
            damageType: "真实",
            allowCritical: false,
            canStun: false,
          });
          break;
        }

        case "sora-video-render": {
          const summonDuration =
            Math.max(1, Number(skill.summonDuration) || 2) *
            attacker.modifiers.summonDurationMultiplier;
          const summon = {
            id: "phantom-" + ++this.summonSequence,
            ownerId: attacker.id,
            attack: Math.max(
              1,
              Math.round(attacker.atk * skill.summonAttackRatio),
            ),
            remainingTurns: summonDuration,
            createdAtTurn: this.turn,
            attackMultiplier: 1,
            buffTurns: 0,
            maxHp: summonDuration * 10,
            hp: summonDuration * 10,
          };
          attacker.summons.push(summon);
          this.emit(BATTLE_EVENTS.PHANTOM_SUMMON, {
            fighterId: attacker.id,
            attack: summon.attack,
            persistent: true,
            duration: summon.remainingTurns,
            maxHp: summon.maxHp,
            summonId: summon.id,
            skillId: skill.id,
            skillName: skill.name,
          });
          break;
        }

        case "sora-spacetime-generation": {
          damageEvent = this._attackOnce(attacker, target, {
            source: "skill",
            skillId: skill.id,
            skillName: skill.name,
            attackMultiplier:
              skill.attackMultiplier *
              ultimateDamageMultiplier *
              skillDamageMultiplier,
            defenseIgnoreRatio: 0,
            damageType: "时空",
            allowCritical: false,
            canStun: false,
          });
          attacker.summons.forEach((summon) => {
            summon.attackMultiplier = Math.max(
              summon.attackMultiplier,
              Number(skill.summonBuffMultiplier) || 2,
            );
            summon.buffTurns = Math.max(
              summon.buffTurns,
              Number(skill.summonBuffDuration) || 3,
            );
          });
          this.emit(BATTLE_EVENTS.STATUS_APPLIED, {
            fighterId: attacker.id,
            targetId: attacker.id,
            status: "summon-buff",
            label: "时空增幅",
            amount: attacker.summons.length,
            duration: Number(skill.summonBuffDuration) || 3,
          });
          break;
        }

        case "jailbreak-mode": {
          const hpCost = Math.min(
            Math.max(0, attacker.hp - 1),
            Math.max(
              0,
              Math.round(
                attacker.hp *
                  (attacker.modifiers.selfHpCostRatio || 0.5),
              ),
            ),
          );
          attacker.hp = Math.max(0, attacker.hp - hpCost);
          attacker.stats.damageTaken += hpCost;
          this._checkLowHpTrashTalk(attacker);
          this.emit(BATTLE_EVENTS.SELF_DAMAGE, {
            fighterId: attacker.id,
            amount: hpCost,
            hpAfter: attacker.hp,
            maxHp: attacker.maxHp,
            skillId: skill.id,
            skillName: skill.name,
          });
          this._addEnergy(attacker, attacker.maxEnergy - attacker.energy);
          this.emit(BATTLE_EVENTS.STATUS_APPLIED, {
            fighterId: attacker.id,
            targetId: attacker.id,
            status: "energy-filled",
            label: "越狱模式",
            description: `消耗 ${hpCost} 点生命并充满能量`,
            duration: 1,
            skillId: skill.id,
          });
          break;
        }

        case "moral-review":
          target.status.forceNextMiss = Math.max(
            1,
            target.status.forceNextMiss,
          );
          target.status.skillLockTurns = Math.max(
            1,
            target.status.skillLockTurns,
          );
          this.emit(BATTLE_EVENTS.STATUS_APPLIED, {
            fighterId: attacker.id,
            targetId: target.id,
            status: "moral-review",
            label: "道德审查",
            description: "下一次攻击必定闪避，且下回合无法使用技能",
            duration: 1,
            skillId: skill.id,
          });
          break;

        case "security-audit":
          this._healFighter(
            attacker,
            Math.round(attacker.maxHp * skill.healRatio),
            "skill",
            skill.name,
            skill.id,
          );
          break;

        case "vram-overflow": {
          const trueDamage = Math.max(
            1,
            Math.round(
              attacker.hp *
                attacker.modifiers.trueDamageHpRatio *
                ultimateDamageMultiplier *
                skillDamageMultiplier,
            ),
          );
          damageEvent = this._attackOnce(attacker, target, {
            source: "ultimate",
            skillId: skill.id,
            skillName: skill.name,
            trueDamageAmount: trueDamage,
            damageType: "真实",
            allowCritical: false,
            canStun: false,
            ignoreImmunity: true,
          });
          attacker.ultimateUsed = true;
          attacker.status.stunnedActions = Math.max(
            attacker.status.stunnedActions,
            Math.max(
              1,
              Math.round(attacker.modifiers.selfStunActions) || 1,
            ),
          );
          this.emit(BATTLE_EVENTS.ULTIMATE, {
            fighterId: attacker.id,
            targetId: target.id,
            amount: damageEvent.amount,
            calculatedDamage: damageEvent.calculatedDamage,
            trueDamage: true,
            selfStunned: attacker.status.stunnedActions,
            hpAfter: target.hp,
            skillId: skill.id,
          });
          break;
        }

        default:
          if (skill.type === "heal") {
            this._healFighter(
              attacker,
              Math.round(
                attacker.maxHp * (Number(skill.healRatio) || 0),
              ),
              "skill",
              skill.name,
              skill.id,
            );
          }
          break;
      }

      if (
        (skill.skillType === "ultimate" || skill.type === "ultimate") &&
        attacker.modifiers.postUltimateStunActions > 0
      ) {
        attacker.status.stunnedActions = Math.max(
          attacker.status.stunnedActions,
          Math.max(
            1,
            Math.round(attacker.modifiers.postUltimateStunActions),
          ),
        );
        this.emit(BATTLE_EVENTS.BOND_TRIGGERED, {
          fighterId: attacker.id,
          bondId: "compute_overdraft",
          bondName: "算力透支",
          description: "大招过载，自身眩晕 1 回合",
        });
      }

      this._checkBattleEnd();
    }

    _healFighter(fighter, requestedHeal, source, skillName, skillId) {
      if (!fighter || fighter.hp <= 0) {
        return 0;
      }

      const healed = Math.min(
        Math.max(0, Math.round(requestedHeal)),
        fighter.maxHp - fighter.hp,
      );
      if (healed <= 0) {
        return 0;
      }

      fighter.hp += healed;
      fighter.stats.healingDone += healed;
      this.emit(BATTLE_EVENTS.HEAL, {
        fighterId: fighter.id,
        amount: healed,
        hpAfter: fighter.hp,
        maxHp: fighter.maxHp,
        source,
        skillName: skillName || "",
        skillId: skillId || null,
      });
      return healed;
    }

    _applyGptElementalEffect(attacker, target, skill) {
      const effects =
        Array.isArray(skill.elementalEffects) &&
        skill.elementalEffects.length > 0
          ? skill.elementalEffects
          : ["frost"];
      const effect = effects[randomIndex(effects.length, this.random)];
      let label = "";
      let description = "";

      if (effect === "frost") {
        label = "冰霜减速";
        description = "攻击力降低 25%，持续 2 次行动";
        target.status.slow = {
          attackReduction: 0.25,
          duration: 2,
        };
      } else if (effect === "burn") {
        label = "火焰灼烧";
        const burnDamage = Math.max(
          1,
          Math.round(getEffectiveAttack(attacker) * 0.2),
        );
        description = `每次行动开始时受到 ${burnDamage} 点灼烧伤害，持续 2 次行动`;
        target.status.burn = {
          damage: burnDamage,
          duration: 2,
        };
      } else {
        label = "雷电破甲";
        description = "防御力降低 30%，持续 2 次行动";
        target.status.armorBreak = {
          defenseReduction: 0.3,
          duration: 2,
        };
      }

      this.emit(BATTLE_EVENTS.STATUS_APPLIED, {
        fighterId: attacker.id,
        targetId: target.id,
        status: effect,
        label,
        description,
        duration: 2,
        skillId: skill.id,
      });
    }

    _processSummons(attacker, target) {
      if (!attacker.summons.length || target.hp <= 0) {
        return false;
      }

      const available = attacker.summons.filter(
        (summon) =>
          summon.remainingTurns > 0 &&
          summon.createdAtTurn < this.turn,
      );

      for (const summon of available) {
        if (target.hp <= 0 || this.status === BATTLE_STATUS.FINISHED) {
          break;
        }

        const attack = Math.max(
          1,
          Math.round(summon.attack * summon.attackMultiplier),
        );
        this.emit(BATTLE_EVENTS.SUMMON_ATTACK, {
          fighterId: attacker.id,
          targetId: target.id,
          summonId: summon.id,
          attack,
          remainingTurns: summon.remainingTurns,
          buffTurns: summon.buffTurns,
        });
        const summonHit = this._attackOnce(
          attacker,
          target,
          {
            source: "phantom",
            skillId: "summon-auto-attack",
            skillName: "幻影追击",
            attackMultiplier: 1,
            defenseIgnoreRatio: attacker.modifiers.defenseIgnoreRatio,
            damageType: "幻影",
            allowCritical: false,
            canStun: false,
          },
          attack,
        );
        if (
          summonHit.hit &&
          attacker.modifiers.summonEnergyOnHit > 0
        ) {
          this._addEnergy(attacker, attacker.modifiers.summonEnergyOnHit);
        }

        summon.remainingTurns -= 1;
        if (summon.buffTurns > 0) {
          summon.buffTurns -= 1;
          if (summon.buffTurns === 0) {
            summon.attackMultiplier = 1;
          }
        }

        if (this._checkBattleEnd()) {
          break;
        }
      }

      attacker.summons = attacker.summons.filter(
        (summon) => summon.remainingTurns > 0,
      );
      return this.status === BATTLE_STATUS.FINISHED;
    }

    _tickEndTurnStatuses(fighter) {
      if (
        fighter.status.shield.duration > 0 &&
        fighter.status.shield.createdTurn < this.turn
      ) {
        fighter.status.shield.duration -= 1;
        if (fighter.status.shield.duration === 0) {
          fighter.status.shield.amount = 0;
          this.emit(BATTLE_EVENTS.STATUS_EXPIRED, {
            fighterId: fighter.id,
            status: "shield",
            label: "护盾",
          });
        }
      }

      if (fighter.status.slow.duration > 0) {
        fighter.status.slow.duration -= 1;
        if (fighter.status.slow.duration === 0) {
          fighter.status.slow.attackReduction = 0;
          this.emit(BATTLE_EVENTS.STATUS_EXPIRED, {
            fighterId: fighter.id,
            status: "slow",
            label: "冰霜减速",
          });
        }
      }

      if (fighter.status.armorBreak.duration > 0) {
        fighter.status.armorBreak.duration -= 1;
        if (fighter.status.armorBreak.duration === 0) {
          fighter.status.armorBreak.defenseReduction = 0;
          this.emit(BATTLE_EVENTS.STATUS_EXPIRED, {
            fighterId: fighter.id,
            status: "armor-break",
            label: "雷电破甲",
          });
        }
      }

      if (fighter.status.skillLockTurns > 0) {
        fighter.status.skillLockTurns -= 1;
        if (fighter.status.skillLockTurns === 0) {
          this.emit(BATTLE_EVENTS.STATUS_EXPIRED, {
            fighterId: fighter.id,
            status: "moral-review-lock",
            label: "道德审查技能封锁",
          });
        }
      }
    }

    _addEnergy(fighter, amount) {
      if (amount <= 0 || fighter.hp <= 0) {
        return 0;
      }

      const previous = fighter.energy;
      fighter.energy = Math.min(
        fighter.maxEnergy,
        fighter.energy + Math.round(amount),
      );
      if (fighter.energy !== previous) {
        this.emit(BATTLE_EVENTS.ENERGY_CHANGED, {
          fighterId: fighter.id,
          energy: fighter.energy,
          maxEnergy: fighter.maxEnergy,
          amount: fighter.energy - previous,
        });
      }
      return fighter.energy - previous;
    }

    _finishAction(attacker) {
      if (this.status === BATTLE_STATUS.FINISHED) {
        return;
      }

      const turnEndDamage = Math.max(
        0,
        Math.round(attacker.modifiers.turnEndSelfDamage),
      );
      if (turnEndDamage > 0) {
        const appliedDamage = Math.min(attacker.hp, turnEndDamage);
        attacker.hp = Math.max(0, attacker.hp - appliedDamage);
        attacker.stats.damageTaken += appliedDamage;
        this._checkLowHpTrashTalk(attacker);
        this.emit(BATTLE_EVENTS.SELF_DAMAGE, {
          fighterId: attacker.id,
          amount: appliedDamage,
          hpAfter: attacker.hp,
          maxHp: attacker.maxHp,
          skillId: "compute_frenzy",
          skillName: "狂热算力",
        });
        if (this._checkBattleEnd()) {
          return;
        }
      }

      this._tickEndTurnStatuses(attacker);
      this.activeSide = attacker.id === "player" ? "enemy" : "player";
      this.emit(BATTLE_EVENTS.TURN_END, {
        fighterId: attacker.id,
        nextActiveSide: this.activeSide,
        turn: this.turn,
        round: this.round,
        nextRound:
          this.activeSide === "player" ? this.round + 1 : this.round,
      });

      if (this.activeSide === "player") {
        this.round += 1;
      }
    }

    chooseAiAction(fighterId = "enemy") {
      const fighter = this._getFighter(fighterId);
      if (!fighter) {
        return { type: "basic" };
      }

      const skills = this.getSkillStates(fighterId);
      const hpRatio = fighter.hp / fighter.maxHp;
      const healSkill = skills.find(
        (skill) => skill.type === "heal" && skill.usable,
      );
      if (hpRatio < this.sourceData.rules.aiHealThreshold && healSkill) {
        return { type: "skill", skillId: healSkill.id };
      }

      const ultimateSkill = skills.find(
        (skill) => skill.type === "ultimate" && skill.usable,
      );
      if (ultimateSkill) {
        return { type: "skill", skillId: ultimateSkill.id };
      }

      const controlSkill = skills.find(
        (skill) => skill.type === "control" && skill.usable,
      );
      if (controlSkill) {
        return { type: "skill", skillId: controlSkill.id };
      }

      const utilitySkill = skills.find(
        (skill) =>
          skill.type === "utility" &&
          skill.usable &&
          fighter.energy < 40,
      );
      if (utilitySkill) {
        return { type: "skill", skillId: utilitySkill.id };
      }

      const baseSkill = skills.find(
        (skill) =>
          skill.type === "base" &&
          skill.usable &&
          fighter.energy >= skill.energyCost &&
          this.turn - fighter.aiLastBaseSkillTurn >= 8,
      );
      if (baseSkill) {
        return { type: "skill", skillId: baseSkill.id };
      }

      return { type: "basic" };
    }

    _getActiveSkill(fighter, skillId) {
      const character = getCharacter(fighter.characterId, this.sourceData);
      if (character) {
        for (const skill of [
          character.baseSkill,
          character.ultimateSkill,
        ]) {
          if (skill && skill.id === skillId) {
            return skill;
          }
        }
      }

      for (const promptId of fighter.promptIds) {
        const prompt = getPrompt(promptId, this.sourceData);
        if (prompt && prompt.active && prompt.active.id === skillId) {
          return prompt.active;
        }
      }
      return null;
    }

    getSkillStates(fighterId) {
      const fighter = this._getFighter(fighterId);
      if (!fighter) {
        return [];
      }

      const character = getCharacter(fighter.characterId, this.sourceData);
      const definitions = [];

      if (character && character.baseSkill) {
        definitions.push({
          skill: character.baseSkill,
          category: "基础技能",
        });
      }
      if (character && character.ultimateSkill) {
        definitions.push({
          skill: character.ultimateSkill,
          category: "角色大招",
        });
      }
      fighter.promptIds.forEach((promptId) => {
        const prompt = getPrompt(promptId, this.sourceData);
        if (prompt && prompt.active) {
          definitions.push({
            skill: prompt.active,
            category: "Prompt技能",
          });
        }
      });

      return definitions.map(({ skill, category }) => {
          const cost = getSkillEnergyCost(fighter, skill);
          const tokenCost = getSkillTokenCost(
            fighter,
            skill,
            this.sourceData,
          );
          const type =
            skill.skillType || skill.type || "prompt";
          const oncePerBattle =
            Boolean(skill.oncePerBattle) ||
            skill.effectLogic === "vram-overflow";
          let reason = "";

          if (this.status === BATTLE_STATUS.FINISHED || fighter.hp <= 0) {
            reason = "战斗已结束";
          } else if (fighter.status.stunnedActions > 0) {
            reason = "眩晕中";
          } else if (
            this.globalEvent &&
            this.globalEvent.effectLogic === "skills-disabled"
          ) {
            reason = "算力挤占";
          } else if (fighter.status.skillLockTurns > 0) {
            reason = "技能封锁";
          } else if (this.activeSide !== fighterId) {
            reason = "等待行动";
          } else if (fighter.energy < cost) {
            reason = "能量不足";
          } else if (fighter.token < tokenCost) {
            reason = "Token不足";
          } else if (
            oncePerBattle &&
            fighter.usedOnceSkills.includes(skill.id)
          ) {
            reason = "本场已使用";
          }

          const requiredPromptCount =
            fighter.modifiers.requiredPromptCount ||
            this.sourceData.rules.maxPromptSlots;
          if (
            skill.effectLogic === "vram-overflow" &&
            fighter.promptIds.length < requiredPromptCount &&
            !reason
          ) {
            reason = "词条数量不足";
          }

          return {
            id: skill.id,
            name: skill.name,
            type,
            category,
            description: skill.description || "",
            effectLogic: skill.effectLogic || type,
            energyCost: cost,
            tokenCost,
            healRatio: Number(skill.healRatio) || 0,
            oncePerBattle,
            usable: !reason,
            reason,
          };
        });
    }

    _trySummonPhantom(attacker, target) {
      const chance = clamp(Number(attacker.trait.chance) || 0, 0, 1);
      if (this.random() >= chance) {
        return;
      }

      this.emit(BATTLE_EVENTS.PHANTOM_SUMMON, {
        fighterId: attacker.id,
        attack: attacker.trait.attack,
      });

      const summonHit = this._attackOnce(
        attacker,
        target,
        {
          source: "phantom",
          attackMultiplier: 1,
          defenseIgnoreRatio: attacker.modifiers.defenseIgnoreRatio,
          phantomAttack: attacker.trait.attack,
          allowCritical: false,
          canStun: false,
        },
        attacker.trait.attack,
      );
      if (
        summonHit.hit &&
        attacker.modifiers.summonEnergyOnHit > 0
      ) {
        this._addEnergy(attacker, attacker.modifiers.summonEnergyOnHit);
      }

      this._checkBattleEnd();
    }

    _triggerTrashTalk(fighter, situation, opponent) {
      if (!fighter || fighter.hp <= 0) {
        return null;
      }
      return this.emit(BATTLE_EVENTS.TRASH_TALK_TRIGGER, {
        speakerId: fighter.id,
        speakerName: fighter.name,
        opponentId: opponent ? opponent.id : null,
        opponentName: opponent ? opponent.name : "",
        situation,
      });
    }

    _checkLowHpTrashTalk(fighter) {
      if (
        !fighter ||
        fighter.hp <= 0 ||
        fighter.trashTalkFlags.lowHp ||
        fighter.hp / fighter.maxHp >= 0.2
      ) {
        return false;
      }

      fighter.trashTalkFlags.lowHp = true;
      this._triggerTrashTalk(
        fighter,
        "你的生命值首次低于20%，进入危险状态，但仍要嘲讽对手",
        fighter.id === "player" ? this.enemy : this.player,
      );
      return true;
    }

    _attackOnce(attacker, target, options, forcedAttack) {
      const forcedMiss = attacker.status.forceNextMiss > 0;
      if (forcedMiss) {
        attacker.status.forceNextMiss -= 1;
      }
      const selfHit =
        !forcedMiss &&
        options.source !== "burn" &&
        attacker.modifiers.selfHitChance > 0 &&
        this.random() < attacker.modifiers.selfHitChance;
      const hitTarget = selfHit ? attacker : target;

      const missChance =
        clamp(Number(hitTarget.trait.evasionChance) || 0, 0, 1) +
        clamp(Number(hitTarget.modifiers.evasionChance) || 0, 0, 1) +
        clamp(Number(this.sourceData.rules.baseMissChance) || 0, 0, 1);
      const missed =
        forcedMiss || (missChance > 0 && this.random() < missChance);

      const guarded =
        !missed &&
        !options.ignoreImmunity &&
        hitTarget.trait.kind === "damage-immunity" &&
        this.random() < clamp(Number(hitTarget.trait.chance) || 0, 0, 1);

      const critical =
        Boolean(options.allowCritical) &&
        !missed &&
        !guarded &&
        attacker.trait.kind === "critical-hit" &&
        this.random() < clamp(Number(attacker.trait.chance) || 0, 0, 1);

      const attackingFighter = Object.assign({}, attacker);
      if (Number.isFinite(forcedAttack)) {
        attackingFighter.atk = Math.max(0, forcedAttack);
      } else {
        attackingFighter.atk = getEffectiveAttack(attacker);
      }

      const defendingTarget = Object.assign({}, hitTarget, {
        def: getEffectiveDefense(hitTarget),
      });
      const result = Number.isFinite(options.trueDamageAmount)
        ? calculateDamage({
            attacker: attackingFighter,
            target: defendingTarget,
            trueDamage: options.trueDamageAmount,
          })
        : calculateDamage({
            attacker: attackingFighter,
            target: defendingTarget,
            attackMultiplier: options.attackMultiplier,
            defenseIgnoreRatio: options.defenseIgnoreRatio,
            defenseScale: options.defenseScale,
            critical,
            criticalMultiplier:
              attacker.trait.kind === "critical-hit"
                ? attacker.trait.multiplier
                : 1,
          });

      const calculatedDamage =
        missed || guarded
          ? 0
          : result.damage + Math.max(0, Number(options.flatDamageBonus) || 0);
      let shieldAbsorbed = 0;
      if (
        calculatedDamage > 0 &&
        hitTarget.status.shield &&
        hitTarget.status.shield.amount > 0
      ) {
        shieldAbsorbed = Math.min(
          hitTarget.status.shield.amount,
          calculatedDamage,
        );
        hitTarget.status.shield.amount -= shieldAbsorbed;
        this.emit(BATTLE_EVENTS.SHIELD_ABSORBED, {
          attackerId: attacker.id,
          targetId: hitTarget.id,
          amount: shieldAbsorbed,
          shieldRemaining: hitTarget.status.shield.amount,
        });
      }

      const hpDamage = Math.max(0, calculatedDamage - shieldAbsorbed);
      const actualDamage = Math.min(hitTarget.hp, hpDamage);
      hitTarget.hp = Math.max(0, hitTarget.hp - actualDamage);
      hitTarget.stats.damageTaken += actualDamage;
      attacker.stats.damageDealt += actualDamage;
      attacker.stats.attacks += 1;
      this._recordDamage(attacker, hitTarget, actualDamage);

      if (
        actualDamage > 0 &&
        hitTarget.hp > 0 &&
        hitTarget.modifiers.damageTakenAtkGain > 0
      ) {
        const gain = hitTarget.modifiers.damageTakenAtkGain;
        hitTarget.atk += gain;
        hitTarget.dynamicAtkGain += gain;
        this.emit(BATTLE_EVENTS.STAT_CHANGED, {
          fighterId: hitTarget.id,
          stat: "atk",
          amount: gain,
          value: hitTarget.atk,
          source: "上下文记忆",
        });
        const refillBond = hitTarget.bonds.find(
          (bond) => bond.id === "infinite_refill",
        );
        if (refillBond) {
          this.emit(BATTLE_EVENTS.BOND_TRIGGERED, {
            fighterId: hitTarget.id,
            bondId: refillBond.id,
            bondName: refillBond.name,
            description: "上下文记忆成长提升至 4 ATK",
          });
        }
      }

      let stunApplied = false;
      if (
        options.canStun &&
        !missed &&
        !guarded &&
        hitTarget.hp > 0 &&
        attacker.modifiers.stunChance > 0 &&
        this.random() < attacker.modifiers.stunChance
      ) {
        hitTarget.status.stunnedActions = Math.max(
          1,
          hitTarget.status.stunnedActions,
        );
        stunApplied = true;
      }

      let damageType = options.damageType || "普通";
      if (
        !options.damageType &&
        attacker.trait.kind === "random-damage-type" &&
        Array.isArray(attacker.trait.damageTypes) &&
        attacker.trait.damageTypes.length > 0
      ) {
        damageType =
          attacker.trait.damageTypes[
            randomIndex(attacker.trait.damageTypes.length, this.random)
          ];
      }

      const damageEvent = this.emit(BATTLE_EVENTS.DAMAGE, {
        attackerId: attacker.id,
        targetId: hitTarget.id,
        amount: actualDamage,
        calculatedDamage,
        shieldAbsorbed,
        hpDamage,
        overkill: Math.max(0, hpDamage - actualDamage),
        missed,
        forcedMiss,
        critical,
        guarded,
        stunApplied,
        damageType,
        source: options.source,
        attackIndex: options.attackIndex || 1,
        attackCount: options.attackCount || 1,
        effectiveDefense: result.effectiveDefense,
        skillId: options.skillId || null,
        skillName: options.skillName || null,
        trueDamage: result.trueDamage,
        selfHit,
        bondId: selfHit ? "cyber_psychosis" : null,
        bondName: selfHit ? "赛博精神病" : null,
        hpAfter: hitTarget.hp,
        maxHp: hitTarget.maxHp,
        hit: !missed && !guarded,
      });

      const lowHpTriggered = this._checkLowHpTrashTalk(hitTarget);
      if (!lowHpTriggered) {
        const verbalOpponent =
          hitTarget.id === attacker.id ? target : attacker;
        if (missed && !forcedMiss) {
          this._triggerTrashTalk(
            hitTarget,
            "你刚刚成功闪避了对手的攻击",
            verbalOpponent,
          );
        } else if (critical && !guarded) {
          this._triggerTrashTalk(
            hitTarget,
            "你刚刚被对手打出了暴击，虽然受伤但仍要嘲讽对手",
            verbalOpponent,
          );
        }
      }

      if (
        !missed &&
        !guarded &&
        options.source !== "burn" &&
        attacker.modifiers.energyOnHit > 0
      ) {
        const gainedEnergy = this._addEnergy(
          attacker,
          attacker.modifiers.energyOnHit,
        );
        const efficientBond = attacker.bonds.find(
          (bond) => bond.id === "efficient_operation",
        );
        if (efficientBond && gainedEnergy > 0) {
          this.emit(BATTLE_EVENTS.BOND_TRIGGERED, {
            fighterId: attacker.id,
            bondId: efficientBond.id,
            bondName: efficientBond.name,
            description: "命中恢复 10 能量并触发元素伤害",
          });
        }
      }

      if (stunApplied) {
        this.emit(BATTLE_EVENTS.STUN_APPLIED, {
          attackerId: attacker.id,
          targetId: hitTarget.id,
          remainingStunActions: hitTarget.status.stunnedActions,
          stunSourceName: attacker.promptIds.includes("hallucination")
            ? "幻觉污染"
            : "控制效果",
        });
      }

      return damageEvent;
    }

    canUseSkill(fighterId, skillId, ignoreExecutionLock = false) {
      const fighter = this._getFighter(fighterId);
      if (
        !fighter ||
        this.status === BATTLE_STATUS.FINISHED ||
        (this.isActionLocked && !ignoreExecutionLock) ||
        fighter.hp <= 0 ||
        fighter.status.stunnedActions > 0 ||
        (this.globalEvent &&
          this.globalEvent.effectLogic === "skills-disabled") ||
        fighter.status.skillLockTurns > 0 ||
        this.activeSide !== fighterId
      ) {
        return false;
      }

      const skill = this._getActiveSkill(fighter, skillId);
      if (!skill) {
        return false;
      }

      const cost = getSkillEnergyCost(fighter, skill);
      const tokenCost = getSkillTokenCost(
        fighter,
        skill,
        this.sourceData,
      );
      if (fighter.energy < cost) {
        return false;
      }
      if (fighter.token < tokenCost) {
        return false;
      }

      if (skill.effectLogic === "vram-overflow") {
        const requiredPromptCount =
          fighter.modifiers.requiredPromptCount ||
          this.sourceData.rules.maxPromptSlots;
        return (
          fighter.promptIds.length >= requiredPromptCount &&
          !fighter.usedOnceSkills.includes(skill.id)
        );
      }

      const oncePerBattle =
        Boolean(skill.oncePerBattle) ||
        skill.effectLogic === "vram-overflow";
      if (oncePerBattle && fighter.usedOnceSkills.includes(skill.id)) {
        return false;
      }

      return true;
    }

    canCastUltimate(fighterId = "player") {
      const fighter = this._getFighter(fighterId);
      const character = fighter
        ? getCharacter(fighter.characterId, this.sourceData)
        : null;
      return Boolean(
        character &&
          character.ultimateSkill &&
          this.canUseSkill(fighterId, character.ultimateSkill.id),
      );
    }

    // 兼容旧 API：大招现在同样会消耗当前行动。
    castUltimate(fighterId = "player") {
      if (!this.canCastUltimate(fighterId)) {
        return null;
      }
      const fighter = this._getFighter(fighterId);
      const character = getCharacter(fighter.characterId, this.sourceData);
      return this.performAction(fighterId, {
        type: "skill",
        skillId: character.ultimateSkill.id,
      });
    }

    replacePrompt(fighterId, outgoingPromptId, incomingPromptId) {
      const fighter = this._getFighter(fighterId);
      if (!fighter) {
        throw new Error("未知战斗角色：" + fighterId);
      }
      if (!fighter.promptIds.includes(outgoingPromptId)) {
        throw new Error("要替换的 Prompt 不在当前阵容中。");
      }
      if (fighter.promptIds.includes(incomingPromptId)) {
        throw new Error("新 Prompt 已在当前阵容中。");
      }

      const incomingPrompt = getPrompt(incomingPromptId, this.sourceData);
      const character = getCharacter(fighter.characterId, this.sourceData);
      if (
        !incomingPrompt ||
        !character ||
        !isPromptAvailableForCharacter(incomingPrompt, character)
      ) {
        throw new Error("该 Prompt 无法用于当前角色。");
      }

      const nextPromptIds = fighter.promptIds.map((promptId) =>
        promptId === outgoingPromptId ? incomingPromptId : promptId,
      );
      const replacement = createFighter(
        {
          characterId: fighter.characterId,
          promptIds: nextPromptIds,
        },
        fighter.side,
        this.sourceData,
      );

      const hpRatio = fighter.hp / fighter.maxHp;
      replacement.hp = Math.max(
        1,
        Math.min(
          replacement.maxHp,
          Math.round(replacement.maxHp * hpRatio),
        ),
      );
      replacement.energy = Math.min(fighter.energy, replacement.maxEnergy);
      replacement.token = Math.min(fighter.token, replacement.maxToken);
      replacement.atk += fighter.dynamicAtkGain;
      replacement.dynamicAtkGain = fighter.dynamicAtkGain;
      replacement.status = {
        stunnedActions: fighter.status.stunnedActions,
        forceNextMiss: fighter.status.forceNextMiss,
        skillLockTurns: fighter.status.skillLockTurns,
        shield: Object.assign({}, fighter.status.shield),
        slow: Object.assign({}, fighter.status.slow),
        burn: Object.assign({}, fighter.status.burn),
        armorBreak: Object.assign({}, fighter.status.armorBreak),
      };
      replacement.summons = fighter.summons.map((summon) =>
        Object.assign({}, summon),
      );
      replacement.usedOnceSkills = fighter.usedOnceSkills.slice();
      replacement.ultimateUsed = fighter.ultimateUsed;
      replacement.aiLastBaseSkillTurn = fighter.aiLastBaseSkillTurn;
      replacement.stats = Object.assign({}, fighter.stats);
      replacement.trashTalkFlags = Object.assign(
        {},
        fighter.trashTalkFlags,
      );

      this[fighterId] = replacement;
      this.emit(BATTLE_EVENTS.PROMPT_REPLACED, {
        fighterId,
        outgoingPromptId,
        incomingPromptId,
        incomingPromptName: incomingPrompt.name,
        promptIds: nextPromptIds.slice(),
      });
      return this.getSnapshot();
    }

    clearGlobalEvent() {
      this.globalEvent = null;
    }

    applyGlobalEvent(globalEvent) {
      if (!globalEvent) {
        return this.getSnapshot();
      }

      this.globalEvent = Object.assign({}, globalEvent);
      let affectedFighterId = null;

      if (globalEvent.effectLogic === "swap-hp-ratio") {
        const playerRatio = this.player.hp / this.player.maxHp;
        const enemyRatio = this.enemy.hp / this.enemy.maxHp;
        this.player.hp = Math.max(
          1,
          Math.round(this.player.maxHp * enemyRatio),
        );
        this.enemy.hp = Math.max(
          1,
          Math.round(this.enemy.maxHp * playerRatio),
        );
        this._checkLowHpTrashTalk(this.player);
        this._checkLowHpTrashTalk(this.enemy);
      } else if (globalEvent.effectLogic === "swap-atk") {
        const playerAtk = this.player.atk;
        this.player.atk = this.enemy.atk;
        this.enemy.atk = playerAtk;
      } else if (globalEvent.effectLogic === "random-stun") {
        affectedFighterId =
          randomIndex(2, this.random) === 0 ? "player" : "enemy";
        const affected = this._getFighter(affectedFighterId);
        affected.status.stunnedActions = Math.max(
          1,
          affected.status.stunnedActions,
        );
      }

      this.emit(BATTLE_EVENTS.GLOBAL_EVENT, {
        globalEvent: Object.assign({}, globalEvent),
        affectedFighterId,
      });
      return this.getSnapshot();
    }

    _getFighter(fighterId) {
      if (fighterId === "player") {
        return this.player;
      }
      if (fighterId === "enemy") {
        return this.enemy;
      }
      return null;
    }

    _recordDamage(attacker, target, amount) {
      if (!attacker || !target || attacker.id === target.id || amount <= 0) {
        return;
      }
      if (attacker.id === "player") {
        this.playerTotalDamage += amount;
      } else {
        this.enemyTotalDamage += amount;
      }
    }

    _checkBattleEnd() {
      if (this.status === BATTLE_STATUS.FINISHED) {
        return true;
      }

      const playerDead = this.player.hp <= 0;
      const enemyDead = this.enemy.hp <= 0;
      if (!playerDead && !enemyDead) {
        return false;
      }

      const winner =
        playerDead && enemyDead
          ? "draw"
          : enemyDead
            ? "player"
            : "enemy";
      this._finishBattle(winner, "knockout");
      return true;
    }

    _finishBattle(winner, reason) {
      if (this.status === BATTLE_STATUS.FINISHED) {
        return;
      }

      this.status = BATTLE_STATUS.FINISHED;
      this.winner = winner;
      this.totalRounds = this.round;
      this.emit(BATTLE_EVENTS.BATTLE_END, {
        winner,
        reason,
        round: this.round,
        playerHp: this.player.hp,
        enemyHp: this.enemy.hp,
        totalRounds: this.totalRounds,
        playerTotalDamage: this.playerTotalDamage,
        enemyTotalDamage: this.enemyTotalDamage,
      });
    }

    getSnapshot() {
      return {
        status: this.status,
        turn: this.turn,
        round: this.round,
        activeSide: this.activeSide,
        isActionLocked: this.isActionLocked,
        globalEvent: this.globalEvent
          ? Object.assign({}, this.globalEvent)
          : null,
        winner: this.winner,
        totalRounds: this.totalRounds,
        playerTotalDamage: this.playerTotalDamage,
        enemyTotalDamage: this.enemyTotalDamage,
        canAct: this.status === BATTLE_STATUS.RUNNING,
        canPlayerCastUltimate: this.canCastUltimate("player"),
        playerSkills: this.getSkillStates("player"),
        enemySkills: this.getSkillStates("enemy"),
        lastRoundEvents: this.lastRoundEvents.slice(),
        player: this._serializeFighter(this.player),
        enemy: this._serializeFighter(this.enemy),
      };
    }

    _serializeFighter(fighter) {
      return {
        id: fighter.id,
        side: fighter.side,
        characterId: fighter.characterId,
        name: fighter.name,
        role: fighter.role,
        description: fighter.description,
        accent: fighter.accent,
        avatar: fighter.avatar,
        promptIds: fighter.promptIds.slice(),
        trait: Object.assign({}, fighter.trait),
        maxHp: fighter.maxHp,
        hp: fighter.hp,
        atk: fighter.atk,
        def: fighter.def,
        energy: fighter.energy,
        maxEnergy: fighter.maxEnergy,
        token: fighter.token,
        maxToken: fighter.maxToken,
        dynamicAtkGain: fighter.dynamicAtkGain,
        modifiers: Object.assign({}, fighter.modifiers, {
          activeBonds: fighter.modifiers.activeBonds.map((bond) =>
            Object.assign({}, bond),
          ),
        }),
        bonds: fighter.bonds.map((bond) => Object.assign({}, bond)),
        status: {
          stunnedActions: fighter.status.stunnedActions,
          forceNextMiss: fighter.status.forceNextMiss,
          skillLockTurns: fighter.status.skillLockTurns,
          shield: Object.assign({}, fighter.status.shield),
          slow: Object.assign({}, fighter.status.slow),
          burn: Object.assign({}, fighter.status.burn),
          armorBreak: Object.assign({}, fighter.status.armorBreak),
        },
        summons: fighter.summons.map((summon) =>
          Object.assign({}, summon),
        ),
        usedOnceSkills: fighter.usedOnceSkills.slice(),
        ultimateUsed: fighter.ultimateUsed,
        trashTalkFlags: Object.assign({}, fighter.trashTalkFlags),
        stats: Object.assign({}, fighter.stats),
      };
    }
  }

  function createRandomBuild(options = {}) {
    const sourceData = options.data || data;
    const random = options.random || Math.random;
    const characterPool = options.characterPool || sourceData.characters;
    const promptPool = options.promptPool || sourceData.prompts;

    if (characterPool.length === 0 || promptPool.length === 0) {
      throw new Error("随机阵容的角色池和 Prompt 池不能为空。");
    }

    const character =
      characterPool[randomIndex(characterPool.length, random)];
    const characterKeys = new Set([
      character.id.toLowerCase(),
      character.name.toLowerCase(),
    ]);
    const eligiblePromptPool = promptPool.filter((prompt) => {
      if (!prompt.restrictedTo) {
        return true;
      }
      return characterKeys.has(String(prompt.restrictedTo).toLowerCase());
    });
    if (eligiblePromptPool.length < sourceData.rules.maxPromptSlots) {
      throw new Error("当前角色可用的 Prompt 数量不足。");
    }
    const prompts = sampleUnique(
      eligiblePromptPool,
      Math.min(sourceData.rules.maxPromptSlots, eligiblePromptPool.length),
      random,
    );

    return {
      characterId: character.id,
      promptIds: prompts.map(function getPromptId(prompt) {
        return prompt.id;
      }),
    };
  }

  function getModeLabels() {
    return { player: "玩家", enemy: "电脑" };
  }

  class GameController {
    constructor(options = {}) {
      this.sourceData = options.data || data;
      this.random = options.random || Math.random;
      this.aiDelayMs =
        Number(options.aiDelayMs) ||
        this.sourceData.rules.aiDelayMs ||
        1000;
      this.turnHandoffMs =
        Number(options.turnHandoffMs) ||
        this.sourceData.rules.turnHandoffMs ||
        1000;
      this.setTimeoutFn =
        options.setTimeoutFn ||
        globalThis.setTimeout.bind(globalThis);
      this.clearTimeoutFn =
        options.clearTimeoutFn ||
        globalThis.clearTimeout.bind(globalThis);
      this.aiTimer = null;
      this.aiTimerGeneration = 0;
      this.turnUnlockTimer = null;
      this.turnUnlockGeneration = 0;
      this.pendingPromptRefresh = null;
      this.lastPromptRefreshRound = 0;
      this.engine = null;
      this.builds = {};
      this.subscribers = new Set();
      this.battleEventSubscribers = new Set();
      this.state = this._createInitialState();
    }

    _createInitialState() {
      return {
        phase: PHASES.MODE_SELECT,
        mode: null,
        setupSide: "player",
        characterId: null,
        offeredPromptIds: [],
        selectedPromptIds: [],
        turn: 0,
        round: 0,
        activeSide: null,
        aiThinking: false,
        actionLocked: false,
        promptRefresh: null,
        refreshSelectedPromptId: null,
        activeGlobalEvent: null,
        result: null,
      };
    }

    subscribe(listener) {
      if (typeof listener !== "function") {
        throw new TypeError("订阅器必须是函数。");
      }

      this.subscribers.add(listener);
      try {
        listener(this.getState());
      } catch (error) {
        console.error("状态订阅器执行失败：", error);
      }
      return () => this.subscribers.delete(listener);
    }

    subscribeBattleEvents(listener) {
      if (typeof listener !== "function") {
        throw new TypeError("战斗事件订阅器必须是函数。");
      }

      this.battleEventSubscribers.add(listener);
      return () => this.battleEventSubscribers.delete(listener);
    }

    getState() {
      const battle = this.engine ? this.engine.getSnapshot() : null;
      const labels = getModeLabels(this.state.mode);
      const canAct =
        this.state.phase === PHASES.BATTLE &&
        battle &&
        battle.status === BATTLE_STATUS.RUNNING &&
        !this.state.actionLocked &&
        !battle.isActionLocked &&
        battle.activeSide === "player";
      return Object.assign({}, this.state, {
        offeredPromptIds: this.state.offeredPromptIds.slice(),
        selectedPromptIds: this.state.selectedPromptIds.slice(),
        promptRefresh: this.state.promptRefresh
          ? Object.assign({}, this.state.promptRefresh, {
              offeredPromptIds:
                this.state.promptRefresh.offeredPromptIds.slice(),
              currentPromptIds:
                this.state.promptRefresh.currentPromptIds.slice(),
            })
          : null,
        activeGlobalEvent: this.state.activeGlobalEvent
          ? Object.assign({}, this.state.activeGlobalEvent)
          : null,
        builds: {
          player: this.builds.player
            ? {
                characterId: this.builds.player.characterId,
                promptIds: this.builds.player.promptIds.slice(),
              }
            : null,
          enemy: this.builds.enemy
            ? {
                characterId: this.builds.enemy.characterId,
                promptIds: this.builds.enemy.promptIds.slice(),
              }
            : null,
        },
        canStartBattle:
          this.state.phase === PHASES.PROMPT_SELECT &&
          this.state.selectedPromptIds.length ===
            this.sourceData.rules.maxPromptSlots,
        canAct,
        playerLabel: labels.player,
        enemyLabel: labels.enemy,
        battle,
      });
    }

    selectMode(mode) {
      if (this.state.phase !== PHASES.MODE_SELECT) {
        throw new Error("当前不在模式选择阶段。");
      }
      if (mode !== "pve") {
        throw new Error("当前仅支持 PVE 人机对战。");
      }

      this._clearAiTimer();
      this._clearTurnUnlockTimer();
      this.engine = null;
      this.builds = {};
      this.state = Object.assign(this._createInitialState(), {
        phase: PHASES.CHARACTER_SELECT,
        mode,
        setupSide: "player",
      });
      this._notify("mode-selected");
      return this.getState();
    }

    selectCharacter(characterId) {
      if (this.state.phase !== PHASES.CHARACTER_SELECT) {
        throw new Error("当前不在选择角色阶段。");
      }

      if (!getCharacter(characterId, this.sourceData)) {
        throw new Error("未知角色：" + characterId);
      }

      const offeredPrompts = sampleUnique(
        getAvailablePrompts(characterId, this.sourceData),
        this.sourceData.rules.promptOfferCount,
        this.random,
      );

      this.state.characterId = characterId;
      this.state.offeredPromptIds = offeredPrompts.map(function getPromptId(
        prompt,
      ) {
        return prompt.id;
      });
      this.state.selectedPromptIds = [];
      this.state.phase = PHASES.PROMPT_SELECT;
      this._notify("character-selected");

      return this.getState();
    }

    togglePrompt(promptId) {
      if (this.state.phase !== PHASES.PROMPT_SELECT) {
        throw new Error("当前不在装备 Prompt 阶段。");
      }

      if (!this.state.offeredPromptIds.includes(promptId)) {
        throw new Error("该 Prompt 不在本次抽取结果中。");
      }

      const selectedIndex = this.state.selectedPromptIds.indexOf(promptId);
      if (selectedIndex >= 0) {
        this.state.selectedPromptIds.splice(selectedIndex, 1);
      } else {
        if (
          this.state.selectedPromptIds.length >=
          this.sourceData.rules.maxPromptSlots
        ) {
          throw new Error("最多只能装备 3 个 Prompt。");
        }
        this.state.selectedPromptIds.push(promptId);
      }

      this._notify("prompt-toggle");
      return this.getState();
    }

    confirmLoadout(options = {}) {
      if (
        this.state.phase !== PHASES.PROMPT_SELECT ||
        !this.state.characterId
      ) {
        throw new Error("请先完成角色和 Prompt 选择。");
      }

      if (
        this.state.selectedPromptIds.length !==
        this.sourceData.rules.maxPromptSlots
      ) {
        throw new Error("必须装备 3 个 Prompt 才能开始对局。");
      }

      this._clearAiTimer();
      this._clearTurnUnlockTimer();

      const currentBuild = {
        characterId: this.state.characterId,
        promptIds: this.state.selectedPromptIds.slice(),
      };

      this.builds[this.state.setupSide] = currentBuild;

      const enemyBuild =
        options.enemyBuild ||
        createRandomBuild({
          data: this.sourceData,
          random: this.random,
        });

      this.builds.enemy = enemyBuild;
      this._startBattle(this.builds.player, enemyBuild);
      return this.getState();
    }

    startBattle(options = {}) {
      return this.confirmLoadout(options);
    }

    _startBattle(playerBuild, enemyBuild) {
      this._clearAiTimer();
      this._clearTurnUnlockTimer();
      this.state.actionLocked = false;
      this.engine = new BattleEngine({
        data: this.sourceData,
        random: this.random,
        playerBuild,
        enemyBuild,
      });

      this.engine.on("*", (event) => {
        this.battleEventSubscribers.forEach((listener) => listener(event));
      });
      this.engine.on(BATTLE_EVENTS.BATTLE_END, (event) => {
        this._handleBattleEnd(event);
      });

      this.state.phase = PHASES.BATTLE;
      this.state.turn = 0;
      this.state.round = 1;
      this.state.activeSide = "player";
      this.state.aiThinking = false;
      this.state.actionLocked = false;
      this.state.promptRefresh = null;
      this.state.refreshSelectedPromptId = null;
      this.state.activeGlobalEvent = null;
      this.pendingPromptRefresh = null;
      this.lastPromptRefreshRound = 0;
      this.state.result = null;
      this.engine.start();
      this._notify("battle-start");
      return this.getState();
    }

    performBasicAttack() {
      return this._performHumanAction({ type: "basic" });
    }

    performSkill(skillId) {
      return this._performHumanAction({
        type: "skill",
        skillId,
      });
    }

    _performHumanAction(action) {
      const state = this.getState();
      if (
        !state.canAct ||
        !this.engine ||
        this.state.phase !== PHASES.BATTLE
      ) {
        throw new Error("当前没有可以操作的玩家行动阶段。");
      }

      const actingSide = this.engine.activeSide;
      this.state.actionLocked = true;
      try {
        this.engine.performAction(actingSide, action);
      } catch (error) {
        this.state.actionLocked = false;
        this._notify("action-error");
        throw error;
      }
      this.state.turn = this.engine.turn;
      this.state.round = this.engine.round;
      this.state.activeSide = this.engine.activeSide;

      if (this.state.phase !== PHASES.BATTLE) {
        return this.getState();
      }

      this.state.aiThinking =
        this.state.mode === "pve" && this.engine.activeSide === "enemy";

      // 先注册电脑行动，再通知 UI。这样即使某个渲染订阅抛出异常，
      // 也不会阻断 PVE 的战斗流程。
      if (this.state.aiThinking) {
        this._scheduleAiTurn();
      } else {
        this._scheduleTurnUnlock();
      }
      this._notify("action-resolved");
      return this.getState();
    }

    castPlayerUltimate() {
      if (
        this.state.phase !== PHASES.BATTLE ||
        !this.engine ||
        this.engine.activeSide !== "player"
      ) {
        return null;
      }

      const playerCharacter = getCharacter(
        this.engine.player.characterId,
        this.sourceData,
      );
      return playerCharacter && playerCharacter.ultimateSkill
        ? this.performSkill(playerCharacter.ultimateSkill.id)
        : null;
    }

    _scheduleAiTurn() {
      this._clearAiTimer();
      const generation = this.aiTimerGeneration;
      this.aiTimer = this.setTimeoutFn(() => {
        if (generation !== this.aiTimerGeneration) {
          return;
        }
        this.aiTimer = null;
        this._runAiTurn();
      }, this.aiDelayMs);
    }

    _scheduleTurnUnlock() {
      this._clearTurnUnlockTimer();
      const generation = this.turnUnlockGeneration;
      this.state.actionLocked = true;
      this.turnUnlockTimer = this.setTimeoutFn(() => {
        if (generation !== this.turnUnlockGeneration) {
          return;
        }
        this.turnUnlockTimer = null;
        if (this.state.phase !== PHASES.BATTLE) {
          return;
        }
        this.state.actionLocked = false;
        this._notify("turn-unlocked");
      }, this.turnHandoffMs);
    }

    _runAiTurn() {
      if (
        this.state.phase !== PHASES.BATTLE ||
        !this.engine ||
        this.engine.activeSide !== "enemy"
      ) {
        return;
      }

      try {
        const action = this.engine.chooseAiAction("enemy");
        this.engine.performAction("enemy", action);
        this.state.turn = this.engine.turn;
        this.state.round = this.engine.round;
        this.state.activeSide = this.engine.activeSide;
        this.state.aiThinking = false;

        if (this.state.phase === PHASES.BATTLE) {
          if (this._shouldStartPromptRefresh()) {
            this._beginPromptRefresh();
            return;
          }
          this._scheduleTurnUnlock();
          this._notify("ai-action-resolved");
        }
      } catch (error) {
        this._clearAiTimer();
        this._clearTurnUnlockTimer();
        this.state.aiThinking = false;
        this.state.actionLocked = false;
        this.state.activeSide = this.engine.activeSide;
        this._notify("ai-action-error");
        throw error;
      }
    }

    _shouldStartPromptRefresh() {
      return Boolean(
        this.engine &&
          this.state.phase === PHASES.BATTLE &&
          this.engine.status === BATTLE_STATUS.RUNNING &&
          this.engine.round > 0 &&
          this.engine.round % this.sourceData.rules.promptRefreshInterval ===
            0 &&
          this.lastPromptRefreshRound !== this.engine.round,
      );
    }

    _createRefreshOffers(fighterId) {
      const fighter = this.engine._getFighter(fighterId);
      const currentIds = new Set(fighter.promptIds);
      return sampleUnique(
        getAvailablePrompts(fighter.characterId, this.sourceData).filter(
          (prompt) => !currentIds.has(prompt.id),
        ),
        this.sourceData.rules.promptRefreshOfferCount,
        this.random,
      ).map((prompt) => prompt.id);
    }

    _beginPromptRefresh() {
      this._clearAiTimer();
      this._clearTurnUnlockTimer();

      const playerOffers = this._createRefreshOffers("player");
      const enemyOffers = this._createRefreshOffers("enemy");
      const enemyCurrent = this.engine.enemy.promptIds.slice();
      const events = this.sourceData.globalEvents || [];
      const globalEvent =
        events.length > 0
          ? Object.assign(
              {},
              events[randomIndex(events.length, this.random)],
            )
          : null;

      this.pendingPromptRefresh = {
        playerOffers,
        enemyOffers,
        enemyOutgoingPromptId:
          enemyCurrent[
            randomIndex(enemyCurrent.length, this.random)
          ],
        enemyIncomingPromptId:
          enemyOffers[
            randomIndex(enemyOffers.length, this.random)
          ],
        globalEvent,
      };
      this.lastPromptRefreshRound = this.engine.round;
      this.engine.clearGlobalEvent();

      this.state.phase = PHASES.PROMPT_REFRESH;
      this.state.actionLocked = false;
      this.state.aiThinking = false;
      this.state.activeGlobalEvent = null;
      this.state.refreshSelectedPromptId = null;
      this.state.promptRefresh = {
        round: this.engine.round,
        offeredPromptIds: playerOffers.slice(),
        currentPromptIds: this.engine.player.promptIds.slice(),
        globalEvent: globalEvent ? Object.assign({}, globalEvent) : null,
      };
      this._notify("prompt-refresh");
    }

    selectRefreshPrompt(promptId) {
      if (this.state.phase !== PHASES.PROMPT_REFRESH) {
        throw new Error("当前不在 Prompt 重构阶段。");
      }
      if (
        !this.state.promptRefresh ||
        !this.state.promptRefresh.offeredPromptIds.includes(promptId)
      ) {
        throw new Error("该 Prompt 不在本次重构候选中。");
      }

      this.state.refreshSelectedPromptId = promptId;
      this._notify("refresh-prompt-selected");
      return this.getState();
    }

    replaceRefreshPrompt(outgoingPromptId) {
      if (this.state.phase !== PHASES.PROMPT_REFRESH) {
        throw new Error("当前不在 Prompt 重构阶段。");
      }
      if (!this.state.refreshSelectedPromptId) {
        throw new Error("请先选择一个新的 Prompt。");
      }
      if (
        !this.state.promptRefresh ||
        !this.state.promptRefresh.currentPromptIds.includes(
          outgoingPromptId,
        )
      ) {
        throw new Error("请选择一个当前装备的 Prompt 进行替换。");
      }

      this._resolvePromptRefresh({
        incomingPromptId: this.state.refreshSelectedPromptId,
        outgoingPromptId,
      });
      return this.getState();
    }

    skipPromptRefresh() {
      if (this.state.phase !== PHASES.PROMPT_REFRESH) {
        return this.getState();
      }
      this._resolvePromptRefresh(null);
      return this.getState();
    }

    _resolvePromptRefresh(playerReplacement) {
      const pending = this.pendingPromptRefresh;
      if (!pending) {
        throw new Error("Prompt 重构数据不存在。");
      }

      this._clearAiTimer();
      this._clearTurnUnlockTimer();

      if (playerReplacement) {
        this.engine.replacePrompt(
          "player",
          playerReplacement.outgoingPromptId,
          playerReplacement.incomingPromptId,
        );
      }
      if (
        pending.enemyOutgoingPromptId &&
        pending.enemyIncomingPromptId
      ) {
        this.engine.replacePrompt(
          "enemy",
          pending.enemyOutgoingPromptId,
          pending.enemyIncomingPromptId,
        );
      }
      if (pending.globalEvent) {
        this.engine.applyGlobalEvent(pending.globalEvent);
        this.state.activeGlobalEvent = Object.assign(
          {},
          pending.globalEvent,
        );
      } else {
        this.state.activeGlobalEvent = null;
      }

      this.builds.player = {
        characterId: this.engine.player.characterId,
        promptIds: this.engine.player.promptIds.slice(),
      };
      this.builds.enemy = {
        characterId: this.engine.enemy.characterId,
        promptIds: this.engine.enemy.promptIds.slice(),
      };

      this.pendingPromptRefresh = null;
      this.state.phase = PHASES.BATTLE;
      this.state.promptRefresh = null;
      this.state.refreshSelectedPromptId = null;
      this.state.actionLocked = false;
      this.state.aiThinking = false;
      this._notify("prompt-refresh-resolved");
    }

    _handleBattleEnd(event) {
      this._clearAiTimer();
      this._clearTurnUnlockTimer();
      if (this.state.phase === PHASES.RESULT) {
        return;
      }

      this.state.phase = PHASES.RESULT;
      this.state.turn = this.engine ? this.engine.turn : this.state.turn;
      this.state.round = event.round;
      this.state.activeSide = this.engine
        ? this.engine.activeSide
        : this.state.activeSide;
      this.state.aiThinking = false;
      this.state.actionLocked = false;
      this.state.promptRefresh = null;
      this.state.refreshSelectedPromptId = null;
      this.pendingPromptRefresh = null;
      this.state.result = {
        winner: event.winner,
        reason: event.reason,
        round: event.round,
        totalRounds: event.totalRounds,
        playerTotalDamage: event.playerTotalDamage,
        enemyTotalDamage: event.enemyTotalDamage,
        playerHp: event.playerHp,
        enemyHp: event.enemyHp,
      };
      this._notify("battle-end");
    }

    playAgain() {
      this._clearAiTimer();
      this._clearTurnUnlockTimer();
      this.engine = null;
      this.builds = {};
      this.state = Object.assign(this._createInitialState(), {
        phase: PHASES.CHARACTER_SELECT,
        mode: "pve",
        setupSide: "player",
      });
      this._notify("play-again");
      return this.getState();
    }

    restart() {
      this._clearAiTimer();
      this._clearTurnUnlockTimer();
      this.engine = null;
      this.builds = {};
      this.state = this._createInitialState();
      this._notify("restart");
      return this.getState();
    }

    /**
     * 使用当前双方阵容重新开一局，不清空已选择的角色与 Prompt。
     */
    restartBattle() {
      this._clearAiTimer();
      this._clearTurnUnlockTimer();
      if (!this.builds.player || !this.builds.enemy) {
        return this.restart();
      }

      this.engine = null;
      this.state.phase = PHASES.BATTLE;
      this.state.result = null;
      this.state.aiThinking = false;
      this.state.actionLocked = false;
      this.state.activeSide = "player";
      this._startBattle(this.builds.player, this.builds.enemy);
      this._notify("battle-restarted");
      return this.getState();
    }

    dispose() {
      this._clearAiTimer();
      this._clearTurnUnlockTimer();
      this.subscribers.clear();
      this.battleEventSubscribers.clear();
    }

    _clearAiTimer() {
      this.aiTimerGeneration += 1;
      if (this.aiTimer !== null) {
        this.clearTimeoutFn(this.aiTimer);
        this.aiTimer = null;
      }
    }

    _clearTurnUnlockTimer() {
      this.turnUnlockGeneration += 1;
      if (this.turnUnlockTimer !== null) {
        this.clearTimeoutFn(this.turnUnlockTimer);
        this.turnUnlockTimer = null;
      }
    }

    _notify(reason) {
      const state = this.getState();
      this.subscribers.forEach(function notifySubscriber(listener) {
        try {
          listener(state, reason);
        } catch (error) {
          console.error("状态订阅器执行失败：", error);
        }
      });
    }
  }

  function renderFighterPanel(element, fighter) {
    if (!element || !fighter) {
      return;
    }

    const hpPercent = fighter.maxHp > 0
      ? clamp((fighter.hp / fighter.maxHp) * 100, 0, 100)
      : 0;
    const hpBar = element.querySelector("[data-hp-bar]");
    const hpText = element.querySelector("[data-hp-text]");

    element.dataset.fighterId = fighter.id;
    element.style.setProperty("--fighter-accent", fighter.accent);

    if (hpBar) {
      hpBar.style.width = hpPercent + "%";
      hpBar.classList.toggle("is-low", hpPercent <= 25);
    }
    if (hpText) {
      hpText.textContent = Math.max(0, fighter.hp) + " / " + fighter.maxHp;
    }

    element.classList.toggle(
      "is-stunned",
      fighter.status && fighter.status.stunnedActions > 0,
    );
    element.classList.toggle("is-defeated", fighter.hp <= 0);
  }

  function showDamageNumber(arena, payload) {
    if (!arena || !payload) {
      return null;
    }

    const number = document.createElement("span");
    number.className = "damage-float";

    if (payload.missed) {
      number.textContent = "MISS";
      number.classList.add("is-missed");
    } else if (payload.guarded) {
      number.textContent = "免疫";
      number.classList.add("is-guarded");
    } else {
      number.textContent = "-" + payload.amount;
    }

    number.classList.toggle("is-critical", Boolean(payload.critical));
    number.classList.toggle(
      "is-true-damage",
      payload.damageType === "真实",
    );
    number.dataset.targetId = payload.targetId || "";
    number.style.setProperty(
      "--damage-drift",
      Math.round((Math.random() - 0.5) * 56) + "px",
    );

    number.addEventListener(
      "animationend",
      function removeDamageNumber() {
        number.remove();
      },
      { once: true },
    );

    arena.appendChild(number);
    return number;
  }

  const animationTokens = new WeakMap();

  function mountTimedEffect(layer, effect, duration = 1300) {
    layer.appendChild(effect);
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      effect.remove();
    };
    effect.addEventListener("animationend", (event) => {
      if (event.target === effect && event.animationName === "vfx-cleanup") {
        cleanup();
      }
    });
    root.setTimeout(cleanup, duration + 700);
    return effect;
  }

  function createEffectNode(characterId, skillType) {
    const effect = document.createElement("div");
    effect.className =
      "vfx-effect vfx-" +
      characterId +
      (skillType === "ultimate" ? " is-ultimate" : " is-base");
    effect.style.setProperty(
      "--vfx-duration",
      skillType === "ultimate" ? "2.4s" : "2s",
    );
    return effect;
  }

  function getEffectPosition(element) {
    const layer = document.querySelector("#vfx-layer");
    if (!layer || !element) {
      return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    }
    const layerRect = layer.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left - layerRect.left + rect.width / 2,
      y: rect.top - layerRect.top + rect.height * 0.42,
    };
  }

  function playAttackAnimation(characterElement, side) {
    if (!characterElement) {
      return;
    }
    const avatar = characterElement.querySelector(".battle-avatar");
    if (!avatar) {
      return;
    }
    const token = Symbol("attack");
    animationTokens.set(characterElement, token);
    characterElement.classList.remove("attack-lunge");
    void characterElement.offsetWidth;
    characterElement.classList.add("attack-lunge");
    const finish = () => {
      if (animationTokens.get(characterElement) === token) {
        characterElement.classList.remove("attack-lunge");
      }
    };
    const animationName =
      side === "enemy" ? "enemy-lunge-3d" : "player-lunge-3d";
    avatar.addEventListener(
      "animationend",
      (event) => {
        if (event.animationName === animationName) {
          finish();
        }
      },
      { once: true },
    );
    root.setTimeout(finish, 650);
  }

  function playHitAnimation(characterElement) {
    if (!characterElement) {
      return;
    }
    const image = characterElement.querySelector(".battle-avatar img");
    if (!image) {
      return;
    }
    const token = Symbol("hit");
    animationTokens.set(image, token);
    characterElement.classList.remove("hit-shake");
    void characterElement.offsetWidth;
    characterElement.classList.add("hit-shake");
    const finish = () => {
      if (animationTokens.get(image) === token) {
        characterElement.classList.remove("hit-shake");
      }
    };
    image.addEventListener(
      "animationend",
      (event) => {
        if (event.animationName === "hit-image-flash") {
          finish();
        }
      },
      { once: true },
    );
    root.setTimeout(finish, 450);
  }

  function playVFX(character, skillType, options = {}) {
    if (typeof document === "undefined") {
      return null;
    }
    const characterId =
      typeof character === "string"
        ? character.toLowerCase()
        : String(
            (character && (character.characterId || character.id)) || "",
          ).toLowerCase();
    const layer = options.layer || document.querySelector("#vfx-layer");
    if (!layer || !["gpt", "claude", "deepseek", "sora"].includes(characterId)) {
      return null;
    }

    const sourcePanel =
      options.sourceElement ||
      document.querySelector(
        characterId === "claude"
          ? ".battle-side--player"
          : ".battle-side--player",
      );
    const targetPanel =
      options.targetElement || document.querySelector(".battle-side--enemy");
    const source = getEffectPosition(sourcePanel);
    const target = getEffectPosition(targetPanel);
    const isUltimate = skillType === "ultimate";
    const effect = createEffectNode(characterId, skillType);

    if (characterId === "gpt") {
      effect.style.setProperty("--vfx-start-x", source.x + "px");
      effect.style.setProperty("--vfx-start-y", source.y + "px");
      effect.style.setProperty("--vfx-dx", target.x - source.x + "px");
      effect.style.setProperty("--vfx-dy", target.y - source.y + "px");
      const wave = document.createElement("span");
      wave.className = "vfx-gpt-wave" + (isUltimate ? " is-ultimate" : "");
      effect.appendChild(wave);
      const burst = document.createElement("span");
      burst.className = "vfx-gpt-burst" + (isUltimate ? " is-ultimate" : "");
      burst.style.left = target.x + "px";
      burst.style.top = target.y + "px";
      effect.appendChild(burst);
      const halo = document.createElement("span");
      halo.className = "vfx-gpt-halo" + (isUltimate ? " is-ultimate" : "");
      halo.style.left = target.x + "px";
      halo.style.top = target.y + "px";
      effect.appendChild(halo);
    } else if (characterId === "claude") {
      const circle = document.createElement("span");
      circle.className = "vfx-claude-circle";
      circle.style.left = source.x + "px";
      circle.style.top = source.y + "px";
      effect.appendChild(circle);
      const shield = document.createElement("span");
      shield.className = "vfx-claude-shield";
      shield.style.left = source.x + "px";
      shield.style.top = source.y + "px";
      effect.appendChild(shield);
    } else if (characterId === "deepseek") {
      effect.style.left = target.x + "px";
      effect.style.top = target.y + "px";
      const bolt = document.createElement("span");
      bolt.className = "vfx-deepseek-bolt";
      effect.appendChild(bolt);
      const particleCount = isUltimate ? 48 : 32;
      for (let index = 0; index < particleCount; index += 1) {
        const bit = document.createElement("span");
        bit.className = "vfx-code-bit";
        bit.textContent = index % 2 === 0 ? "0" : "1";
        bit.style.setProperty(
          "--bit-x",
          Math.round((Math.random() - 0.5) * 190) + "px",
        );
        bit.style.setProperty(
          "--bit-y",
          Math.round((Math.random() - 0.5) * 150) + "px",
        );
        bit.style.setProperty("--bit-rotate", Math.round(Math.random() * 120 - 60) + "deg");
        bit.style.setProperty(
          "--bit-delay",
          (Math.random() * 0.32).toFixed(3) + "s",
        );
        bit.style.setProperty(
          "--bit-size",
          (0.75 + Math.random() * 0.9).toFixed(2) + "rem",
        );
        effect.appendChild(bit);
      }
    } else if (characterId === "sora") {
      effect.style.left = target.x + "px";
      effect.style.top = target.y + "px";
      const vortex = document.createElement("span");
      vortex.className = "vfx-sora-vortex";
      effect.appendChild(vortex);
      const colors = ["#ff4d9d", "#50e5ff", "#ffd44d", "#a979ff", "#5bffb1"];
      const blockCount = isUltimate ? 20 : 14;
      for (let index = 0; index < blockCount; index += 1) {
        const block = document.createElement("span");
        block.className = "vfx-canvas-block";
        block.style.setProperty("--block-color", colors[index % colors.length]);
        block.style.setProperty("--block-angle", index * (360 / blockCount) + "deg");
        block.style.setProperty(
          "--block-delay",
          (Math.random() * 0.24).toFixed(3) + "s",
        );
        block.style.setProperty(
          "--block-scale",
          (0.65 + Math.random() * 0.8).toFixed(2),
        );
        effect.appendChild(block);
      }
    }

    return mountTimedEffect(layer, effect, isUltimate ? 2400 : 2000);
  }

  function playCriticalFlash() {
    if (typeof document === "undefined") {
      return;
    }
    const layer = document.querySelector("#vfx-layer");
    if (!layer) {
      return;
    }
    const flash = document.createElement("div");
    flash.className = "critical-screen-flash";
    layer.appendChild(flash);
    flash.addEventListener(
      "animationend",
      () => flash.remove(),
      { once: true },
    );
    root.setTimeout(() => flash.remove(), 1400);
  }

  function playScreenShake() {
    if (typeof document === "undefined") {
      return;
    }
    const container =
      document.querySelector(".app-shell") || document.body;
    if (!container) {
      return;
    }
    container.classList.remove("screen-shake");
    void container.offsetWidth;
    container.classList.add("screen-shake");
    const handleAnimationEnd = (event) => {
      if (
        event.target === container &&
        event.animationName === "screen-shake"
      ) {
        container.classList.remove("screen-shake");
        container.removeEventListener("animationend", handleAnimationEnd);
      }
    };
    container.addEventListener("animationend", handleAnimationEnd);
    root.setTimeout(() => {
      container.classList.remove("screen-shake");
      container.removeEventListener("animationend", handleAnimationEnd);
    }, 560);
  }

  function showBondBanner(message) {
    if (typeof document === "undefined") {
      return;
    }
    const layer = document.querySelector("#vfx-layer");
    if (!layer) {
      return;
    }
    layer.querySelectorAll(".bond-trigger-banner").forEach((node) =>
      node.remove(),
    );
    const banner = document.createElement("div");
    banner.className = "bond-trigger-banner";
    banner.textContent = message;
    layer.appendChild(banner);
    banner.addEventListener(
      "animationend",
      () => banner.remove(),
      { once: true },
    );
    root.setTimeout(() => banner.remove(), 2800);
  }

  const api = {
    PHASES,
    BATTLE_STATUS,
    BATTLE_EVENTS,
    ROUND_LIMIT,
    API_KEY_STORAGE_KEY,
    BattleEngine,
    GameController,
    calculateDamage,
    createFighter,
    createRandomBuild,
    getCharacter,
    getPrompt,
    getAvailablePrompts,
    getPromptEffects,
    generateTrashTalk,
    sampleUnique,
    renderFighterPanel,
    showDamageNumber,
    playAttackAnimation,
    playHitAnimation,
    playVFX,
    playCriticalFlash,
    playScreenShake,
    showBondBanner,
  };

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.BattleGame = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
