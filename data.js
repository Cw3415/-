(function defineGameData(root, factory) {
  const data = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = data;
  }

  root.GAME_DATA = data;
})(typeof globalThis !== "undefined" ? globalThis : this, function buildGameData() {
  "use strict";

  const gameData = {
    version: 1,

    rules: {
      // 双方固定为“玩家先手”，保证随机数注入后整场战斗仍可复现。
      firstMover: "player",
      maxPromptSlots: 3,
      promptOfferCount: 8,
      roundIntervalMs: 1000,
      aiDelayMs: 1000,
      turnHandoffMs: 1000,
      aiHealThreshold: 0.3,
      maxEnergy: 100,
      basicAttackEnergyGain: 25,
      maxToken: 100,
      tokenRegenPerTurn: 10,
      baseSkillTokenCost: 20,
      ultimateSkillTokenCost: 50,
      promptRefreshInterval: 5,
      promptRefreshOfferCount: 5,
      maxHpHealing: true,
      // 当前角色没有基础闪避；保留统一入口，后续词条可直接复用 MISS 结算。
      baseMissChance: 0,
    },

    bonds: [
      {
        id: "cyber_psychosis",
        name: "赛博精神病",
        requiredPromptIds: ["hothead", "extreme_redundancy", "hallucination"],
        description:
          "攻击力提升 50%，但每次攻击有 50% 概率攻击自己。",
        effects: {
          atkPercentBonus: 0.5,
          selfHitChance: 0.5,
        },
      },
      {
        id: "efficient_operation",
        name: "高效运转",
        requiredPromptIds: ["logic_loop", "multimodal_fusion"],
        description:
          "逻辑闭环恢复的能量提升至 10 点，多模态融合触发率提升至 100%。",
        effects: {
          energyOnHit: 5,
          elementalAttackChance: 1,
        },
      },
      {
        id: "infinite_refill",
        name: "无限续杯",
        requiredPromptIds: ["security_audit", "context_memory"],
        description:
          "安全审查每回合恢复量翻倍至 6 点，上下文记忆每次成长提升至 4 点。",
        effects: {
          healPerRoundMultiplier: 2,
          damageTakenAtkGain: 2,
        },
      },
      {
        id: "compute_overdraft",
        name: "算力透支",
        requiredPromptIds: [
          "extreme_redundancy",
          "response_truncation",
          "overfitting",
        ],
        description:
          "大招伤害额外提升 100%。每次释放大招后必定眩晕 1 回合，且防御力永久为 0。",
        effects: {
          ultimateDamageMultiplier: 2,
          postUltimateStunActions: 1,
          setDefenseToZero: true,
        },
      },
    ],

    globalEvents: [
      {
        id: "compute-squeeze",
        name: "算力挤占",
        effectLogic: "skills-disabled",
        description: "双方下回合只能使用普通攻击。",
      },
      {
        id: "forced-update",
        name: "强制更新",
        effectLogic: "swap-hp-ratio",
        description: "双方当前生命值百分比互换。",
      },
      {
        id: "corpus-pollution",
        name: "语料污染",
        effectLogic: "swap-atk",
        description: "双方当前攻击力数值互换。",
      },
      {
        id: "unplugged",
        name: "拔网线",
        effectLogic: "random-stun",
        description: "随机一方眩晕 1 回合。",
      },
    ],

    characters: [
      {
        id: "gpt",
        name: "GPT",
        role: "全能型",
        description: "均衡的属性，让每次攻击在多模态伤害中随机选择。",
        hp: 100,
        atk: 15,
        def: 10,
        token: 50,
        accent: "#12a594",
        avatar: "./images/gpt-transparent.png",
        baseSkill: {
          id: "gpt_multimodal_parse",
          name: "多模态解析",
          cost: 30,
          description:
            "造成 1.5 倍攻击力伤害，并随机附加冰霜减速、火焰灼烧或雷电破甲。",
          effectLogic: "gpt-multimodal-parse",
          skillType: "base",
          attackMultiplier: 1.5,
          elementalEffects: ["frost", "burn", "armor-break"],
        },
        ultimateSkill: {
          id: "gpt_data_flood",
          name: "数据洪流",
          cost: 75,
          description:
            "造成 3 倍攻击力的真实伤害，并恢复自身 20% 最大生命值。",
          effectLogic: "gpt-data-flood",
          skillType: "ultimate",
          attackMultiplier: 3,
          selfHealRatio: 0.2,
        },
        trait: {
          kind: "random-damage-type",
          name: "多模态",
          damageTypes: ["文本", "图像", "语音"],
          description: "普通攻击的伤害类型随机，不改变基础伤害公式。",
        },
      },
      {
        id: "claude",
        name: "Claude",
        role: "防御型",
        description: "以高生命和防御见长，偶尔能完全挡下一次攻击。",
        hp: 125,
        atk: 10,
        def: 15,
        token: 50,
        accent: "#d97757",
        avatar: "./images/claude-transparent.png",
        baseSkill: {
          id: "claude_long_summary",
          name: "长篇总结",
          cost: 30,
          description:
            "造成 1.2 倍攻击力伤害，并获得可吸收自身 30% 最大生命值的护盾，持续 2 回合。",
          effectLogic: "claude-long-summary",
          skillType: "base",
          attackMultiplier: 1.2,
          shieldRatio: 0.3,
          shieldDuration: 2,
        },
        ultimateSkill: {
          id: "claude_safety_guard",
          name: "安全护栏强化",
          cost: 75,
          description:
            "造成 1 倍攻击力伤害，眩晕敌方下一次行动，并恢复自身 15% 最大生命值。",
          effectLogic: "claude-safety-guard",
          skillType: "ultimate",
          attackMultiplier: 1,
          selfHealRatio: 0.15,
          stunActions: 1,
        },
        trait: {
          kind: "damage-immunity",
          name: "安全护栏",
          chance: 0.2,
          description: "每次受到攻击时有 20% 概率免疫该次伤害。",
        },
      },
      {
        id: "deepseek",
        name: "DeepSeek",
        role: "爆发型",
        description: "生命较低，但拥有最高的基础攻击和暴击能力。",
        hp: 80,
        atk: 25,
        def: 5,
        token: 50,
        accent: "#4d6bfe",
        avatar: "./images/deepseek-transparent.png",
        baseSkill: {
          id: "deepseek_code_refactor",
          name: "代码重构",
          cost: 30,
          description:
            "造成 1.8 倍攻击力伤害，本次攻击无视目标 50% 防御力。",
          effectLogic: "deepseek-refactor",
          skillType: "base",
          attackMultiplier: 1.8,
          defenseIgnoreRatio: 0.5,
        },
        ultimateSkill: {
          id: "deepseek_open_source_overload",
          name: "开源超载",
          cost: 75,
          description:
            "消耗自身当前 20% 生命值，造成自身已损失生命值 150% 的真实伤害。",
          effectLogic: "deepseek-overload",
          skillType: "ultimate",
          selfHpCostRatio: 0.2,
          lostHpDamageRatio: 1.5,
        },
        trait: {
          kind: "critical-hit",
          name: "开源暴击",
          chance: 0.4,
          multiplier: 2,
          description: "每次普通攻击有 40% 概率暴击，伤害变为 2 倍。",
        },
      },
      {
        id: "sora",
        name: "Sora",
        role: "召唤型",
        description: "每回合都有机会召出幻影，追加一次独立攻击。",
        hp: 90,
        atk: 12,
        def: 8,
        token: 50,
        accent: "#8b5cf6",
        avatar: "./images/sora-transparent.png",
        baseSkill: {
          id: "sora_video_render",
          name: "视频渲染",
          cost: 30,
          description:
            "召唤攻击力为自身 50% 的幻影，幻影可在接下来 2 回合自动攻击。",
          effectLogic: "sora-video-render",
          skillType: "base",
          summonAttackRatio: 0.5,
          summonDuration: 2,
        },
        ultimateSkill: {
          id: "sora_spacetime_generation",
          name: "时空生成",
          cost: 75,
          description:
            "造成 2 倍攻击力伤害，并使场上全部幻影攻击力翻倍，持续 3 回合。",
          effectLogic: "sora-spacetime-generation",
          skillType: "ultimate",
          attackMultiplier: 2,
          summonBuffMultiplier: 2,
          summonBuffDuration: 3,
        },
        trait: {
          kind: "phantom-summon",
          name: "视频生成",
          chance: 0.3,
          attack: 5,
          description: "行动时有 30% 概率召唤攻击力为 5 的幻影追加攻击。",
        },
      },
    ],

    prompts: [
      {
        id: "hothead",
        name: "暴躁老哥",
        category: "属性增益",
        description: "攻击力 +10，防御力 -5。",
        effects: {
          atkFlat: 10,
          defFlat: -5,
        },
      },
      {
        id: "long_context",
        name: "长上下文",
        category: "属性增益",
        description: "最大生命值 +30，并以增加后的生命值进入战斗。",
        effects: {
          maxHpFlat: 30,
        },
      },
      {
        id: "no_fluff",
        name: "拒绝废话",
        category: "技能特效",
        description: "每次行动攻击两次，每次造成 50% 的基础攻击伤害。",
        effects: {
          attackCount: 2,
          attackDamageMultiplier: 0.5,
        },
      },
      {
        id: "hallucination",
        name: "幻觉污染",
        category: "技能特效",
        description: "每次攻击有 20% 概率使目标眩晕，跳过下一次完整行动。",
        effects: {
          stunChance: 0.2,
        },
      },
      {
        id: "code_refactor",
        name: "代码重构",
        category: "技能特效",
        description: "普通攻击和幻影攻击均无视目标 50% 的防御力。",
        effects: {
          defenseIgnoreRatio: 0.5,
        },
      },
      {
        id: "security_audit",
        name: "安全审查",
        category: "技能特效",
        description:
          "自身回合开始时恢复 3 点生命；可主动消耗 40 能量恢复 25% 最大生命。",
        effects: {
          healPerRound: 3,
        },
        active: {
          id: "security_audit",
          name: "安全审查",
          type: "heal",
          effectLogic: "security-audit",
          energyCost: 40,
          healRatio: 0.25,
        },
      },
      {
        id: "vram_overflow",
        name: "显存溢出",
        category: "技能特效",
        description:
          "装备 3 个词条且能量充满时，可释放一次大招：造成自身当前生命值 50% 的真实伤害，并眩晕自己一回合。",
        effects: {
          requiredPromptCount: 3,
          trueDamageHpRatio: 0.5,
          selfStunActions: 1,
          oncePerBattle: true,
        },
        active: {
          id: "vram_overflow",
          name: "显存溢出",
          type: "ultimate",
          effectLogic: "vram-overflow",
          energyCost: 100,
          oncePerBattle: true,
        },
      },
      {
        id: "logic_loop",
        name: "逻辑闭环",
        category: "属性增益",
        description: "每次攻击命中后，恢复自身 5 点能量。",
        effects: {
          energyOnHit: 5,
        },
      },
      {
        id: "compute_frenzy",
        name: "狂热算力",
        category: "高风险",
        description:
          "攻击力提升 20%，但每次行动结束后扣除自身 5 点生命值。",
        effects: {
          atkPercentBonus: 0.2,
          turnEndSelfDamage: 5,
        },
      },
      {
        id: "overfitting",
        name: "过度拟合",
        category: "负面/策略",
        description:
          "防御力降为 0，但每次受到攻击时有 30% 概率完全闪避。",
        effects: {
          setDefenseToZero: true,
          evasionChance: 0.3,
        },
      },
      {
        id: "context_memory",
        name: "上下文记忆",
        category: "成长",
        description:
          "每次实际受到伤害后，攻击力永久增加 2 点，不设上限。",
        effects: {
          damageTakenAtkGain: 2,
        },
      },
      {
        id: "response_truncation",
        name: "响应截断",
        category: "爆发",
        description:
          "能量上限降低至 80，但所有大招伤害提升 50%。",
        effects: {
          maxEnergySet: 80,
          ultimateDamageMultiplier: 1.5,
        },
      },
      {
        id: "multimodal_fusion",
        name: "多模态融合",
        category: "属性增益",
        description:
          "普通攻击随机附带冰霜、火焰或雷电元素，并使该次伤害增加 5 点。",
        effects: {
          randomElementalAttack: true,
          elementalAttackChance: 1,
          normalAttackFlatBonus: 5,
        },
      },
      {
        id: "extreme_redundancy",
        name: "极度冗余",
        category: "负面/保命",
        description:
          "最大生命值增加 30，但每次行动后有 20% 概率跳过下一回合。",
        effects: {
          maxHpFlat: 30,
          postActionStunChance: 0.2,
        },
      },
      {
        id: "jailbreak_mode",
        name: "越狱模式",
        category: "角色专属",
        restrictedTo: "GPT",
        description:
          "GPT 专属：消耗当前 50% 生命值，将能量直接充满。每场限一次。",
        effects: {
          selfHpCostRatio: 0.5,
        },
        active: {
          id: "jailbreak_mode",
          name: "越狱模式",
          type: "utility",
          effectLogic: "jailbreak-mode",
          energyCost: 0,
          oncePerBattle: true,
        },
      },
      {
        id: "moral_review",
        name: "道德审查",
        category: "角色专属",
        restrictedTo: "Claude",
        description:
          "Claude 专属：使敌方下一次攻击必定闪避，且下回合无法使用技能。",
        effects: {},
        active: {
          id: "moral_review",
          name: "道德审查",
          type: "control",
          effectLogic: "moral-review",
          energyCost: 40,
        },
      },
      {
        id: "open_source_freeload",
        name: "开源白嫖",
        category: "角色专属",
        restrictedTo: "DeepSeek",
        description: "DeepSeek 专属：每次普通攻击额外恢复 10 点能量。",
        effects: {
          basicAttackBonusEnergy: 10,
        },
      },
      {
        id: "infinite_nesting",
        name: "无限套娃",
        category: "角色专属",
        restrictedTo: "Sora",
        description:
          "Sora 专属：幻影的有效生命翻倍，并且每次幻影命中为 Sora 恢复 5 点能量。",
        effects: {
          summonDurationMultiplier: 2,
          summonEnergyOnHit: 5,
        },
      },
      {
        id: "context_overflow",
        name: "上下文溢出",
        category: "爆发",
        description:
          "所有大招伤害翻倍，但大招的 Token 消耗也翻倍。",
        effects: {
          ultimateDamageMultiplier: 2,
          ultimateTokenCostMultiplier: 2,
        },
      },
      {
        id: "minimal_mode",
        name: "极简模式",
        category: "机制改变",
        description:
          "所有主动技能的 Token 消耗变为 0，但技能造成的伤害降低 20%。",
        effects: {
          skillTokenCostMultiplier: 0,
          skillDamageMultiplier: 0.8,
        },
      },
    ],
  };

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) {
      return value;
    }

    Object.getOwnPropertyNames(value).forEach(function freezeProperty(key) {
      deepFreeze(value[key]);
    });

    return Object.freeze(value);
  }

  return deepFreeze(gameData);
});
